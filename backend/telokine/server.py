"""FastAPI entrypoint for the Telokine backend.

Run (dev):
    uv run uvicorn telokine.server:app --reload --port 8000

Channels:
    GET  /health        -> liveness check
    WS   /ws/sim        -> live physics rollout, or a trained-policy rollout
    WS   /ws/train      -> training control + telemetry stream
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Telokine Backend", version="0.1.0")

# In dev the Vite server (1420) and this server (8000) differ in origin; let the
# frontend connect freely.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "telokine-backend", "version": "0.1.0"}


@app.get("/policies/{name}")
def policy_exists(name: str) -> dict[str, Any]:
    """Report whether a trained policy file is available on disk."""
    path = os.path.join("policies", f"{name}.zip")
    return {"name": name, "exists": os.path.exists(path)}


@app.get("/policies")
def list_policies() -> dict[str, Any]:
    """List all saved trained policies."""
    os.makedirs("policies", exist_ok=True)
    policies = []
    for fname in os.listdir("policies"):
        if fname.endswith(".zip"):
            fpath = os.path.join("policies", fname)
            size = os.path.getsize(fpath)
            mtime = os.path.getmtime(fpath)
            policies.append({
                "name": fname[:-4],  # remove .zip
                "size": size,
                "created": mtime,
            })
    return {"policies": sorted(policies, key=lambda p: p["created"], reverse=True)}


@app.delete("/policies/{name}")
def delete_policy(name: str) -> dict[str, Any]:
    """Delete a saved trained policy."""
    path = os.path.join("policies", f"{name}.zip")
    if os.path.exists(path):
        os.remove(path)
        return {"success": True, "message": f"Deleted policy '{name}'"}
    return {"success": False, "message": f"Policy '{name}' not found"}


@app.get("/blocks")
def list_blocks() -> dict[str, Any]:
    """List all saved block configurations."""
    os.makedirs("blocks", exist_ok=True)
    blocks = []
    for fname in os.listdir("blocks"):
        if fname.endswith(".json"):
            fpath = os.path.join("blocks", fname)
            mtime = os.path.getmtime(fpath)
            blocks.append({
                "name": fname[:-5],  # remove .json
                "created": mtime,
            })
    return {"blocks": sorted(blocks, key=lambda b: b["created"], reverse=True)}


@app.get("/blocks/{name}")
def load_blocks(name: str) -> dict[str, Any]:
    """Load a saved block configuration."""
    path = os.path.join("blocks", f"{name}.json")
    if not os.path.exists(path):
        return {"error": f"Block configuration '{name}' not found"}
    try:
        with open(path, "r") as f:
            config = json.load(f)
        return {"name": name, "blocks": config}
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/blocks/{name}")
def save_blocks(name: str, body: dict[str, Any]) -> dict[str, Any]:
    """Save a block configuration."""
    os.makedirs("blocks", exist_ok=True)
    path = os.path.join("blocks", f"{name}.json")
    try:
        with open(path, "w") as f:
            json.dump(body.get("blocks", []), f, indent=2)
        return {"success": True, "name": name, "message": f"Saved block configuration '{name}'"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.delete("/blocks/{name}")
def delete_blocks(name: str) -> dict[str, Any]:
    """Delete a saved block configuration."""
    path = os.path.join("blocks", f"{name}.json")
    if os.path.exists(path):
        os.remove(path)
        return {"success": True, "message": f"Deleted block configuration '{name}'"}
    return {"success": False, "message": f"Block configuration '{name}' not found"}


# --------------------------------------------------------------------------
# Built frontend (single-process serving: API + websocket + SPA on one origin).
# If the frontend has been built (../dist), serve it from here so the user only
# needs one server. Routes below must come BEFORE the catch-all at the bottom.
# --------------------------------------------------------------------------
_FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
if os.path.isdir(os.path.join(_FRONTEND_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIR, "assets")), name="assets")


# --------------------------------------------------------------------------
# Shared: pump messages produced by a worker thread onto the websocket.
# --------------------------------------------------------------------------
async def _pump(ws: WebSocket, outbox: asyncio.Queue) -> None:
    """Forward queued messages to the client until a None sentinel arrives."""
    while True:
        msg = await outbox.get()
        if msg is None:
            return
        await ws.send_json(msg)


# --------------------------------------------------------------------------
# /ws/sim — live physics rollout (step 2) OR trained-policy rollout (step 4)
# --------------------------------------------------------------------------
#
# start message:
#   {"type":"start","scene":{...},"seed":?,"max_steps":?,"policy":?<name>}
# When "policy" is given, a trained SB3 policy drives the agent instead of it
# free-falling. Used by the Run button after a Train completes.

TARGET_FRAME_DT = 0.016  # ~60fps for the free-physics rollout


async def _run_rollout(ws: WebSocket, sim: Any, stop: dict[str, bool], max_steps: int) -> None:
    try:
        await ws.send_json(sim.frame().to_dict())
        settled = 0
        last = time.monotonic()
        for _ in range(max_steps):
            if stop["stop"]:
                break
            sim.step()
            await ws.send_json(sim.frame().to_dict())
            if sim.agent_speed() < 0.05:
                settled += 1
                if settled > 30:
                    break
            else:
                settled = 0
            elapsed = time.monotonic() - last
            last = time.monotonic()
            if elapsed < TARGET_FRAME_DT:
                await asyncio.sleep(TARGET_FRAME_DT - elapsed)
    finally:
        await ws.send_json({"type": "stopped"})


def _run_policy_rollout(
    scene: dict, policy_name: str, outbox: asyncio.Queue, loop: asyncio.AbstractEventLoop,
    stop: dict[str, bool],
) -> None:
    """Worker thread: drive a trained policy and enqueue frames."""
    from telokine.train import rollout_policy

    def emit(msg: dict) -> None:
        loop.call_soon_threadsafe(outbox.put_nowait, msg)

    try:
        path = os.path.join("policies", f"{policy_name}.zip")
        rollout_policy(
            scene=scene,
            model_path=path,
            on_frame=emit,
            should_stop=lambda: stop["stop"],
            max_steps=400,
        )
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": str(exc)})
    finally:
        emit({"type": "stopped"})


@app.websocket("/ws/sim")
async def sim_ws(ws: WebSocket) -> None:
    await ws.accept()
    run_task: asyncio.Task | None = None
    pump_task: asyncio.Task | None = None
    outbox: asyncio.Queue = asyncio.Queue()
    stop: dict[str, bool] = {"stop": False}

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            kind = msg.get("type")

            if kind == "start":
                # Tear down anything in flight.
                stop["stop"] = True
                if run_task and not run_task.done():
                    await run_task
                if pump_task and not pump_task.done():
                    await outbox.put(None)
                    await pump_task

                stop = {"stop": False}
                outbox = asyncio.Queue()
                pump_task = asyncio.create_task(_pump(ws, outbox))

                scene = msg.get("scene", {})
                policy = msg.get("policy")

                if policy:
                    await ws.send_json({"type": "started", "mode": "policy", "policy": policy})
                    run_task = asyncio.create_task(
                        asyncio.to_thread(
                            _run_policy_rollout, scene, policy, outbox,
                            asyncio.get_running_loop(), stop,
                        )
                    )
                else:
                    try:
                        from telokine.sim import Simulator
                        sim = Simulator(scene, seed=msg.get("seed"))
                    except Exception as exc:  # noqa: BLE001
                        await ws.send_json({"type": "error", "message": str(exc)})
                        continue
                    await ws.send_json({"type": "started", "mode": "physics"})
                    run_task = asyncio.create_task(
                        _run_rollout(ws, sim, stop, int(msg.get("max_steps", 1500)))
                    )

            elif kind == "stop":
                stop["stop"] = True
                if run_task and not run_task.done():
                    await run_task
                if pump_task and not pump_task.done():
                    await outbox.put(None)
                    await pump_task
                pump_task = None

    except WebSocketDisconnect:
        stop["stop"] = True
        if run_task and not run_task.done():
            run_task.cancel()


# --------------------------------------------------------------------------
# /ws/train — PPO training with live telemetry + preview frames (step 4)
# --------------------------------------------------------------------------
#
# start: {"type":"start","scene":{...},"total_timesteps":?}
# stop:  {"type":"stop"}
# outbound: started, telemetry (reward/success/progress), frame (policy preview),
#           done {model}, error {message}
#
# Training (model.learn) is blocking and CPU/GPU-heavy, so it runs in a worker
# thread (asyncio.to_thread). The telemetry callback it invokes is on the worker
# thread, so it pushes messages onto an asyncio queue via call_soon_threadsafe;
# a pump coroutine forwards them to the client.

def _run_train(
    scene: dict, rewards: list[dict], total_timesteps: int, model_id: str,
    outbox: asyncio.Queue, loop: asyncio.AbstractEventLoop, stop: dict[str, bool],
) -> None:
    from telokine.train import train

    def emit(msg: dict) -> None:
        loop.call_soon_threadsafe(outbox.put_nowait, msg)

    try:
        train(
            scene=scene,
            rewards=rewards,
            total_timesteps=total_timesteps,
            on_telemetry=emit,
            should_stop=lambda: stop["stop"],
            model_id=model_id,
        )
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": str(exc)})
    finally:
        emit({"type": "finished"})


@app.websocket("/ws/train")
async def train_ws(ws: WebSocket) -> None:
    await ws.accept()
    train_task: asyncio.Task | None = None
    pump_task: asyncio.Task | None = None
    outbox: asyncio.Queue = asyncio.Queue()
    stop: dict[str, bool] = {"stop": False}

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            kind = msg.get("type")

            if kind == "start":
                if train_task and not train_task.done():
                    stop["stop"] = True
                    await train_task
                if pump_task and not pump_task.done():
                    await outbox.put(None)
                    await pump_task

                stop = {"stop": False}
                outbox = asyncio.Queue()
                pump_task = asyncio.create_task(_pump(ws, outbox))

                model_id = f"policy_{uuid.uuid4().hex[:8]}"
                total = int(msg.get("total_timesteps", 150_000))
                rewards = msg.get("rewards", [])
                scene = msg.get("scene", {})
                scene["training"] = {
                    "episode_length": msg.get("episode_length"),
                    "action_power": msg.get("action_power"),
                    "curriculum": msg.get("curriculum"),
                }
                await ws.send_json({"type": "started", "model_id": model_id, "total_timesteps": total})
                train_task = asyncio.create_task(
                    asyncio.to_thread(
                        _run_train, scene, rewards, total, model_id,
                        outbox, asyncio.get_running_loop(), stop,
                    )
                )

            elif kind == "stop":
                stop["stop"] = True
                if train_task and not train_task.done():
                    await train_task

    except WebSocketDisconnect:
        stop["stop"] = True
        if train_task and not train_task.done():
            train_task.cancel()


# --------------------------------------------------------------------------
# SPA catch-all — must be LAST so it doesn't shadow /health, /policies, /ws/*.
# Serves the built frontend's index.html for any non-API GET.
# --------------------------------------------------------------------------
if os.path.isdir(os.path.join(_FRONTEND_DIR, "assets")):

    @app.get("/{full_path:path}")
    def _spa(full_path: str):
        # Prefer a real file if one exists (e.g. favicon), else index.html.
        candidate = os.path.join(_FRONTEND_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))
print("Telokine backend ready. Serving SPA from", _FRONTEND_DIR)
