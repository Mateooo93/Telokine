"""Layer 2: a Gymnasium environment wrapping MuJoCo.

Skeleton for steps 2-4. The concrete implementation will:
  1. Build a MuJoCo model (MJCF) from the scene config — cube body + target
     site on a floor. Later, articulated bodies for creatures/humanoids.
  2. Expose observation (agent pose, velocity, relative target vector, ...).
  3. Expose action (forces on the cube; later joint torques).
  4. Step the physics and return reward computed from reward.py.
"""
from __future__ import annotations

from typing import Any


class TelokineEnv:
    """Will subclass ``gymnasium.Env`` once the ``ml`` extra is installed."""

    def __init__(self, scene: dict, rewards: list[dict]) -> None:
        self.scene = scene
        self.rewards = rewards

    def reset(self, *, seed: int | None = None) -> tuple[Any, dict]:
        raise NotImplementedError("Wired in step 2 (physics).")

    def step(self, action: Any) -> tuple[Any, float, bool, bool, dict]:
        raise NotImplementedError("Wired in step 3 (cube agent).")
