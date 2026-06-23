# Telokine

A visual AI training sandbox. Build a creature, define goals with blocks, press
**Train**, and watch intelligence emerge through trial and error — without ever
seeing the words *tensor*, *neural network*, or *gradient descent*.

The goal isn't the most powerful AI training system. It's the **easiest** one.
If a researcher thinks "this is too simple" and a beginner thinks "I can build
something with this in five minutes," we've succeeded.

---

## The three layers

| Layer | What it is | Tech |
|-------|-----------|------|
| **1. Visual** | Everything the user touches: 3D viewport, block editor, graphs, buttons | React + Vite + TypeScript + React Three Fiber (Three.js), in a Tauri desktop shell |
| **2. Simulation** | Gravity, collisions, movement, joints, balance — invisible to the user | Python + **MuJoCo**, behind a Gymnasium interface |
| **3. Learning** | Neural networks, PPO, GPU training — barely visible | Python + **Stable-Baselines3** (PyTorch, GPU) over a FastAPI/WebSocket bridge |

The user's innovation surface is Layer 1. Layers 2 and 3 are solved problems we
stand on, not reinvent.

## Status — step 1 of 14

- [x] **3D viewport** — floor, cube agent, target sphere, orbit/zoom, add & drag
      objects, selection. (this release)
- [ ] Physics simulation
- [ ] Cube agent
- [ ] Training backend
- [ ] Reward blocks
- [ ] Train button
- [ ] Progress graphs
- [ ] Save/load projects
- [ ] Creature builder → joints → templates → humanoids → sharing → marketplace

Full breakdown: [`docs/ROADMAP.md`](docs/ROADMAP.md).
Architecture & data flow: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run the frontend (the app)

```bash
npm install
npm run dev
```

Open <http://localhost:1420>. You'll see the 3D editor: a cube agent, an orange
target, an object palette on the left, and the (disabled) **Train** button.

> The viewport runs in the browser during development. The Tauri desktop shell
> wraps this exact frontend — see **Desktop window (Tauri)** below to enable it.

## Run the backend (simulation + learning)

```bash
cd backend
uv sync                                              # creates .venv + installs deps
uv run uvicorn telokine.server:app --reload --port 8000
```

The backend is a structural scaffold right now (steps 2-6 wire up the real
physics and training). Health check: <http://localhost:8000/health>.

---

## Desktop window (Tauri)

You chose Tauri for the app shell. Its Linux system libraries aren't installed
yet, so the native window is one command away. Install them, then scaffold the
Rust shell around this frontend:

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
                    libayatana-appindicator3-dev libssl-dev
npm create tauri-app@latest   # point it at ./  , Vite, port 1420 — see docs
```

Because the frontend is already on port 1420 (Tauri's convention) and built with
Vite, enabling the desktop window requires **zero frontend changes**.

---

## Layout

```
Telokine/
  src/                 # Layer 1 — the app (React + Three.js)
    viewport/          # 3D scene, object meshes, camera
    components/        # top bar, palette, status bar
    store/             # zustand scene store (single source of truth)
  backend/             # Layers 2 & 3 — Python sim + RL
  docs/
    ARCHITECTURE.md
    ROADMAP.md
```
