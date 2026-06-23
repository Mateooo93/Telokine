"""Smoke tests that don't require the heavy ML extra."""


def test_imports():
    import telokine.reward  # noqa: F401
    import telokine.server  # noqa: F401

    assert True


def test_block_catalog():
    from telokine.reward import BLOCK_CATALOG, compile_blocks

    assert "Approach Target" in BLOCK_CATALOG["reward"]
    assert "Fall" in BLOCK_CATALOG["penalty"]

    blocks = compile_blocks(
        [
            {"kind": "reward", "name": "Approach Target", "weight": 1.0},
            {"kind": "penalty", "name": "Fall", "weight": 2.0},
        ]
    )
    assert blocks[0].kind == "reward"
    assert blocks[1].weight == 2.0


def test_health_endpoint():
    from fastapi.testclient import TestClient

    from telokine.server import app

    # TestClient needs httpx; skip gracefully if unavailable.
    try:
        client = TestClient(app)
    except Exception:  # pragma: no cover
        return
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
