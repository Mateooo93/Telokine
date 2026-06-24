"""Layer 2: a MuJoCo physics simulator built from the frontend scene model.

No learning here — just gravity, collisions, and balance. The user never sees
this module; they press Run and watch the world behave realistically.

The scene model is identical to ``src/viewport/types.ts`` on the frontend, so
what the user edits is exactly what gets simulated.
"""
from __future__ import annotations

import math
import random
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any


# --------------------------------------------------------------------------
# MJCF construction: scene model -> MuJoCo XML
# --------------------------------------------------------------------------

def _f(v: float) -> str:
    """Compact float formatting for XML attributes."""
    return f"{float(v):.5f}".rstrip("0").rstrip(".")


def _v3(vals: list[float] | tuple[float, float, float]) -> str:
    return f"{_f(vals[0])} {_f(vals[1])} {_f(vals[2])}"


def _euler_xyz_to_wxyz(ex: float, ey: float, ez: float) -> tuple[float, float, float, float]:
    """Euler XYZ (radians) -> quaternion, matching three.js Euler order 'XYZ'.

    Returns (w, x, y, z) so it can be written straight into an MJCF ``quat``
    attribute, which also uses [w, x, y, z]. Keeping this in lockstep with the
    frontend's Euler XYZ rendering means an edited rotation carries into the
    sim start pose unchanged.
    """
    c1, s1 = math.cos(ex / 2), math.sin(ex / 2)
    c2, s2 = math.cos(ey / 2), math.sin(ey / 2)
    c3, s3 = math.cos(ez / 2), math.sin(ez / 2)
    x = s1 * c2 * c3 + c1 * s2 * s3
    y = c1 * s2 * c3 - s1 * c2 * s3
    z = c1 * c2 * s3 + s1 * s2 * c3
    w = c1 * c2 * c3 - s1 * s2 * s3
    return w, x, y, z


def _hex_to_rgba(hexstr: str, alpha: float = 1.0) -> str:
    h = hexstr.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return f"{r:.4f} {g:.4f} {b:.4f} {_f(alpha)}"


# --------------------------------------------------------------------------
# Small quaternion helpers (w, x, y, z). Used to express a child body's pose
# relative to its parent so we can assemble a real MuJoCo kinematic tree.
# --------------------------------------------------------------------------

Quat = tuple[float, float, float, float]
Vec3 = tuple[float, float, float]


def _quat_mul(a: Quat, b: Quat) -> Quat:
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    )


def _quat_conj(q: Quat) -> Quat:
    w, x, y, z = q
    return (w, -x, -y, -z)


def _quat_rot(q: Quat, v: Vec3) -> Vec3:
    """Rotate vector ``v`` by unit quaternion ``q``."""
    w, x, y, z = q
    vx, vy, vz = v
    tx = 2.0 * (y * vz - z * vy)
    ty = 2.0 * (z * vx - x * vz)
    tz = 2.0 * (x * vy - y * vx)
    return (
        vx + w * tx + (y * tz - z * ty),
        vy + w * ty + (z * tx - x * tz),
        vz + w * tz + (x * ty - y * tx),
    )


def _normalize3(v: Vec3) -> Vec3:
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if n < 1e-9:
        return (0.0, 0.0, 1.0)
    return (v[0] / n, v[1] / n, v[2] / n)


def _obj_quat(obj: dict) -> Quat:
    rot = obj.get("rotation", [0, 0, 0]) or [0, 0, 0]
    if any(abs(float(v)) > 1e-6 for v in rot):
        return _euler_xyz_to_wxyz(float(rot[0]), float(rot[1]), float(rot[2]))
    return (1.0, 0.0, 0.0, 0.0)


def _is_identity_quat(q: Quat) -> bool:
    return q[0] > 0.999999 and abs(q[1]) < 1e-6 and abs(q[2]) < 1e-6 and abs(q[3]) < 1e-6


def _is_dynamic(obj: dict) -> bool:
    """A free body (gets a freejoint, falls under gravity) when it's the agent
    or an unpinned prop. Targets, floors, sensors and pinned props are static."""
    role = obj.get("role", "prop")
    return role == "agent" or (role == "prop" and not obj.get("pinned", False))


