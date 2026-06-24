"""Layer 3: the PPO training loop (Stable-Baselines3).

The user presses Train; this is what happens behind the curtain:

    4 parallel CubeAgentEnv instances  (CPU, one per process)
        -> PPO with an MLP policy       (GPU)
        -> a callback streams telemetry (reward, success rate, progress) and
           periodic live-preview frames of the learning policy back to the UI

The user sees none of PPO, the policy network, or the gradient. They see a
reward graph climbing and the cube getting better at reaching the target.
"""
from __future__ import annotations

import os
import time
import functools
import threading
from collections import deque
from typing import Callable, Any

import numpy as np

TelemetryFn = Callable[[dict], None]
StopFn = Callable[[], bool]

ML_INSTALL_HINT = "Training deps missing. Run: cd backend && uv sync --extra ml"


def _training_n_envs() -> int:
    """Parallel env count. Lower = less RAM/CPU (default 4). Override with TELOKINE_N_ENVS."""
    raw = os.environ.get("TELOKINE_N_ENVS", "4").strip()
    try:
        return max(1, min(8, int(raw)))
    except ValueError:
        return 4


def _require_ml() -> None:
    try:
        import stable_baselines3  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(ML_INSTALL_HINT) from exc


def pick_device() -> str:
    """Pick the torch device for PPO: CUDA when healthy, otherwise CPU.

    Override with ``TELOKINE_DEVICE=cpu`` or ``TELOKINE_DEVICE=cuda``.
    Falls back to CPU when CUDA is missing or fails to initialize (common on
    headless servers or broken drivers).
    """
    override = os.environ.get("TELOKINE_DEVICE", "").strip().lower()
    if override in ("cpu", "cuda"):
        return override
    try:
        import torch

        if torch.cuda.is_available():
            try:
                torch.zeros(1, device="cuda")
                return "cuda"
            except Exception:
                pass
    except Exception:
        pass
    return "cpu"

# SB3 is heavy (torch). Import guarded so importing this module never forces
# torch to load — the server boots fine without the ml extra installed.
try:
    from stable_baselines3.common.callbacks import BaseCallback  # type: ignore
except Exception:  # pragma: no cover
    class BaseCallback:  # type: ignore[no-redef]
        """Placeholder when SB3 isn't installed."""


def _env_fn(scene: dict, rewards: list[dict], rank: int, base_seed: int):
    """Top-level env factory (picklable) — required for the spawn start method."""
    from stable_baselines3.common.monitor import Monitor
    from stable_baselines3.common.utils import set_random_seed
    from telokine.env import CubeAgentEnv

    set_random_seed(base_seed + rank)
    return Monitor(CubeAgentEnv(scene, rewards=rewards, seed=base_seed + rank))


def _make_vec_env(scene: dict, rewards: list[dict], n_envs: int, base_seed: int):
    """Build a vectorized env: n parallel CubeAgentEnv instances.

    Uses the ``spawn`` start method (not the default ``fork``). Telokine trains
    inside an asyncio worker thread of the uvicorn server; forking a
    multithreaded process can deadlock, so we spawn fresh interpreters instead.
    """
    from stable_baselines3.common.vec_env import SubprocVecEnv

    fns = [
        functools.partial(_env_fn, scene=scene, rewards=rewards, rank=i, base_seed=base_seed)
        for i in range(n_envs)
    ]
    return SubprocVecEnv(fns, start_method="spawn")


def _warmup_preview(
    scene: dict,
    rewards: list[dict],
    on_telemetry: TelemetryFn,
    should_stop: StopFn,
    stop_when: Callable[[], bool] | None = None,
) -> None:
    """Stream random-action frames until ``stop_when`` returns True (or the user stops)."""
    from telokine.env import CubeAgentEnv

    on_telemetry(
        {
            "type": "preview",
            "episode": 0,
            "reward": 0.0,
            "success_rate": 0.0,
        }
    )
    env = CubeAgentEnv(scene, rewards=rewards, seed=999)
    obs, _ = env.reset()
    on_telemetry({"type": "frame", "objects": env.frame()})
    while True:
        if should_stop():
            break
        if stop_when is not None and stop_when():
            break
        action = env.action_space.sample()
        obs, _, term, trunc, _ = env.step(action)
        on_telemetry({"type": "frame", "objects": env.frame()})
        if term or trunc:
            obs, _ = env.reset()
            on_telemetry({"type": "frame", "objects": env.frame()})


