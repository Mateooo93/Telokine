# Telokine

train a robot without writing code. build stuff in 3d, connect motors, drag reward blocks, hit train, watch it learn

demo (ui only): https://mateooo93.github.io/Telokine/ — use **Simulate train** for a browser-only fake run  
code: https://github.com/Mateooo93/Telokine

![screenshot](docs/screenshot-walker.png)

github pages is just the frontend. training needs the backend on your computer

## run it

```bash
npm install
npm run dev
```

```bash
cd backend
uv sync --extra ml
uv run uvicorn telokine.server:app --port 8000
```

`--extra ml` installs MuJoCo, PyTorch, and Stable-Baselines3 for training. Without it you'll get `No module named 'stable_baselines3'`.

training is heavy (4 parallel sims + optional GPU). if your browser or pc struggles, lower the Budget slider or run with fewer parallel envs:

```bash
TELOKINE_N_ENVS=2 TELOKINE_DEVICE=cpu uv run uvicorn telokine.server:app --port 8000
```

open http://localhost:1420, load the walker template, hit train then run trained

no gpu needed it falls back to cpu

## quick tips

motors only move the robot. no motor = brick  
save build / load build in the top bar so you dont lose your robot  
press R to reset the camera  
library saves policies and block configs (needs backend running)

made for stardance by mateo
