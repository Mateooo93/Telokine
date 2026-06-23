"""Layer 2: a MuJoCo physics simulator built from the frontend scene model.

No learning here — just gravity, collisions, and balance. The user never sees
this module; they press Run and watch the world behave realistically.

The scene model is identical to ``src/viewport/types.ts`` on the frontend, so
what the user edits is exactly what gets simulated.
"""
from __future__ import annotations

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


def _hex_to_rgba(hexstr: str, alpha: float = 1.0) -> str:
    h = hexstr.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return f"{r:.4f} {g:.4f} {b:.4f} {_f(alpha)}"


def _build_geom(body: ET.Element, obj: dict) -> None:
    """Append the right <geom> for an object type onto its <body>."""
    t = obj.get("type", "cube")
    friction = f"{_f(obj.get('friction', 0.5))} 0.01 0.01"

    if t == "cube":
        h = obj.get("size", 1) / 2.0
        geom = ET.SubElement(body, "geom", {"type": "box", "size": _v3([h, h, h])})
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


def build_mjcf(scene: dict) -> str:
    """Translate the scene model into an MJCF XML string.

    The world is built Y-up to match Three.js exactly, so object positions and
    quaternions pass through between frontend and backend with no conversion.
    """
    mujoco_el = ET.Element("mujoco", {"model": "telokine"})
    ET.SubElement(mujoco_el, "option", {"timestep": "0.002", "gravity": "0 -9.81 0"})

    world = ET.SubElement(mujoco_el, "worldbody")
    ET.SubElement(
        world,
        "light",
        {"pos": "0 6 0", "dir": "0 -1 0", "diffuse": "0.7 0.7 0.7"},
    )

    # Always-present ground (a thin box, top surface at y=0) so agents always
    # have something to land on.
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

    for obj in scene.get("objects", []):
        oid = obj["id"]
        role = obj.get("role", "static")
        # Lift the agent a little so every Run shows a visible drop under gravity.
        pos = list(obj.get("position", [0, 0.5, 0]))
        if role == "agent":
            pos[1] = pos[1] + 1.0

        body = ET.SubElement(
            world,
            "body",
            {"name": f"b_{oid}", "pos": _v3(pos)},
        )
        if role == "agent":
            ET.SubElement(body, "freejoint", {"name": f"j_{oid}"})
        _build_geom(body, obj)

        # Dynamic bodies carry their mass; welded (static) bodies inherit world.
        if role == "agent":
            for geom in body.findall("geom"):
                geom.set("mass", _f(max(obj.get("weight", 1), 0.05)))

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

        xml = build_mjcf(scene)
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

        # Give the agent a random horizontal shove + spin so the drop tumbles —
        # a stand-in for real control until step 3 (agent actions) lands.
        if self._agent_id:
            va = self._agent_dofadr
            self.data.qvel[va + 0] = self._rng.uniform(-2.0, 2.0)  # vx
            self.data.qvel[va + 1] = self._rng.uniform(-2.0, 2.0)  # vy
            self.data.qvel[va + 3] = self._rng.uniform(-3.0, 3.0)  # wx
            self.data.qvel[va + 4] = self._rng.uniform(-3.0, 3.0)  # wy
            self.data.qvel[va + 5] = self._rng.uniform(-3.0, 3.0)  # wz

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
