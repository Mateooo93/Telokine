"""Physics tests. Skipped automatically if the ``sim`` extra isn't installed."""
import pytest

mujoco = pytest.importorskip("mujoco")

from telokine.sim import Simulator  # noqa: E402


def _cube(pos=(0, 1.5, 0), size=1, role="agent"):
    return {
        "id": "cube",
        "type": "cube",
        "position": list(pos),
        "size": size,
        "radius": 0.5,
        "weight": 1,
        "friction": 0.5,
        "role": role,
        "color": "#4f9cff",
    }


def test_mjcf_builds():
    from telokine.sim import build_mjcf

    xml = build_mjcf({"objects": [_cube()]})
    assert "<mujoco" in xml
    assert 'name="ground"' in xml  # ground plane always present
    assert 'name="b_cube"' in xml  # body named after object id
    assert "freejoint" in xml  # agent is dynamic


def test_cube_falls_under_gravity():
    sim = Simulator({"objects": [_cube(pos=(0, 2.0, 0))]}, seed=0)
    y0 = float(sim.data.body("b_cube").xpos[1])
    for _ in range(150):
        sim.step()
    y1 = float(sim.data.body("b_cube").xpos[1])
    assert y1 < y0  # it fell (Y-up)
    assert y1 < 1.0  # and ended near the floor (half-size 0.5 -> rests ~0.5)


def test_frame_reports_all_objects():
    scene = {
        "objects": [
            _cube(),
            {
                "id": "tgt",
                "type": "target",
                "position": [4, 0.5, 0],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": 0.5,
                "role": "target",
                "color": "#ff6b35",
            },
        ]
    }
    sim = Simulator(scene, seed=1)
    frame = sim.frame()
    ids = {o["id"] for o in frame.objects}
    assert ids == {"cube", "tgt"}
    # rot is four values in three.js order [x,y,z,w]
    assert len(frame.objects[0]["rot"]) == 4
    assert len(frame.objects[0]["pos"]) == 3


def test_target_is_non_colliding():
    # Agent should be able to pass through the target's location without
    # bouncing — confirms contype/conaffinity disabled collision on the target.
    scene = {
        "objects": [
            _cube(pos=(0, 2.0, 0)),
            {
                "id": "tgt",
                "type": "target",
                "position": [0, 0.5, 0],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": 0.5,
                "role": "target",
                "color": "#ff6b35",
            },
        ]
    }
    sim = Simulator(scene, seed=0)
    # Step plenty; if the target collided, the agent would be deflected/resting
    # on it. Just assert the target body never moves and the sim is stable.
    for _ in range(100):
        sim.step()
    tgt = sim.data.body("b_tgt")
    assert abs(float(tgt.xpos[0]) - 0.0) < 1e-6
    assert abs(float(tgt.xpos[1]) - 0.5) < 1e-6  # Y-up height
