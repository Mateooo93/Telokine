"""Layer 3: the PPO training loop (Stable-Baselines3).

The user presses Train; this is what happens behind the curtain:

    8 parallel CubeAgentEnv instances  (CPU, one per process)
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
from collections import deque
from typing import Callable, Any

import numpy as np

TelemetryFn = Callable[[dict], None]
StopFn = Callable[[], bool]

# SB3 is heavy (torch). Import guarded so importing this module never forces
# torch to load — the server boots fine without the ml extra installed.
try:
    from stable_baselines3.common.callbacks import BaseCallback  # type: ignore
except Exception:  # pragma: no cover
    class BaseCallback:  # type: ignore[no-redef]
        """Placeholder when SB3 isn't installed."""


def _env_fn(scene: dict, rank: int, base_seed: int):
    """Top-level env factory (picklable) — required for the spawn start method."""
    from stable_baselines3.common.monitor import Monitor
    from stable_baselines3.common.utils import set_random_seed
    from telokine.env import CubeAgentEnv

    set_random_seed(base_seed + rank)
    return Monitor(CubeAgentEnv(scene, seed=base_seed + rank))


def _make_vec_env(scene: dict, n_envs: int, base_seed: int):
    """Build a vectorized env: n parallel CubeAgentEnv instances.

    Uses the ``spawn`` start method (not the default ``fork``). Telokine trains
    inside an asyncio worker thread of the uvicorn server; forking a
    multithreaded process can deadlock, so we spawn fresh interpreters instead.
    """
    from stable_baselines3.common.vec_env import SubprocVecEnv

    fns = [
        functools.partial(_env_fn, scene=scene, rank=i, base_seed=base_seed)
        for i in range(n_envs)
    ]
    return SubprocVecEnv(fns, start_method="spawn")


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
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback

    n_envs = 8
    n_steps = 512
    env = _make_vec_env(scene, n_envs=n_envs, base_seed=0)

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
        device="auto",  # CUDA when available
        verbose=0,
        seed=0,
    )

    callback = _TelemetryCallback(
        scene=scene,
        on_telemetry=on_telemetry,
        should_stop=should_stop,
        total_timesteps=total_timesteps,
        # n_counts VecEnv steps; a PPO rollout is n_steps of them.
        rollout_steps=n_steps,
    )

    try:
        model.learn(total_timesteps=total_timesteps, callback=callback, log_interval=None)
    except _StopTraining:
        pass  # user requested stop — still save what we have
    finally:
        env.close()

    os.makedirs("policies", exist_ok=True)
    path = os.path.join("policies", f"{model_id}.zip")
    model.save(path)
    on_telemetry({"type": "done", "model": path})
    return path


class _StopTraining(Exception):
    """Internal: raised to unwind out of model.learn() on a stop request."""


class _TelemetryCallback(BaseCallback):
    """Streams reward/success telemetry and periodic live-preview frames."""

    PREVIEW_EVERY_ROLLOTS = 4   # run a preview every N rollouts
    PREVIEW_STEPS = 70          # env steps per preview (~1.1s of sim)
    WINDOW = 25                 # rolling-mean window for reward/success

    def __init__(
        self,
        scene: dict,
        on_telemetry: TelemetryFn,
        should_stop: StopFn,
        total_timesteps: int,
        rollout_steps: int,
    ) -> None:
        super().__init__()
        self.scene = scene
        self._on_telemetry = on_telemetry
        self._should_stop = should_stop
        self.total_timesteps = total_timesteps
        self.rollout_steps = rollout_steps

        self._ep_rewards: deque[float] = deque(maxlen=self.WINDOW)
        self._ep_success: deque[float] = deque(maxlen=self.WINDOW)
        self._episode_count = 0
        self._start = 0.0
        self._rollouts_seen = 0

        # Separate single env used only for periodic live previews of the policy.
        self._preview_env = None

    def _on_training_start(self) -> None:
        self._start = time.time()
        self._on_telemetry({"type": "started", "total_timesteps": self.total_timesteps})

    def _on_step(self) -> bool:
        # Honor a stop request from the UI.
        if self._should_stop():
            raise _StopTraining()

        infos = self.locals.get("infos", [])
        for info in infos:
            ep = info.get("episode")
            if ep is not None:
                self._ep_rewards.append(float(ep["r"]))
                self._episode_count += 1
                self._ep_success.append(1.0 if info.get("reached") else 0.0)

        # Emit telemetry once per PPO rollout (every rollout_steps env steps).
        if self.n_calls % self.rollout_steps == 0:
            self._rollouts_seen += 1
            elapsed = time.time() - self._start
            mean_r = float(np.mean(self._ep_rewards)) if self._ep_rewards else 0.0
            succ = float(np.mean(self._ep_success)) if self._ep_success else 0.0
            progress = min(1.0, self.num_timesteps / max(1, self.total_timesteps))
            self._on_telemetry(
                {
                    "type": "telemetry",
                    "step": int(self.num_timesteps),
                    "episode": int(self._episode_count),
                    "reward": mean_r,
                    "success_rate": succ,
                    "elapsed": round(elapsed, 1),
                    "progress": round(progress, 4),
                }
            )

            # Periodically preview the learning policy so the user can watch it
            # get better at reaching the target.
            if self._rollouts_seen % self.PREVIEW_EVERY_ROLLOTS == 0:
                self._preview()

        return True

    def _preview(self) -> None:
        from telokine.env import CubeAgentEnv

        if self._preview_env is None:
            self._preview_env = CubeAgentEnv(self.scene, seed=12345)
        env = self._preview_env
        obs, _ = env.reset()
        # Send the start frame.
        self._on_telemetry({"type": "frame", "objects": env.frame()})
        for _ in range(self.PREVIEW_STEPS):
            action, _ = self.model.predict(obs, deterministic=True)
            obs, _, term, trunc, _ = env.step(action)
            self._on_telemetry({"type": "frame", "objects": env.frame()})
            if term or trunc:
                break


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
    """
    from stable_baselines3 import PPO
    from telokine.env import CubeAgentEnv

    env = CubeAgentEnv(scene, seed)
    policy = PPO.load(model_path, device="cpu")
    obs, _ = env.reset()
    on_frame({"type": "frame", "objects": env.frame()})

    total = 0
    while total < max_steps and not should_stop():
        action, _ = policy.predict(obs, deterministic=True)
        obs, _, term, trunc, info = env.step(action)
        on_frame({"type": "frame", "objects": env.frame()})
        total += 1
        if term or trunc:
            # Reached (or failed) — stop so the user sees the final result.
            break
    on_frame({"type": "stopped", "reached": bool(info.get("reached"))})
