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
    "reward": ["Approach Target", "Reach Target", "Stay Upright", "Move Forward"],
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
    contact flags, upright measure, ...). Implemented in step 5.
    """
    raise NotImplementedError("Wired in step 5 (reward blocks).")
