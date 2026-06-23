"""Cube-agent env tests. Skipped automatically without the ``sim`` extra."""
import numpy as np
import pytest

pytest.importorskip("gymnasium")

from telokine.env import CubeAgentEnv  # noqa: E402


def _scene(agent_pos=(0, 0.5, 0), target_pos=(3, 0.5, 0), friction=0.4):
    return {
        "objects": [
            {
                "id": "cube",
                "type": "cube",
                "position": list(agent_pos),
                "rotation": [0, 0, 0],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": friction,
                "role": "agent",
                "color": "#4f9cff",
            },
            {
                "id": "tgt",
                "type": "target",
                "position": list(target_pos),
                "rotation": [0, 0, 0],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": 0.5,
                "role": "target",
                "color": "#ff6b35",
            },
        ]
    }


def test_spaces():
    env = CubeAgentEnv(_scene(), seed=0)
    assert env.observation_space.shape == (12,)
    assert env.action_space.shape == (6,)
    assert env.action_space.is_bounded()


def test_reset_and_step_shapes():
    env = CubeAgentEnv(_scene(), seed=0)
    obs, info = env.reset()
    assert obs.shape == (12,)
    assert obs in env.observation_space

    obs, reward, terminated, truncated, info = env.step(np.zeros(6))
    assert obs.shape == (12,)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)
    assert "distance" in info


def test_requires_agent():
    scene = _scene()
    scene["objects"][0]["role"] = "static"  # no agent now
    with pytest.raises(ValueError):
        CubeAgentEnv(scene)


def test_observation_points_at_target():
    # rel_target (obs[0:3]) should point from agent toward the target.
    env = CubeAgentEnv(_scene(agent_pos=(0, 0.5, 0), target_pos=(3, 0.5, 0)), seed=0)
    obs, _ = env.reset()
    rel = obs[0:3]
    assert rel[0] > 2.0  # +x toward target
    assert abs(rel[1]) < 0.5  # same height
    assert abs(rel[2]) < 0.1  # no z offset


def test_policy_pushing_toward_target_reaches_and_beats_random():
    """A hand-coded policy that pushes toward the target should reach it and
    score higher than a random policy. This proves observation -> action ->
    dynamics -> reward all point the right way.
    """
    env = CubeAgentEnv(_scene(target_pos=(3, 0.5, 0), friction=0.3), seed=0)

    def run(policy):
        obs, _ = env.reset(seed=0)
        total, reached = 0.0, False
        for _ in range(env.MAX_STEPS):
            obs, r, term, trunc, info = env.step(policy(obs))
            total += r
            reached = reached or info["reached"]
            if term or trunc:
                break
        return total, reached

    def toward_target(obs):
        rel = obs[0:3]
        horiz = np.array([rel[0], 0.0, rel[2]])
        n = np.linalg.norm(horiz)
        if n < 1e-6:
            return np.zeros(6)
        d = horiz / n  # unit direction toward target
        return np.array([d[0], 0.0, d[2], 0.0, 0.0, 0.0], dtype=np.float32)

    def random_policy(obs):
        return env._np_rng.uniform(-1, 1, 6).astype(np.float32)

    heuristic_total, heuristic_reached = run(toward_target)
    random_total, _ = run(random_policy)

    assert heuristic_reached, "heuristic policy should reach the target"
    assert heuristic_total > random_total, "heuristic should outscore random"
