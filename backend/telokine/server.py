"""FastAPI entrypoint for the Telokine backend.

Run (dev):
    uv run uvicorn telokine.server:app --reload --port 8000

Channels:
    GET  /health        -> liveness check
    WS   /ws/sim        -> live physics rollout (step 2)
    WS   /ws/train      -> training control + telemetry (steps 4-6)
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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


# --------------------------------------------------------------------------
# /ws/sim — live physics rollout (step 2)
# --------------------------------------------------------------------------
#
# Protocol:
#   inbound  -> {"type":"start","scene":{...},"seed":?,"max_steps":?}
#               {"type":"stop"}
#   outbound -> {"type":"started"}
#               {"type":"frame","objects":[{"id","pos":[x,y,z],"rot":[x,y,z,w]}]}
#               {"type":"stopped"}
#               {"type":"error","message":...}
#
# A rollout streams frames at ~60fps in real time and auto-stops once the agent
# settles (low speed for a while) or max_steps is reached.

TARGET_FRAME_DT = 0.016  # seconds of wall-clock between streamed frames (~60fps)


async def _run_rollout(ws: WebSocket, sim: Any, stop: dict[str, bool], max_steps: int) -> None:
    """Step the simulator and stream frames until stopped, settled, or max_steps."""
    try:
        # Initial frame so the user sees the agent at its (lifted) start pose.
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
                    break  # the cube has come to rest
            else:
                settled = 0

            # Pace to real time so the drop looks physical, not instant.
            elapsed = time.monotonic() - last
            last = time.monotonic()
            if elapsed < TARGET_FRAME_DT:
                await asyncio.sleep(TARGET_FRAME_DT - elapsed)
    finally:
        await ws.send_json({"type": "stopped"})


@app.websocket("/ws/sim")
async def sim_ws(ws: WebSocket) -> None:
    await ws.accept()
    run_task: asyncio.Task | None = None
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
                # Tear down any in-flight rollout first.
                if run_task and not run_task.done():
                    stop["stop"] = True
                    await run_task

                try:
                    from telokine.sim import Simulator

                    sim = Simulator(
                        msg.get("scene", {}),
                        seed=msg.get("seed"),
                    )
                except Exception as exc:  # noqa: BLE001
                    await ws.send_json({"type": "error", "message": str(exc)})
                    continue

                await ws.send_json({"type": "started"})
                stop = {"stop": False}
                run_task = asyncio.create_task(
                    _run_rollout(ws, sim, stop, int(msg.get("max_steps", 1500)))
                )

            elif kind == "stop":
                stop["stop"] = True
                if run_task and not run_task.done():
                    await run_task
                # _run_rollout already emitted "stopped".

    except WebSocketDisconnect:
        if run_task and not run_task.done():
            run_task.cancel()


# --------------------------------------------------------------------------
# /ws/train — training channel (skeleton for steps 4-6)
# --------------------------------------------------------------------------
@app.websocket("/ws/train")
async def train_ws(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue
            await ws.send_json({"type": "ack", "received": msg.get("type")})
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        return
