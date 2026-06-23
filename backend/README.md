# Telokine backend

Layer 2 (simulation) + Layer 3 (learning). The frontend is the product; this is
the engine the user never sees.

## Tech

- **MuJoCo** — physics (gravity, collisions, joints, balance)
- **Gymnasium** — environment interface
- **Stable-Baselines3 (PPO)** — reinforcement learning, on the GPU
- **FastAPI + WebSocket** — control + live telemetry to the frontend

## Run (dev)

```bash
cd backend
uv sync                          # creates .venv, installs core deps + the project
uv run uvicorn telokine.server:app --reload --port 8000
```

Heavy ML deps (MuJoCo / torch / SB3) are gated behind the `ml` extra. Install
them when we reach step 2 (physics):

```bash
uv sync --extra ml
```

## Test

```bash
uv run pytest
```

## Layout

```
backend/
  pyproject.toml
  telokine/
    server.py   # FastAPI + /ws/train websocket protocol
    env.py      # Gymnasium env over MuJoCo (scene -> physics)     [step 2-4]
    reward.py   # block config -> per-step reward signal           [step 5]
    train.py    # PPO loop + telemetry callback                    [step 4-6]
  tests/
```