def _build_geom(body: ET.Element, obj: dict, colliding: bool | None = None) -> None:
    """Append the right <geom> for an object type onto its <body>.

    ``colliding`` forces contact on/off; when None the per-type default is used
    (joints/motors collide, sensors/targets do not).
    """
    t = obj.get("type", "cube")
    friction = f"{_f(obj.get('friction', 0.5))} 0.01 0.01"

    if t in ("cube", "beam"):
        dims = obj.get("dimensions", [1, 1, 1])
        w, h, d = dims[0] / 2.0, dims[1] / 2.0, dims[2] / 2.0
        geom = ET.SubElement(body, "geom", {"type": "box", "size": _v3([w, h, d])})
    elif t == "sphere":
        geom = ET.SubElement(body, "geom", {"type": "sphere", "size": _f(obj.get("radius", 0.5))})
    elif t == "capsule":
        r = obj.get("radius", 0.5) * 0.5
        half = obj.get("size", 1) / 2.0
        geom = ET.SubElement(
            body,
            "geom",
            {"type": "capsule", "size": _f(r), "fromto": f"0 0 {_f(-half)} 0 0 {_f(half)}"},
        )
    elif t == "wheel":
        geom = ET.SubElement(
            body,
            "geom",
            {"type": "cylinder", "size": f"{_f(obj.get('radius', 0.45))} {_f(obj.get('size', 0.28) / 2.0)}"},
        )
    elif t in ("joint", "motor", "sensor"):
        geom = ET.SubElement(
            body,
            "geom",
            {
                "type": "sphere",
                "size": _f(obj.get("radius", 0.25)),
                "contype": "0" if t == "sensor" else "1",
                "conaffinity": "0" if t == "sensor" else "1",
            },
        )
    elif t == "target":
        # A goal marker: visible but non-colliding so the agent can reach it.
        geom = ET.SubElement(
            body,
            "geom",
            {
                "type": "sphere",
                "size": _f(obj.get("radius", 0.5)),
                "contype": "0",
                "conaffinity": "0",
            },
        )
    elif t == "floor":
        s = obj.get("size", 6)
        geom = ET.SubElement(body, "geom", {"type": "box", "size": f"{_f(s)} 0.5 {_f(s)}"})
    else:
        geom = ET.SubElement(body, "geom", {"type": "sphere", "size": "0.5"})

    geom.set("rgba", _hex_to_rgba(obj.get("color", "#cccccc")))
    geom.set("friction", friction)
    if colliding is not None:
        geom.set("contype", "1" if colliding else "0")
        geom.set("conaffinity", "1" if colliding else "0")


_JOINT_TYPE_MAP = {"hinge": "hinge", "slider": "slide", "ball": "ball"}


