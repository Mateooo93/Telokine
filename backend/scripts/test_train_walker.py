#!/usr/bin/env python3
"""Quick repro for training errors."""
import json
import traceback
from telokine.train import train

scene = json.loads(
    """{"objects": [
  {"id":"a","type":"cube","role":"agent","position":[-2,1.05,0],"rotation":[0,0,0],
   "dimensions":[1.1,0.42,0.6],"size":1,"radius":0.5,"weight":2,"friction":0.8,"pinned":false,"color":"#c9933f"},
  {"id":"l1","type":"beam","role":"body","position":[-2,0.5,-0.36],"rotation":[0,0,0.35],
   "dimensions":[0.24,1.1,0.24],"size":1,"radius":0.12,"weight":1,"friction":0.8,"pinned":false,"color":"#b9c0c3"},
  {"id":"m1","type":"motor","role":"connector","position":[-2,0.84,-0.36],"rotation":[0,0,0],
   "attachedTo":"a","connectedTo":"l1","axis":[0,0,1],"jointType":"hinge","controlMode":"torque",
   "motorStrength":4,"size":0.2,"radius":0.1,"weight":0.1,"friction":0.5,"pinned":false,"color":"#888"},
  {"id":"l2","type":"beam","role":"body","position":[-2,0.5,0.36],"rotation":[0,0,-0.35],
   "dimensions":[0.24,1.1,0.24],"size":1,"radius":0.12,"weight":1,"friction":0.8,"pinned":false,"color":"#b9c0c3"},
  {"id":"m2","type":"motor","role":"connector","position":[-2,0.84,0.36],"rotation":[0,0,0],
   "attachedTo":"a","connectedTo":"l2","axis":[0,0,1],"jointType":"hinge","controlMode":"torque",
   "motorStrength":4,"size":0.2,"radius":0.1,"weight":0.1,"friction":0.5,"pinned":false,"color":"#888"},
  {"id":"t","type":"target","role":"target","position":[4,0.5,0],"rotation":[0,0,0],
   "dimensions":[0.5,0.5,0.5],"size":1,"radius":0.25,"weight":0.1,"friction":0.5,"pinned":false,"color":"#e85d5d"}
], "training": {"episode_length": 250, "action_power": 1, "curriculum": 0.25}}"""
)

rewards = [{"id": "b1", "kind": "Attraction", "name": "Approach", "weight": 1.0}]


def emit(m):
    if m.get("type") == "error":
        print("ERROR MSG:", m.get("message"))
    elif m.get("type") in ("done", "telemetry"):
        print(m.get("type"), m)


try:
    train(scene, rewards, 2048, emit, lambda: False, model_id="test")
    print("OK")
except Exception:
    traceback.print_exc()
