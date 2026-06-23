"""FastAPI entrypoint for the Telokine backend.

Run (dev):
    uvicorn telokine.server:app --reload --port 8000

The frontend connects to:
    GET  /health        -> liveness check
    WS   /ws/train      -> training control + live telemetry stream
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Telokine Backend", version="0.1.0")

# In dev the Vite server (port 1420) and this server (8000) are different
# origins; allow the frontend to connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "telokine-backend", "version": "0.1.0"}


@app.websocket("/ws/train")
async def train_ws(ws: WebSocket) -> None:
    """Training channel (skeleton — wired up in steps 4-6).

    Intended protocol:

      inbound ->
        {"type": "start", "scene": {...}, "rewards": [ {block}, ... ],
         "total_timesteps": 200000 }

      outbound ->
        {"type": "telemetry", "step": n, "episode": e,
         "reward": r, "success_rate": p, "elapsed": s}
        {"type": "frame", "objects": [ {"id": "...", "pos": [x,y,z],
                                        "rot": [x,y,z,w]}, ... ]}
        {"type": "done", "model": "<path to trained policy>"}
    """
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            # Placeholder: acknowledge until the real training loop (step 4) lands.
            await ws.send_json({"type": "ack", "received": msg.get("type")})
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        return