def build_mjcf(scene: dict, lift_agent: bool = True) -> str:
    """Translate the scene model into an MJCF XML string.

    Connected parts are assembled into a real MuJoCo *kinematic tree*: each
    connector (motor/joint) makes its second part (``connectedTo``) a child of
    its first part (``attachedTo``), joined by a real ``hinge``/``slide``/
    ``ball`` joint — or rigidly welded for a ``fixed`` joint. This is what makes
    a built robot actually hold together and articulate, instead of relying on
    soft equality constraints that drift apart. Motors additionally get an
    ``<actuator>`` so the trained policy can drive them.

    The world is built Y-up to match Three.js exactly, so object positions and
    quaternions pass through between frontend and backend with no conversion.

    ``lift_agent`` raises the agent a little on start so a Run shows a visible
    drop under gravity. Training (the env) uses ``lift_agent=False``.
    """
    objects = scene.get("objects", [])
    by_id: dict[str, dict] = {o["id"]: o for o in objects}
    agent_id = next((o["id"] for o in objects if o.get("role") == "agent"), None)
    connectors = [o for o in objects if o.get("role") == "connector"]

    # ---- resolve the attachment graph: child -> (parent, connector) --------
    # `attachedTo` is part A (parent), `connectedTo` is part B (child). The
    # agent is always kept as a root, so a connector pointing *into* the agent
    # is flipped. Each body gets at most one parent; cycles are dropped.
    resolved: list[dict] = []
    has_parent: set[str] = set()
    conn_parent: dict[str, str] = {}  # connector id -> body it visually rides on

    def _creates_cycle(parent: str, child: str) -> bool:
        cur: str | None = parent
        for _ in range(len(objects) + 1):
            if cur is None:
                return False
            if cur == child:
                return True
            cur = next((r["parent"] for r in resolved if r["child"] == cur), None)
        return False

    for c in connectors:
        a = c.get("attachedTo")
        b = c.get("connectedTo")
        if not a or not b or a not in by_id or b not in by_id:
            conn_parent[c["id"]] = a if a in by_id else "__world__"
            continue
        if b == agent_id and a != agent_id:
            a, b = b, a
        if a == b or b in has_parent or _creates_cycle(a, b):
            conn_parent[c["id"]] = a
            continue
        resolved.append({"parent": a, "child": b, "conn": c})
        has_parent.add(b)
        conn_parent[c["id"]] = a

    children_of: dict[str, list[dict]] = {}
    for r in resolved:
        children_of.setdefault(r["parent"], []).append(r)

    # Sensors ride rigidly on the body they were mounted to (fixed child).
    for o in objects:
        if o.get("role") != "sensor":
            continue
        p = o.get("attachedTo")
        if p and p in by_id and o["id"] not in has_parent and p != o["id"]:
            children_of.setdefault(p, []).append({"parent": p, "child": o["id"], "conn": None})
            has_parent.add(o["id"])

    visuals_of: dict[str, list[dict]] = {}
    for c in connectors:
        visuals_of.setdefault(conn_parent.get(c["id"], "__world__"), []).append(c)

    # ---- assemble the document ---------------------------------------------
    mujoco_el = ET.Element("mujoco", {"model": "telokine"})
    ET.SubElement(mujoco_el, "option", {"timestep": "0.002", "gravity": "0 -9.81 0"})
    ET.SubElement(mujoco_el, "compiler", {"angle": "radian", "autolimits": "true"})

    world = ET.SubElement(mujoco_el, "worldbody")
    ET.SubElement(world, "light", {"pos": "0 6 0", "dir": "0 -1 0", "diffuse": "0.7 0.7 0.7"})
    ET.SubElement(
        world,
        "geom",
        {
            "name": "ground",
            "type": "box",
            "size": "60 0.5 60",
            "pos": "0 -0.5 0",
            "rgba": "0.07 0.08 0.10 1",
            "friction": "0.8 0.02 0.02",
        },
    )

    actuators: list[tuple[str, float]] = []

    def emit_body(
        parent_el: ET.Element,
        oid: str,
        p_pos: Vec3,
        p_quat: Quat,
        conn: dict | None,
        is_root: bool,
        parent_moving: bool,
        lift: float,
    ) -> None:
        obj = by_id[oid]
        wpos = list(obj.get("position", [0, 0.5, 0]))
        # The whole assembly lifts uniformly (children inherit the same offset),
        # so a lifted agent never stretches away from the parts bolted to it.
        wpos[1] += lift
        wpos_t: Vec3 = (float(wpos[0]), float(wpos[1]), float(wpos[2]))
        wquat = _obj_quat(obj)

        inv = _quat_conj(p_quat)
        rel_pos = _quat_rot(inv, (wpos_t[0] - p_pos[0], wpos_t[1] - p_pos[1], wpos_t[2] - p_pos[2]))
        rel_quat = _quat_mul(inv, wquat)

        attrs = {"name": f"b_{oid}", "pos": _v3(rel_pos)}
        if not _is_identity_quat(rel_quat):
            attrs["quat"] = f"{_f(rel_quat[0])} {_f(rel_quat[1])} {_f(rel_quat[2])} {_f(rel_quat[3])}"
        body = ET.SubElement(parent_el, "body", attrs)

        has_dof = False
        if is_root:
            if _is_dynamic(obj):
                ET.SubElement(body, "freejoint", {"name": f"j_{oid}"})
                has_dof = True
        elif conn is not None:
            jtype = _JOINT_TYPE_MAP.get(conn.get("jointType", "hinge"), "hinge")
            anchor = conn.get("position", list(wpos_t))
            axis = conn.get("axis", [0, 0, 1])
            j_pos = _quat_rot(
                _quat_conj(wquat),
                (float(anchor[0]) - wpos_t[0], float(anchor[1]) - wpos_t[1], float(anchor[2]) - wpos_t[2]),
            )
            jattrs = {"name": f"j_{oid}", "type": jtype, "pos": _v3(j_pos)}
            if jtype != "ball":
                j_axis = _normalize3(_quat_rot(_quat_conj(wquat), (float(axis[0]), float(axis[1]), float(axis[2]))))
                jattrs["axis"] = _v3(j_axis)
            ET.SubElement(body, "joint", jattrs)
            has_dof = True
            if (
                conn.get("type") == "motor"
                and conn.get("controlMode", "torque") != "passive"
                and jtype != "ball"
            ):
                gear = max(0.2, float(conn.get("motorStrength", 2.5))) * 12.0
                actuators.append((f"j_{oid}", gear))

        moving = parent_moving or has_dof
        _build_geom(body, obj)
        if moving:
            mass = 0.05 if obj.get("role") in ("sensor", "connector") else max(float(obj.get("weight", 1)), 0.05)
            for geom in body.findall("geom"):
                geom.set("mass", _f(mass))

        for r in children_of.get(oid, []):
            emit_body(body, r["child"], wpos_t, wquat, r["conn"], False, moving, lift)
        for c in visuals_of.get(oid, []):
            emit_visual(body, c, wpos_t, wquat, moving, lift)

    def emit_visual(parent_el: ET.Element, c: dict, p_pos: Vec3, p_quat: Quat, parent_moving: bool, lift: float) -> None:
        wpos = list(c.get("position", [0, 0.5, 0]))
        wpos[1] += lift
        wpos_t: Vec3 = (float(wpos[0]), float(wpos[1]), float(wpos[2]))
        wquat = _obj_quat(c)
        inv = _quat_conj(p_quat)
        rel_pos = _quat_rot(inv, (wpos_t[0] - p_pos[0], wpos_t[1] - p_pos[1], wpos_t[2] - p_pos[2]))
        rel_quat = _quat_mul(inv, wquat)
        attrs = {"name": f"b_{c['id']}", "pos": _v3(rel_pos)}
        if not _is_identity_quat(rel_quat):
            attrs["quat"] = f"{_f(rel_quat[0])} {_f(rel_quat[1])} {_f(rel_quat[2])} {_f(rel_quat[3])}"
        body = ET.SubElement(parent_el, "body", attrs)
        # Connector geometry is decorative — it must never collide with the very
        # parts it joins, or the joint would jam.
        _build_geom(body, c, colliding=False)
        if parent_moving:
            for geom in body.findall("geom"):
                geom.set("mass", "0.05")

    roots = [o for o in objects if o["id"] not in has_parent and o.get("role") != "connector"]
    for obj in roots:
        lift = 1.0 if (obj.get("role") == "agent" and lift_agent) else 0.0
        emit_body(world, obj["id"], (0.0, 0.0, 0.0), (1.0, 0.0, 0.0, 0.0), None, True, False, lift)
    for c in visuals_of.get("__world__", []):
        emit_visual(world, c, (0.0, 0.0, 0.0), (1.0, 0.0, 0.0, 0.0), False, 0.0)

    if actuators:
        act_el = ET.SubElement(mujoco_el, "actuator")
        for joint_name, gear in actuators:
            ET.SubElement(
                act_el,
                "motor",
                {"joint": joint_name, "gear": _f(gear), "ctrlrange": "-1 1", "ctrllimited": "true"},
            )

    return ET.tostring(mujoco_el, encoding="unicode")


