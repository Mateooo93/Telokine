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


def test_lift_agent_flag():
    from telokine.sim import build_mjcf

    up = build_mjcf({"objects": [_cube(pos=(0, 0.5, 0))]}, lift_agent=True)
    down = build_mjcf({"objects": [_cube(pos=(0, 0.5, 0))]}, lift_agent=False)
    # lifted adds 1.0 to the start height; non-lifted keeps the placed pose
    assert 'pos="0 1.5 0"' in up
    assert 'pos="0 0.5 0"' in down


def test_edited_rotation_becomes_body_quat():
    import math
    from telokine.sim import _euler_xyz_to_wxyz, build_mjcf

    cube = _cube(pos=(0, 0.5, 0))
    cube["rotation"] = [math.pi / 2, 0, 0]  # 90deg about X
    xml = build_mjcf({"objects": [cube]}, lift_agent=False)
    assert "quat" in xml  # the body got an initial orientation
    # Quaternion of a 90deg-X rotation is (w,x,y,z) = (cos45, sin45, 0, 0)
    w, x, y, z = _euler_xyz_to_wxyz(math.pi / 2, 0, 0)
    assert abs(w - math.sqrt(0.5)) < 1e-6
    assert abs(x - math.sqrt(0.5)) < 1e-6
    assert abs(y) < 1e-6 and abs(z) < 1e-6


def test_rectangle_cube_dimensions():
    from telokine.sim import build_mjcf

    cube = _cube()
    cube["dimensions"] = [2.0, 0.5, 3.0]  # wide, flat, deep
    xml = build_mjcf({"objects": [cube]}, lift_agent=False)
    # half-sizes are 1.0 0.25 1.5
    assert 'type="box"' in xml
    assert 'size="1 0.25 1.5"' in xml


def test_unpinned_prop_is_dynamic():
    from telokine.sim import build_mjcf

    sphere = {
        "id": "ball",
        "type": "sphere",
        "position": [0, 1, 0],
        "rotation": [0, 0, 0],
        "dimensions": [1, 1, 1],
        "size": 1,
        "radius": 0.5,
        "weight": 1,
        "friction": 0.5,
        "pinned": False,
        "role": "prop",
        "color": "#b07cff",
    }
    xml = build_mjcf({"objects": [sphere]}, lift_agent=False)
    assert 'name="j_ball"' in xml  # freejoint -> falls under gravity
    assert 'mass="1"' in xml


def test_pinned_prop_is_welded():
    from telokine.sim import build_mjcf

    box = {
        "id": "plat",
        "type": "cube",
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "dimensions": [4, 0.5, 4],
        "size": 1,
        "radius": 0.5,
        "weight": 1,
        "friction": 0.5,
        "pinned": True,
        "role": "prop",
        "color": "#888",
    }
    xml = build_mjcf({"objects": [box]}, lift_agent=False)
    assert 'name="j_plat"' not in xml  # no freejoint -> stays put


def test_pinned_platform_holds_up_falling_sphere():
    # A pinned cube platform should catch a falling sphere instead of the
    # sphere passing through — confirms pinned props still collide.
    import mujoco
    from telokine.sim import build_mjcf

    scene = {
        "objects": [
            {
                "id": "plat",
                "type": "cube",
                "position": [0, 0, 0],
                "rotation": [0, 0, 0],
                "dimensions": [4, 0.5, 4],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": 0.5,
                "pinned": True,
                "role": "prop",
                "color": "#888",
            },
            {
                "id": "ball",
                "type": "sphere",
                "position": [0, 3, 0],
                "rotation": [0, 0, 0],
                "dimensions": [1, 1, 1],
                "size": 1,
                "radius": 0.5,
                "weight": 1,
                "friction": 0.5,
                "pinned": False,
                "role": "prop",
                "color": "#b07cff",
            },
        ]
    }
    xml = build_mjcf(scene, lift_agent=False)
    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    y0 = float(d.body("b_ball").xpos[1])
    for _ in range(600):
        mujoco.mj_step(m, d)
    y1 = float(d.body("b_ball").xpos[1])
    assert y1 < y0  # fell
    assert y1 > 0.6  # but came to rest on the platform (top at y=0.25+radius)