def train(
    scene: dict,
    rewards: list[dict],
    total_timesteps: int,
    on_telemetry: TelemetryFn,
    should_stop: StopFn,
    model_id: str = "policy",
) -> str:
    """Run PPO and return the saved policy path.

    ``on_telemetry`` receives dicts of the /ws/train protocol (telemetry,
    frame, done, error). ``should_stop`` is polled each env step; returning
    True aborts training cleanly.
    """
    preview_handoff = threading.Event()
    warmup_thread = threading.Thread(
        target=_warmup_preview,
        args=(scene, rewards, on_telemetry, should_stop),
        kwargs={"stop_when": preview_handoff.is_set},
        daemon=True,
    )
    warmup_thread.start()

    n_envs = _training_n_envs()
    env_box: dict[str, Any] = {}
    spawn_err: dict[str, BaseException] = {}

    def _spawn() -> None:
        try:
            env_box["env"] = _make_vec_env(scene, rewards=rewards, n_envs=n_envs, base_seed=0)
        except BaseException as exc:  # noqa: BLE001
            spawn_err["err"] = exc

    spawn_thread = threading.Thread(target=_spawn, daemon=True)
    spawn_thread.start()

    _require_ml()
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback

    spawn_thread.join()
    if "err" in spawn_err:
        preview_handoff.set()
        warmup_thread.join(timeout=1.0)
        raise spawn_err["err"]
    env = env_box["env"]

    n_steps = 512
    device = pick_device()
    on_telemetry({"type": "device", "device": device})

    policy_kwargs = dict(net_arch=[64, 64])
    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        n_steps=n_steps,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        policy_kwargs=policy_kwargs,
        device=device,
        verbose=0,
        seed=0,
    )

    callback = _TelemetryCallback(
        scene=scene,
        rewards=rewards,
        on_telemetry=on_telemetry,
        should_stop=should_stop,
        total_timesteps=total_timesteps,
        rollout_steps=n_steps,
        on_preview_ready=preview_handoff.set,
    )

    try:
        model.learn(total_timesteps=total_timesteps, callback=callback, log_interval=None)
    except _StopTraining:
        pass  # user requested stop — still save what we have
    finally:
        preview_handoff.set()
        warmup_thread.join(timeout=1.0)
        env.close()

    os.makedirs("policies", exist_ok=True)
    path = os.path.join("policies", f"{model_id}.zip")
    model.save(path)
    on_telemetry({"type": "done", "model": path})
    return path


class _StopTraining(Exception):
    """Internal: raised to unwind out of model.learn() on a stop request."""


