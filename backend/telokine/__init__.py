"""Telokine backend — Layer 2 (simulation) + Layer 3 (learning).

The frontend never touches tensors, physics solvers, or RL algorithms. It
talks to this process over HTTP (control) and WebSocket (live telemetry + sim
state). Everything the user shouldn't see lives here.
"""

__version__ = "0.1.0"
