"""Route-level tests for `/api/v1/trips/*`.

Services are monkey-patched with an in-memory fake so we get real
HTTP wiring coverage without a DB. `get_current_user` is overridden so
we don't need to issue session cookies.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.services import trips as trips_service
from app.services.trips import Trip, TripNotFoundError, TripQuotaExceededError
from app.services.users import User


@pytest.fixture
def logged_in_user() -> User:
    return User(
        id=99,
        google_sub="sub-99",
        email="user@example.com",
        name="Test User",
        picture_url=None,
    )


@pytest.fixture
def fake_trips_store() -> dict[int, Trip]:
    return {}


@pytest.fixture
def patched_app(
    monkeypatch: pytest.MonkeyPatch,
    logged_in_user: User,
    fake_trips_store: dict[int, Trip],
) -> Iterator[TestClient]:
    monkeypatch.setenv("APP_ENV", "local")
    from app.config import reset_settings_cache

    reset_settings_cache()

    def fake_list(user_id: int) -> list[Trip]:
        return [t for t in fake_trips_store.values() if t.user_id == user_id]

    def fake_get(*, trip_id: int, user_id: int) -> Trip:
        trip = fake_trips_store.get(trip_id)
        if not trip or trip.user_id != user_id:
            raise TripNotFoundError("not found")
        return trip

    next_id = {"value": 1}

    def fake_create(
        *, user_id, name, origin_address, destination_address, per_user_cap, total_cap
    ):
        owned = [t for t in fake_trips_store.values() if t.user_id == user_id]
        if len(owned) >= per_user_cap:
            raise TripQuotaExceededError("per-user")
        if len(fake_trips_store) >= total_cap:
            raise TripQuotaExceededError("total")
        trip = Trip(
            id=next_id["value"],
            user_id=user_id,
            name=name,
            origin_address=origin_address,
            destination_address=destination_address,
            created_at=datetime(2025, 11, 1, 12, 0),
        )
        next_id["value"] += 1
        fake_trips_store[trip.id] = trip
        return trip

    def fake_soft_delete(*, trip_id: int, user_id: int) -> None:
        trip = fake_trips_store.get(trip_id)
        if not trip or trip.user_id != user_id:
            raise TripNotFoundError("not found")
        del fake_trips_store[trip_id]

    def fake_heatmap(trip_id: int, week_start):  # noqa: ARG001
        return {
            "outbound": {"Mon": {"06:00": 42.0}},
            "return": {},
            "week_start_date": week_start.isoformat(),
            "weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        }

    def fake_sample_status(trip_id: int, week_start):  # noqa: ARG001
        return {"total": 840, "ready": 210}

    import app.api.trips_api as trips_api_mod

    monkeypatch.setattr(trips_api_mod, "list_trips_for_user", fake_list)
    monkeypatch.setattr(trips_api_mod, "get_trip_for_user", fake_get)
    monkeypatch.setattr(trips_api_mod, "create_trip", fake_create)
    monkeypatch.setattr(trips_api_mod, "soft_delete_trip", fake_soft_delete)
    monkeypatch.setattr(trips_api_mod, "get_heatmap_for_trip", fake_heatmap)
    monkeypatch.setattr(trips_api_mod, "sample_status_for_trip", fake_sample_status)
    # Prevent the background backfill from touching anything real.
    monkeypatch.setattr(trips_api_mod, "_kickoff_backfill", lambda _id: None)

    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: logged_in_user
    with TestClient(app) as c:
        yield c


def test_requires_auth_without_override() -> None:
    """Without the dependency override, every trips route is 401."""
    from app.config import reset_settings_cache
    from app.main import create_app

    reset_settings_cache()
    app = create_app()
    with TestClient(app) as c:
        assert c.get("/api/v1/trips").status_code == 401
        assert c.post("/api/v1/trips", json={}).status_code == 401


def test_list_trips_empty(patched_app: TestClient) -> None:
    r = patched_app.get("/api/v1/trips")
    assert r.status_code == 200
    assert r.json() == []


def test_create_trip_returns_backfill_status(patched_app: TestClient) -> None:
    r = patched_app.post(
        "/api/v1/trips",
        json={
            "name": "Commute",
            "origin_address": "A St",
            "destination_address": "B Ave",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == 1
    assert body["name"] == "Commute"
    assert body["backfill"] == {
        "total": 840,
        "ready": 210,
        "percent_complete": 25.0,
    }


def test_create_trip_rejects_same_origin_destination(patched_app: TestClient) -> None:
    r = patched_app.post(
        "/api/v1/trips",
        json={"origin_address": "same", "destination_address": "same"},
    )
    assert r.status_code == 400


def test_create_trip_enforces_per_user_cap(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Pre-fill up to 3 trips.
    for i in range(3):
        fake_trips_store[i + 1] = Trip(
            id=i + 1,
            user_id=99,
            name=f"T{i}",
            origin_address="a",
            destination_address="b",
            created_at=None,
        )

    r = patched_app.post(
        "/api/v1/trips",
        json={
            "origin_address": "100 Main St",
            "destination_address": "200 Oak Ave",
        },
    )
    assert r.status_code == 409


def test_get_trip_unknown_id_404s(patched_app: TestClient) -> None:
    r = patched_app.get("/api/v1/trips/12345")
    assert r.status_code == 404


def test_delete_trip_removes_it(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="a",
        destination_address="b",
        created_at=None,
    )
    r = patched_app.delete("/api/v1/trips/1")
    assert r.status_code == 204
    assert 1 not in fake_trips_store


def test_heatmap_returns_expected_shape(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="a",
        destination_address="b",
        created_at=None,
    )
    r = patched_app.get("/api/v1/trips/1/heatmap")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) >= {"outbound", "return", "week_start_date", "weekdays"}
    assert body["outbound"] == {"Mon": {"06:00": 42.0}}


def test_current_week_start_is_monday() -> None:
    # Thursday 2025-11-13 → Monday 2025-11-10
    from datetime import date as d

    assert trips_service.current_week_start(d(2025, 11, 13)) == d(2025, 11, 10)
