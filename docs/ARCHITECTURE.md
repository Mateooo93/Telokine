# Architecture

## The three layers, mapped to code

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Layer 1 — Visual (src/, React + Three.js, Tauri shell)       │
 │                                                                │
 │   3D viewport · object palette · block editor · graphs         │
 └───────────────┬──────────────────────────────────▲───────────┘
                 │  HTTP: control (start/stop, config)│  WS: live
                 ▼                                     │  telemetry +
        ┌─────────────────────────────────┐            │  sim frames
        │  Layer 2 — Simulation           │            │
        │  (backend/telokine/env.py)       │            │
        │  MuJoCo: gravity, collisions,    │            │
        │  joints, balance                 │            │
        └───────────────┬─────────────────┘            │
                        │ reward each step               │
                        ▼                                │
        ┌─────────────────────────────────┐            │
        │  Layer 3 — Learning             │────────────┘
        │  (backend/telokine/train.py)     │
        │  Stable-Baselines3 PPO on GPU    │
        └─────────────────────────────────┘
```

## The single contract between layers

The **scene object model** (`src/viewport/types.ts`) is the source of truth.
The frontend serializes it to JSON and the backend rebuilds the identical
physics world from it, so **what you edit is exactly what trains**.

```ts
interface SceneObject {
  id: string
  type: 'cube' | 'sphere' | 'capsule' | 'target' | 'floor'
  position: [number, number, number]
  color: string
  size: number
  radius: number
  weight: number
  friction: number
  role: 'agent' | 'target' | 'static' | 'floor'
}
```

## How a "Train" press flows

1. User drags reward blocks ("Approach Target", "Penalty Falling") in the editor.
2. Press **Train**. Frontend sends over WebSocket:
   ```json
   { "type": "start", "scene": {…SceneObjects…},
     "rewards": [ {…RewardBlock…} ], "total_timesteps": 200000 }
   ```
3. Backend compiles blocks (`reward.compile_blocks`), builds a MuJoCo env from
   the scene (`env.py`), and runs PPO (`train.py`) on the GPU.
4. A callback streams back, every step:
   - `telemetry` → reward, episode, success rate (feeds the graphs)
   - `frame` → per-object transforms (the viewport switches from
     "editor" mode to "mirror" mode and re-renders the live sim)
5. On completion, `done` returns the saved policy path; **Run** replays it.

## Why this split

- **No reinventing.** MuJoCo solves physics; SB3 solves RL; Three.js solves
  rendering. We build the *experience* on top.
- **One source of truth.** The scene model is shared, so editor and trainer
  never diverge.
- **GPU where it counts.** Training stays on the GPU; the browser only mirrors.
- **The user sees behavior, not implementation.** Blocks → reward → learning is
  invisible. They press a button and watch a graph climb.