# --------------------------------------------------------------------------
# Simulator
# --------------------------------------------------------------------------

@dataclass
class Frame:
    """One snapshot of object transforms, ready to stream to the frontend."""

    objects: list[dict]

    def to_dict(self) -> dict:
        return {"type": "frame", "objects": self.objects}


class Simulator:
    """Steps a MuJoCo world built from a scene and reports per-object transforms.

    MuJoCo is imported lazily so the server still boots without the ``sim``
    extra installed (the /health endpoint and tests stay lightweight).
    """

    SUBSTEPS_PER_FRAME = 8  # 8 * 2ms = 16ms -> ~60fps streaming of real-time sim

    def __init__(self, scene: dict, seed: int | None = None) -> None:
        import mujoco  # lazy

        self._mj = mujoco
        self.scene = scene
        self._rng = random.Random(seed)

        # No artificial lift: the scene starts exactly where the user placed it
        # and settles naturally. Lifting the agent looked like a glitchy "launch",
        # especially for assembled robots.
        xml = build_mjcf(scene, lift_agent=False)
        self.model = mujoco.MjModel.from_xml_string(xml)
        self.data = mujoco.MjData(self.model)

        self._ids = [o["id"] for o in scene.get("objects", [])]
        self._agent_id = next(
            (o["id"] for o in scene.get("objects", []) if o.get("role") == "agent"),
            None,
        )

        # Cache the agent's qvel address (index of its first dof) for fast
        # speed checks. Model-level arrays return clean scalars, unlike the
        # per-joint view attributes which are wrapped as 1-element arrays.
        self._agent_dofadr = 0
        if self._agent_id:
            jid = mujoco.mj_name2id(
                self.model, mujoco.mjtObj.mjOBJ_JOINT, f"j_{self._agent_id}"
            )
            self._agent_dofadr = int(self.model.jnt_dofadr[jid])

        self.reset()

    def reset(self) -> None:
        mj = self._mj
        mj.mj_resetData(self.model, self.data)
        # Pure physics from the placed pose: the agent drops under gravity from
        # wherever (and however) the user positioned/rotated it. No random spin
        # — that was a step-2 stand-in before the cube became a real agent.
        mj.mj_forward(self.model, self.data)

    def step(self, n_substeps: int = SUBSTEPS_PER_FRAME) -> None:
        for _ in range(n_substeps):
            self._mj.mj_step(self.model, self.data)

    def agent_speed(self) -> float:
        """Linear speed of the agent body (used to detect settling)."""
        if not self._agent_id:
            return 0.0
        va = self._agent_dofadr
        v = self.data.qvel[va : va + 3]
        return float((v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5)

    def frame(self) -> Frame:
        objs = []
        for oid in self._ids:
            body = self.data.body(f"b_{oid}")
            x, y, z = (float(v) for v in body.xpos)
            qw, qx, qy, qz = (float(v) for v in body.xquat)
            # MuJoCo stores quaternions as [w,x,y,z]; Three.js wants [x,y,z,w].
            objs.append({"id": oid, "pos": [x, y, z], "rot": [qx, qy, qz, qw]})
        return Frame(objects=objs)
