"""API-level tests for the commute heatmap endpoints.

The DB pool is overridden with a FakePool and `pandas.read_sql` is
monkey-patched to return a canned DataFrame, so these tests never touch
MySQL. See tests/conftest.py for the fixture wiring.
"""

from __future__ import annotations


def test_root(client_with_pool):
    r = client_with_pool.get("/api/v1/")
    assert r.status_code == 200
    body = r.json()
    assert body["message"] == "Traffic Commute API"
    assert body["version"] == "1.0.0"


def test_heatmap_returns_both_directions(client_with_pool):
    r = client_with_pool.get("/api/v1/commute/heatmap")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"Home → Work", "Work → Home"}
    h2w = body["Home → Work"]
    assert h2w["period"] == "Morning"
    assert h2w["weekdays"] == ["Mon", "Tue", "Wed", "Thu", "Fri"]


def test_heatmap_filtered_by_direction(client_with_pool):
    r = client_with_pool.get(
        "/api/v1/commute/heatmap", params={"direction": "Home → Work"}
    )
    assert r.status_code == 200
    assert set(r.json().keys()) == {"Home → Work"}


def test_heatmap_unknown_direction_404(client_with_pool):
    r = client_with_pool.get(
        "/api/v1/commute/heatmap", params={"direction": "bogus"}
    )
    assert r.status_code == 404


def test_directions_endpoint(client_with_pool):
    r = client_with_pool.get("/api/v1/commute/directions")
    assert r.status_code == 200
    assert set(r.json()["directions"]) == {"Home → Work", "Work → Home"}
