"""Layer 3: the PPO training loop (Stable-Baselines3).

Skeleton for steps 4-6. The concrete version will:

    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import SubprocVecEnv

    env = make_vec_env(lambda: TelokineEnv(scene, rewards), n_envs=N)
    model = PPO("MlpPolicy", env, device="cuda", verbose=1)
    model.learn(total_timesteps=..., callback=telemetry_callback)
    model.save("policies/<id>.zip")

A custom callback streams telemetry (reward, episode count, success rate) and
per-step object transforms over the /ws/train websocket so the frontend can
render learning as it happens.
"""
from __future__ import annotations

from typing import Any, Callable


def train(
    scene: dict,
    rewards: list[dict],
    total_timesteps: int = 200_000,
    on_telemetry: Callable[[dict], None] | None = None,
) -> str:
    """Run PPO on the scene+rewards and return the saved policy path.

    ``on_telemetry`` receives dicts matching the /ws/train protocol.
    """
    raise NotImplementedError("Wired in step 4 (training backend).")
