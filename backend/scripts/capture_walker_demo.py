#!/usr/bin/env python3
"""Record a real MuJoCo+PPO walker training session for GitHub Pages replay.

Writes public/walker-demo.json — frames and telemetry captured from the same
preview pipeline as local Train.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from telokine.train import train, rollout_policy  # noqa: E402

OUT = ROOT / "public" / "walker-demo.json"
TOTAL_STEPS = 40_000

# Must match src/data/walkerDemoScene.ts ids and geometry.
WALKER_SCENE = {
    "objects": [
        {
            "id": "walker-body",
            "type": "cube",
            "role": "agent",
            "position": [-2, 1.05, 0],
            "rotation": [0, 0, 0],
            "dimensions": [1.1, 0.42, 0.6],
            "size": 1,
            "radius": 0.5,
            "weight": 2,
            "friction": 0.8,
            "pinned": False,
            "color": "#c9933f",
            "attachedTo": None,
            "connectedTo": None,
            "jointType": "hinge",
            "anchor": [0, 0, 0],
            "connectedAnchor": [0, 0, 0],
            "axis": [0, 1, 0],
            "motorStrength": 2.5,
            "controlMode": "passive",
            "sensorChannel": "distance_to_target",
        },
        {
            "id": "walker-leg-l",
            "type": "beam",
            "role": "prop",
            "position": [-2, 0.5, -0.36],
            "rotation": [0, 0, 0.35],
            "dimensions": [0.24, 1.1, 0.24],
            "size": 1,
            "radius": 0.5,
            "weight": 0.7,
            "friction": 0.5,
            "pinned": False,
            "color": "#b9c0c3",
            "attachedTo": None,
            "connectedTo": None,
            "jointType": "hinge",
            "anchor": [0, 0, 0],
            "connectedAnchor": [0, 0, 0],
            "axis": [0, 1, 0],
            "motorStrength": 2.5,
            "controlMode": "passive",
            "sensorChannel": "distance_to_target",
        },
        {
            "id": "walker-motor-l",
            "type": "motor",
            "role": "connector",
            "position": [-2, 0.84, -0.36],
            "rotation": [0, 0, 0],
            "dimensions": [1, 1, 1],
            "size": 0.38,
            "radius": 0.26,
            "weight": 1,
            "friction": 0.5,
            "pinned": True,
            "color": "#a86f37",
            "attachedTo": "walker-body",
            "connectedTo": "walker-leg-l",
            "jointType": "hinge",
            "anchor": [-2, 0.84, -0.36],
            "connectedAnchor": [-2, 0.5, -0.36],
            "axis": [0, 0, 1],
            "motorStrength": 4,
            "controlMode": "torque",
            "sensorChannel": "distance_to_target",
        },
        {
            "id": "walker-leg-r",
            "type": "beam",
            "role": "prop",
            "position": [-2, 0.5, 0.36],
            "rotation": [0, 0, -0.35],
            "dimensions": [0.24, 1.1, 0.24],
            "size": 1,
            "radius": 0.5,
            "weight": 0.7,
            "friction": 0.5,
            "pinned": False,
            "color": "#b9c0c3",
            "attachedTo": None,
            "connectedTo": None,
            "jointType": "hinge",
            "anchor": [0, 0, 0],
            "connectedAnchor": [0, 0, 0],
            "axis": [0, 1, 0],
            "motorStrength": 2.5,
            "controlMode": "passive",
            "sensorChannel": "distance_to_target",
        },
        {
            "id": "walker-motor-r",
            "type": "motor",
            "role": "connector",
            "position": [-2, 0.84, 0.36],
            "rotation": [0, 0, 0],
            "dimensions": [1, 1, 1],
            "size": 0.38,
            "radius": 0.26,
            "weight": 1,
            "friction": 0.5,
            "pinned": True,
            "color": "#a86f37",
            "attachedTo": "walker-body",
            "connectedTo": "walker-leg-r",
            "jointType": "hinge",
            "anchor": [-2, 0.84, 0.36],
            "connectedAnchor": [-2, 0.5, 0.36],
            "axis": [0, 0, 1],
            "motorStrength": 4,
            "controlMode": "torque",
            "sensorChannel": "distance_to_target",
        },
        {
            "id": "walker-target",
            "type": "target",
            "role": "target",
            "position": [4, 0.5, 0],
            "rotation": [0, 0, 0],
            "dimensions": [1, 1, 1],
            "size": 1,
            "radius": 0.5,
            "weight": 1,
            "friction": 0.5,
            "pinned": False,
            "color": "#d6a246",
            "attachedTo": None,
            "connectedTo": None,
            "jointType": "hinge",
            "anchor": [0, 0, 0],
            "connectedAnchor": [0, 0, 0],
            "axis": [0, 1, 0],
            "motorStrength": 2.5,
            "controlMode": "passive",
            "sensorChannel": "distance_to_target",
        },
    ],
    "training": {"episode_length": 250, "action_power": 1, "curriculum": 0.25},
}

REWARDS = [
    {"id": "rw-upright", "kind": "reward", "name": "Stay Upright", "weight": 1.6},
    {"id": "rw-approach", "kind": "reward", "name": "Approach Target", "weight": 1.0},
    {"id": "pn-fall", "kind": "penalty", "name": "Fall", "weight": 2.4},
]


def _round_obj(obj: dict) -> dict:
    return {
        "id": obj["id"],
        "pos": [round(float(v), 4) for v in obj["pos"]],
        "rot": [round(float(v), 5) for v in obj["rot"]],
    }


def main() -> None:
    os.environ.setdefault("TELOKINE_DEVICE", "cpu")
    os.environ.setdefault("TELOKINE_N_ENVS", "4")

    frames: list[dict] = []
    telemetry: list[dict] = []
    t0 = time.time()

    def emit(msg: dict) -> None:
        now = round(time.time() - t0, 3)
        if msg.get("type") == "frame":
            frames.append(
                {
                    "t": now,
                    "objects": [_round_obj(o) for o in msg.get("objects", [])],
                }
            )
        elif msg.get("type") == "telemetry":
            telemetry.append(
                {
                    "t": now,
                    "step": int(msg.get("step", 0)),
                    "episode": int(msg.get("episode", 0)),
                    "reward": round(float(msg.get("reward", 0)), 4),
                    "success_rate": round(float(msg.get("success_rate", 0)), 4),
                    "elapsed": round(float(msg.get("elapsed", 0)), 1),
                    "progress": round(float(msg.get("progress", 0)), 4),
                    "out_of_bounds_metric": round(float(msg.get("out_of_bounds_metric", 0)), 4),
                }
            )

    print(f"Training walker for {TOTAL_STEPS} steps…")
    model_path = train(
        WALKER_SCENE,
        REWARDS,
        TOTAL_STEPS,
        emit,
        lambda: False,
        model_id="walker-demo",
    )

    run_frames: list[list[dict]] = []

    def on_run(msg: dict) -> None:
        if msg.get("type") == "frame":
            run_frames.append([_round_obj(o) for o in msg.get("objects", [])])

    print("Recording trained rollout…")
    rollout_policy(WALKER_SCENE, model_path, on_run, lambda: False, max_steps=400, seed=42)

    payload = {
        "version": 1,
        "totalTimesteps": TOTAL_STEPS,
        "duration": round(time.time() - t0, 2),
        "frames": frames,
        "telemetry": telemetry,
        "runFrames": run_frames,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT} ({size_kb:.0f} KB, {len(frames)} train frames, {len(run_frames)} run frames)")


if __name__ == "__main__":
    main()
