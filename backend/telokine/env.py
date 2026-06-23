"""Layer 2/3 bridge: a Gymnasium env where a cube agent learns to reach a target.

This is the only ML-facing concept in the whole codebase — and the user never
sees it. They build reward *blocks* (step 5) and press Train (step 4); this env
is how the scene + blocks become a learnable problem.

Observation (12-d):
    [ rel_target(3), linear_vel(3), angular_vel(3), up_vector(3) ]
Action (6-d), continuous in [-1, 1]:
    [ force_x, force_y, force_z, torque_x, torque_y, torque_z ]
    scaled by MAX_FORCE / MAX_TORQUE and applied to the agent body each step.

The default reward here is a stand-in (approach + reach bonus + exertion). Step
5 swaps it for the user's reward-block config without changing anything else.
"""
from __future__ import annotations

import mujoco
import numpy as np
from gymnasium import spaces

from telokine.sim import build_mjcf

try:  # gymnasium.Env lives in gymnasium.envs (re-exported as gym.Env)
    from gymnasium import Env as _GymEnv
except ImportError:  # pragma: no cover
    _GymEnv = object  # type: ignore[misc,assignment]


class CubeAgentEnv(_GymEnv):  # type: ignore[misc, valid-type]
    metadata = {"render_modes": []}

    # ---- physics & control scales ----
    # The agent's force/torque authority is set high enough to overcome the
    # "stiction" of a flat box resting on the floor (its four contact points
    # resist sliding below ~15N regardless of friction). This gives the policy
    # real authority to move the cube.
    SUBSTEPS = 8          # mujoco steps per env step (8 * 0.002s = 16ms)
    MAX_FORCE = 30.0      # Newtons per axis (action in [-1,1] * this)
    MAX_TORQUE = 8.0      # N·m per axis
    MAX_STEPS = 250       # env steps per episode
    REACH_RADIUS = 0.6    # distance that counts as "reached"
    OUT_OF_BOUNDS = 14.0  # |x| or |z| beyond this ends the episode (fail)
    VEL_SCALE = 5.0       # normalize velocities in the observation

    OBS_DIM = 12
    ACT_DIM = 6

    def __init__(self, scene: dict, seed: int | None = None) -> None:
        # gymnasium.Env isn't always importable in type-check; call super safely.
        try:
            super().__init__()
        except Exception:  # pragma: no cover
            pass

        self.scene = scene
        self._np_rng = np.random.default_rng(seed)

        xml = build_mjcf(scene, lift_agent=False)
        self.model = mujoco.MjModel.from_xml_string(xml)
        self.data = mujoco.MjData(self.model)

        self._agent_id = self._find_by("role", "agent")
        if self._agent_id is None:
            raise ValueError("scene has no object with role 'agent'")

        self._agent_bid = mujoco.mj_name2id(
            self.model, mujoco.mjtObj.mjOBJ_BODY, f"b_{self._agent_id}"
        )
        self._agent_dofadr = int(
            self.model.jnt_dofadr[
                mujoco.mj_name2id(
                    self.model, mujoco.mjtObj.mjOBJ_JOINT, f"j_{self._agent_id}"
                )
            ]
        )
        self._target_pos = np.array(self._target_world_pos(), dtype=np.float64)

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(self.OBS_DIM,), dtype=np.float32
        )
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(self.ACT_DIM,), dtype=np.float32
        )

        self._step = 0
        self._prev_dist = 0.0

    # ------------------------------------------------------------------
    # scene helpers
    # ------------------------------------------------------------------
    def _find_by(self, key: str, value: str) -> str | None:
        for o in self.scene.get("objects", []):
            if o.get(key) == value:
                return o["id"]
        return None

    def _target_world_pos(self) -> list[float]:
        for o in self.scene.get("objects", []):
            if o.get("role") == "target":
                return list(o.get("position", [0, 0.5, 0]))
        return [0.0, 0.5, 0.0]

    # ------------------------------------------------------------------
    # gymnasium API
    # ------------------------------------------------------------------
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        try:
            super().reset(seed=seed)
        except Exception:  # pragma: no cover
            pass
        mujoco.mj_resetData(self.model, self.data)
        mujoco.mj_forward(self.model, self.data)
        self._step = 0
        self._prev_dist = self._dist_to_target()
        return self._obs(), {}

    def step(self, action):
        action = np.clip(np.asarray(action, dtype=np.float64).reshape(-1), -1.0, 1.0)
        force = action[:3] * self.MAX_FORCE
        torque = action[3:] * self.MAX_TORQUE

        # xfrc_applied is [fx, fy, fz, tx, ty, tz] per body, world frame.
        xfrc = self.data.xfrc_applied[self._agent_bid]
        xfrc[0], xfrc[1], xfrc[2] = force[0], force[1], force[2]
        xfrc[3], xfrc[4], xfrc[5] = torque[0], torque[1], torque[2]

        for _ in range(self.SUBSTEPS):
            mujoco.mj_step(self.model, self.data)

        self._step += 1
        dist = self._dist_to_target()
        reached = dist < self.REACH_RADIUS
        pos = self.data.body(self._agent_bid).xpos
        oob = abs(float(pos[0])) > self.OUT_OF_BOUNDS or abs(float(pos[2])) > self.OUT_OF_BOUNDS

        # Default reward (step 5 replaces this with the user's block config):
        # reward progress toward the target, penalize flailing, bonus on reach.
        progress = self._prev_dist - dist
        exertion = -0.001 * float(np.sum(np.square(action)))
        reach_bonus = 10.0 if reached else 0.0
        reward = float(0.5 * progress + exertion + reach_bonus)
        self._prev_dist = dist

        terminated = bool(reached or oob)
        truncated = self._step >= self.MAX_STEPS
        info = {
            "distance": float(dist),
            "reached": bool(reached),
            "out_of_bounds": bool(oob),
        }
        return self._obs(), reward, terminated, truncated, info

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------
    def _obs(self) -> np.ndarray:
        b = self.data.body(self._agent_bid)
        pos = np.asarray(b.xpos, dtype=np.float64)
        rel = self._target_pos - pos

        va = self._agent_dofadr
        lin = np.asarray(self.data.qvel[va : va + 3]) / self.VEL_SCALE
        ang = np.asarray(self.data.qvel[va + 3 : va + 6]) / self.VEL_SCALE

        # local +Y axis expressed in world coords (1 when upright, ~0 when tipped)
        xmat = b.xmat
        up = np.array([float(xmat[1]), float(xmat[4]), float(xmat[7])], dtype=np.float64)

        return np.concatenate([rel, lin, ang, up]).astype(np.float32)

    def _dist_to_target(self) -> float:
        pos = np.asarray(self.data.body(self._agent_bid).xpos, dtype=np.float64)
        return float(np.linalg.norm(self._target_pos - pos))
