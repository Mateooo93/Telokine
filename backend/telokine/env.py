"""Layer 2/3 bridge: a Gymnasium env where a cube agent learns to reach a target.

This is the only ML-facing concept in the whole codebase — and the user never
sees it. They build reward *blocks* (step 5) and press Train (step 4); this env
is how the scene + blocks become a learnable problem.

Observation (12-d):
    [ rel_target(3), linear_vel(3), angular_vel(3), up_vector(3) ]
Action, continuous in [-1, 1]:
    * build WITH motors -> one channel per motor actuator (joint torques), like
      a real robot/rover. The body is never pushed directly.
    * build WITHOUT motors -> the classic 6-D body thruster
      [ force_x, force_y, force_z, torque_x, torque_y, torque_z ] applied to the
      agent body, so a bare cube can still be trained to reach the target.

The default reward here is a stand-in (approach + reach bonus + exertion). Step
5 swaps it for the user's reward-block config without changing anything else.
"""
from __future__ import annotations

import mujoco
import numpy as np
from gymnasium import spaces

from telokine.reward import compile_blocks, evaluate
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

    def __init__(self, scene: dict, rewards: list[dict] | None = None, seed: int | None = None) -> None:
        # gymnasium.Env isn't always importable in type-check; call super safely.
        try:
            super().__init__()
        except Exception:  # pragma: no cover
            pass

        self.scene = scene
        self._reward_blocks = compile_blocks(rewards or [])
        training_cfg = scene.get("training", {})
        action_power = training_cfg.get("action_power") or 1.0
        episode_length = training_cfg.get("episode_length") or self.MAX_STEPS
        self.max_force = self.MAX_FORCE * float(action_power)
        self.max_torque = self.MAX_TORQUE * float(action_power)
        self.max_steps = int(episode_length)
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

        # How the agent is actuated. Real robots (and every standard MuJoCo RL
        # env like Ant/Humanoid) move ONLY through their actuators — joint
        # torques that drive wheels/legs against the ground. There is no magic
        # body force: a build with no motors has nothing to actuate and so it
        # cannot move on its own. We still expose a 1-D dummy action when there
        # are no motors purely to keep the RL action space valid; it drives
        # nothing. Add a Motor (and a wheel/part for it to turn) to make it move.
        self._n_motors = int(self.model.nu)
        self.has_motors = self._n_motors > 0
        self.act_dim = self._n_motors if self.has_motors else 1

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(self.OBS_DIM,), dtype=np.float32
        )
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(self.act_dim,), dtype=np.float32
        )

        self._step = 0
        self._prev_dist = 0.0
        self._prev_x = 0.0

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

        # Domain randomization: jitter the agent's start xz a little so the
        # parallel training envs see variety (each carries its own rng). The
        # target stays where the user placed it. Deterministic for a given seed,
        # so unit tests stay reproducible.
        qposadr = int(
            self.model.jnt_qposadr[
                mujoco.mj_name2id(
                    self.model, mujoco.mjtObj.mjOBJ_JOINT, f"j_{self._agent_id}"
                )
            ]
        )
        self.data.qpos[qposadr + 0] += float(self._np_rng.uniform(-0.4, 0.4))
        self.data.qpos[qposadr + 2] += float(self._np_rng.uniform(-0.4, 0.4))

        mujoco.mj_forward(self.model, self.data)
        self._step = 0
        self._prev_dist = self._dist_to_target()
        self._prev_x = float(self.data.body(self._agent_bid).xpos[0])
        return self._obs(), {}

    def frame(self) -> list[dict]:
        """Per-object transforms for the frontend, same shape as Simulator."""
        objs = []
        for o in self.scene.get("objects", []):
            oid = o["id"]
            body = self.data.body(f"b_{oid}")
            x, y, z = (float(v) for v in body.xpos)
            qw, qx, qy, qz = (float(v) for v in body.xquat)
            objs.append({"id": oid, "pos": [x, y, z], "rot": [qx, qy, qz, qw]})
        return objs

    def step(self, action):
        action = np.clip(np.asarray(action, dtype=np.float64).reshape(-1), -1.0, 1.0)

        if self.has_motors:
            # The policy commands the motors only. The body never gets a free
            # push, so it moves solely by driving its joints, like a real robot.
            self.data.ctrl[:] = action[: self._n_motors]
        # No motors: nothing to actuate. The dummy action drives nothing, so the
        # agent stays put — a bare rigid body cannot locomote on its own.

        for _ in range(self.SUBSTEPS):
            mujoco.mj_step(self.model, self.data)

        self._step += 1
        dist = self._dist_to_target()
        reached = dist < self.REACH_RADIUS
        pos = self.data.body(self._agent_bid).xpos
        oob = abs(float(pos[0])) > self.OUT_OF_BOUNDS or abs(float(pos[2])) > self.OUT_OF_BOUNDS
        upright = self._upright()

        progress = self._prev_dist - dist
        forward_delta = float(pos[0]) - self._prev_x
        state = {
            "distance": float(dist),
            "progress": float(progress),
            "reached": bool(reached),
            "out_of_bounds": bool(oob),
            "out_of_bounds_metric": self._out_of_bounds(),
            "upright": float(upright),
            "fallen": bool(upright < 0.25 or float(pos[1]) < 0.2),
            "forward_delta": forward_delta,
            "action_energy": float(np.sum(np.square(action[: self._n_motors]))) if self.has_motors else 0.0,
        }
        reward = evaluate(self._reward_blocks, state)
        self._prev_dist = dist
        self._prev_x = float(pos[0])

        terminated = bool(reached or oob)
        truncated = self._step >= self.max_steps
        info = {
            "distance": float(dist),
            "reached": bool(reached),
            "out_of_bounds": bool(oob),
            "out_of_bounds_metric": self._out_of_bounds(),
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

    def _upright(self) -> float:
        b = self.data.body(self._agent_bid)
        xmat = b.xmat
        return float(max(0.0, min(1.0, xmat[4])))
    
    def _out_of_bounds(self) -> float:
        """Returns normalized distance out of bounds: 0 if within, 1 if beyond threshold."""
        pos = self.data.body(self._agent_bid).xpos
        max_dist = max(abs(float(pos[0])), abs(float(pos[2])))
        return float(max(0.0, min(1.0, (max_dist - self.OUT_OF_BOUNDS) / self.OUT_OF_BOUNDS)))