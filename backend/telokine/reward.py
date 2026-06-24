"""Layer 3 helper: translate the frontend's reward blocks into per-step rewards.

The user builds behavior with visual blocks; this module is the bridge between
those blocks and the scalar reward signal PPO optimizes. Blocks arrive as JSON:

    {"id": "...", "kind": "reward",  "name": "Approach Target", "weight": 1.0}
    {"id": "...", "kind": "penalty", "name": "Fall",            "weight": 2.0}

The user never sees this — they only see behavior.
"""
from __future__ import annotations

from dataclasses import dataclass

# Catalog shown verbatim in the frontend's block editor (step 5).
BLOCK_CATALOG: dict[str, list[str]] = {
    "reward": ["Approach Target", "Attraction", "Reach Target", "Stay Upright", "Move Forward"],
    "penalty": ["Fall", "Touch Wall", "Move Backward", "Exertion"],
}


@dataclass
class RewardBlock:
    kind: str  # "reward" | "penalty"
    name: str
    weight: float = 1.0


def compile_blocks(blocks: list[dict]) -> list[RewardBlock]:
    """Turn raw JSON blocks from the editor into typed objects."""
    return [
        RewardBlock(
            kind=b.get("kind", "reward"),
            name=b["name"],
            weight=float(b.get("weight", 1.0)),
        )
        for b in blocks
    ]


def evaluate(blocks: list[RewardBlock], state: dict) -> float:
    """Compute the scalar reward for one physics step.

    ``state`` will carry per-step quantities (distance to target, velocities,
    contact flags, upright measure, ...).
    """
    if not blocks:
        blocks = [
            RewardBlock(kind="reward", name="Approach Target", weight=1.0),
            RewardBlock(kind="reward", name="Reach Target", weight=4.0),
            RewardBlock(kind="penalty", name="Exertion", weight=0.4),
        ]

    total = 0.0
    for block in blocks:
        magnitude = _term(block.name, state)
        sign = -1.0 if block.kind == "penalty" else 1.0
        total += sign * block.weight * magnitude
    return float(total)


def _term(name: str, state: dict) -> float:
    if name in ("Approach Target", "Attraction"):
        return max(-1.0, min(1.0, float(state.get("progress", 0.0)))) * 0.5
    if name == "Reach Target":
        return 10.0 if state.get("reached") else 0.0
    if name == "Stay Upright":
        return max(0.0, float(state.get("upright", 0.0)))
    if name == "Move Forward":
        return max(0.0, float(state.get("forward_delta", 0.0)))
    if name == "Fall":
        return 4.0 if state.get("fallen") else 0.0
    if name == "Touch Wall":
        return 3.0 if state.get("out_of_bounds") else 0.0
    if name == "Move Backward":
        return max(0.0, -float(state.get("forward_delta", 0.0)))
    if name == "Exertion":
        return 0.01 * float(state.get("action_energy", 0.0))
    return 0.0