class _TelemetryCallback(BaseCallback):
    """Streams telemetry and a continuously-stepped live preview (no gaps)."""

    WINDOW = 25  # rolling-mean window for reward/success

    def __init__(
        self,
        scene: dict,
        rewards: list[dict],
        on_telemetry: TelemetryFn,
        should_stop: StopFn,
        total_timesteps: int,
        rollout_steps: int,
        on_preview_ready: Callable[[], None] | None = None,
    ) -> None:
        super().__init__()
        self.scene = scene
        self.rewards = rewards
        self._on_telemetry = on_telemetry
        self._should_stop = should_stop
        self.total_timesteps = total_timesteps
        self.rollout_steps = rollout_steps
        self._on_preview_ready = on_preview_ready

        self._ep_rewards: deque[float] = deque(maxlen=self.WINDOW)
        self._ep_success: deque[float] = deque(maxlen=self.WINDOW)
        self._ep_oob: deque[float] = deque(maxlen=self.WINDOW)
        self._episode_count = 0
        self._start = 0.0
        self._rollouts_seen = 0

        self._preview_env = None
        self._preview_obs = None
        self._preview_open = False
        self._preview_lock = threading.Lock()
        self._grad_gap_thread: threading.Thread | None = None

    def _on_rollout_end(self) -> None:
        """Keep the viewport moving while PPO runs gradient updates (no env steps)."""
        last = self.n_calls

        def _animate() -> None:
            while self.n_calls == last and not self._should_stop():
                self._step_preview_random()
                time.sleep(1.0 / 30.0)

        self._grad_gap_thread = threading.Thread(target=_animate, daemon=True)
        self._grad_gap_thread.start()

    def _on_training_start(self) -> None:
        self._start = time.time()
        self._on_telemetry({"type": "started", "total_timesteps": self.total_timesteps})
        self._ensure_preview()
        self._open_preview()
        self._step_preview()
        if self._on_preview_ready is not None:
            self._on_preview_ready()

    def _on_training_end(self) -> None:
        self._close_preview()

    def _on_step(self) -> bool:
        if self._should_stop():
            raise _StopTraining()

        infos = self.locals.get("infos", [])
        for info in infos:
            ep = info.get("episode")
            if ep is not None:
                self._ep_rewards.append(float(ep["r"]))
                self._episode_count += 1
                self._ep_success.append(1.0 if info.get("reached") else 0.0)
                self._ep_oob.append(float(info.get("out_of_bounds_metric", 0.0)))

        # Advance the visible sim every PPO step — never hold a stale frame.
        self._step_preview()

        if self.n_calls % self.rollout_steps == 0:
            self._rollouts_seen += 1
            elapsed = time.time() - self._start
            mean_r = float(np.mean(self._ep_rewards)) if self._ep_rewards else 0.0
            succ = float(np.mean(self._ep_success)) if self._ep_success else 0.0
            oob = float(np.mean(self._ep_oob)) if self._ep_oob else 0.0
            progress = min(1.0, self.num_timesteps / max(1, self.total_timesteps))
            self._on_telemetry(
                {
                    "type": "telemetry",
                    "step": int(self.num_timesteps),
                    "episode": int(self._episode_count),
                    "reward": mean_r,
                    "success_rate": succ,
                    "out_of_bounds_metric": oob,
                    "elapsed": round(elapsed, 1),
                    "progress": round(progress, 4),
                }
            )

        return True

    def _ensure_preview(self) -> None:
        from telokine.env import CubeAgentEnv

        if self._preview_env is not None:
            return
        self._preview_env = CubeAgentEnv(self.scene, rewards=self.rewards, seed=12345)
        self._preview_obs, _ = self._preview_env.reset()
        self._on_telemetry({"type": "frame", "objects": self._preview_env.frame()})

    def _step_preview_random(self) -> None:
        with self._preview_lock:
            if self._preview_env is None:
                self._ensure_preview()
                self._open_preview()
            action = self._preview_env.action_space.sample()
            self._preview_obs, _, term, trunc, _ = self._preview_env.step(action)
            self._on_telemetry({"type": "frame", "objects": self._preview_env.frame()})
            if term or trunc:
                self._preview_obs, _ = self._preview_env.reset()
                self._on_telemetry({"type": "frame", "objects": self._preview_env.frame()})

    def _step_preview(self) -> None:
        with self._preview_lock:
            if self._preview_env is None:
                self._ensure_preview()
                self._open_preview()
            action, _ = self.model.predict(self._preview_obs, deterministic=True)
            self._preview_obs, _, term, trunc, _ = self._preview_env.step(action)
            self._on_telemetry({"type": "frame", "objects": self._preview_env.frame()})
            if term or trunc:
                self._preview_obs, _ = self._preview_env.reset()
                self._on_telemetry({"type": "frame", "objects": self._preview_env.frame()})

    def _open_preview(self) -> None:
        if self._preview_open:
            return
        self._preview_open = True
        succ = float(np.mean(self._ep_success)) if self._ep_success else 0.0
        self._on_telemetry(
            {
                "type": "preview",
                "episode": int(self._episode_count),
                "reward": float(np.mean(self._ep_rewards)) if self._ep_rewards else 0.0,
                "success_rate": succ,
            }
        )

    def _close_preview(self) -> None:
        if not self._preview_open:
            return
        self._preview_open = False
        self._on_telemetry({"type": "preview_end", "episode": int(self._episode_count)})


def rollout_policy(
    scene: dict,
    model_path: str,
    on_frame: TelemetryFn,
    should_stop: StopFn,
    max_steps: int = 400,
    seed: int = 0,
) -> None:
    """Run a trained policy on the scene and stream frames (for the Run button).

    Runs up to ``max_steps`` total env steps (counting across episodes), so it
    always terminates even though each episode resets its own step counter.

    Frames are paced to ~60fps so the trained behaviour is actually watchable —
    without pacing the whole rollout floods the client in a few milliseconds and
    looks like the agent teleports.
    """
    from stable_baselines3 import PPO
    from telokine.env import CubeAgentEnv

    _require_ml()

    frame_dt = 1.0 / 60.0
    env = CubeAgentEnv(scene, seed=seed)
    policy = PPO.load(model_path, device=pick_device())
    obs, _ = env.reset()
    on_frame({"type": "frame", "objects": env.frame()})

    total = 0
    info: dict = {}
    while total < max_steps and not should_stop():
        t0 = time.monotonic()
        action, _ = policy.predict(obs, deterministic=True)
        obs, _, term, trunc, info = env.step(action)
        on_frame({"type": "frame", "objects": env.frame()})
        total += 1
        if term or trunc:
            # Reached (or failed): hold the final pose briefly so the user
            # clearly sees where the agent ended up before the view resets.
            for _ in range(45):
                if should_stop():
                    break
                on_frame({"type": "frame", "objects": env.frame()})
                time.sleep(frame_dt)
            break
        elapsed = time.monotonic() - t0
        if elapsed < frame_dt:
            time.sleep(frame_dt - elapsed)
    on_frame({"type": "stopped", "reached": bool(info.get("reached"))})
