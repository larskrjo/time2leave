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
def fake_mutation_log() -> list[dict]:
    """Fake `trip_mutation_log` rows. Tests can inspect/seed this."""
    return []


@pytest.fixture
def patched_app(
    monkeypatch: pytest.MonkeyPatch,
    logged_in_user: User,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
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

    from app.services.trips import _UNSET

    def fake_update(
        *,
        trip_id: int,
        user_id: int,
        name=_UNSET,
        origin_address=None,
        destination_address=None,
    ):
        trip = fake_trips_store.get(trip_id)
        if not trip or trip.user_id != user_id:
            raise TripNotFoundError("not found")
        new_name = trip.name if name is _UNSET else name
        new_origin = (
            origin_address.strip()
            if origin_address is not None
            else trip.origin_address
        )
        new_destination = (
            destination_address.strip()
            if destination_address is not None
            else trip.destination_address
        )
        if new_origin.lower() == new_destination.lower():
            raise ValueError("same address")
        addresses_changed = (
            new_origin != trip.origin_address
            or new_destination != trip.destination_address
        )
        updated = Trip(
            id=trip.id,
            user_id=trip.user_id,
            name=new_name,
            origin_address=new_origin,
            destination_address=new_destination,
            created_at=trip.created_at,
        )
        fake_trips_store[trip_id] = updated
        return updated, addresses_changed

    def fake_count(user_id: int) -> int:
        return len([t for t in fake_trips_store.values() if t.user_id == user_id])

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

    # In-memory `trip_mutation_log` so we can test the rolling-7-day cap
    # without a DB. The fakes preserve the real service's invariants:
    # `assert_mutation_quota` raises when at-or-over the cap, and
    # `record_mutation` appends a row that future calls count against.
    from app.services.trip_mutations import (
        MutationQuota,
        TripMutationQuotaExceededError,
    )

    def fake_assert_quota(user_id, settings):  # noqa: ARG001
        used = sum(1 for r in fake_mutation_log if r["user_id"] == user_id)
        limit = settings.max_trip_mutations_per_week
        if used >= limit:
            raise TripMutationQuotaExceededError(
                used=used, limit=limit, retry_after_seconds=3600
            )

    def fake_mutation_quota(user_id, settings):
        used = sum(1 for r in fake_mutation_log if r["user_id"] == user_id)
        return MutationQuota(
            used=used,
            limit=settings.max_trip_mutations_per_week,
            oldest_age_seconds=None if used == 0 else 60,
        )

    def fake_record_mutation(*, user_id, trip_id, kind):
        fake_mutation_log.append(
            {"user_id": user_id, "trip_id": trip_id, "kind": kind}
        )

    monkeypatch.setattr(trips_api_mod, "list_trips_for_user", fake_list)
    monkeypatch.setattr(trips_api_mod, "get_trip_for_user", fake_get)
    monkeypatch.setattr(trips_api_mod, "create_trip", fake_create)
    monkeypatch.setattr(trips_api_mod, "soft_delete_trip", fake_soft_delete)
    monkeypatch.setattr(trips_api_mod, "update_trip", fake_update)
    monkeypatch.setattr(trips_api_mod, "count_trips_for_user", fake_count)
    monkeypatch.setattr(trips_api_mod, "get_heatmap_for_trip", fake_heatmap)
    monkeypatch.setattr(trips_api_mod, "sample_status_for_trip", fake_sample_status)
    monkeypatch.setattr(trips_api_mod, "assert_mutation_quota", fake_assert_quota)
    monkeypatch.setattr(
        trips_api_mod, "mutation_quota_for_user", fake_mutation_quota
    )
    monkeypatch.setattr(trips_api_mod, "record_mutation", fake_record_mutation)
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
    # Pre-fill exactly the configured per-user limit so adding one more
    # is the *first* request to breach the cap. Reads the limit from
    # settings instead of hard-coding it so this test stays correct
    # whether the default is 1, 3, or anything else.
    from app.config import get_settings

    limit = get_settings().max_trips_per_user
    for i in range(limit):
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


def test_admin_user_gets_elevated_per_user_trip_cap(
    patched_app: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Admins (emails in ADMIN_EMAILS) get `max_trips_per_admin`, not `_per_user`.

    Mutation cap is bumped here so the post loop isn't blocked by the
    weekly mutation guard before we can test the trip-count guard.
    """
    monkeypatch.setenv("ADMIN_EMAILS", "user@example.com")  # matches fixture user
    monkeypatch.setenv("MAX_TRIPS_PER_USER", "1")
    monkeypatch.setenv("MAX_TRIPS_PER_ADMIN", "2")
    monkeypatch.setenv("MAX_TRIP_MUTATIONS_PER_WEEK", "5")
    from app.config import reset_settings_cache

    reset_settings_cache()

    r = patched_app.get("/api/v1/trips/quota")
    assert r.status_code == 200
    assert r.json()["limit"] == 2

    for i in range(2):
        r = patched_app.post(
            "/api/v1/trips",
            json={
                "origin_address": f"{100 + i} Main St",
                "destination_address": f"{200 + i} Oak Ave",
            },
        )
        assert r.status_code == 201, r.text

    r = patched_app.post(
        "/api/v1/trips",
        json={
            "origin_address": "999 Nope St",
            "destination_address": "888 Stop Ave",
        },
    )
    assert r.status_code == 409


def test_non_admin_user_keeps_lower_per_user_trip_cap(
    patched_app: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sanity check the inverse: a non-admin sees `max_trips_per_user`."""
    monkeypatch.setenv("ADMIN_EMAILS", "someone-else@example.com")
    monkeypatch.setenv("MAX_TRIPS_PER_USER", "1")
    monkeypatch.setenv("MAX_TRIPS_PER_ADMIN", "2")
    from app.config import reset_settings_cache

    reset_settings_cache()

    r = patched_app.get("/api/v1/trips/quota")
    assert r.status_code == 200
    assert r.json()["limit"] == 1


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


def test_quota_endpoint_reports_used_and_limit(
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
    r = patched_app.get("/api/v1/trips/quota")
    assert r.status_code == 200
    body = r.json()
    assert body["used"] == 1
    assert body["limit"] >= 1


def test_patch_trip_renames_without_touching_addresses(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="old",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    r = patched_app.patch("/api/v1/trips/1", json={"name": "renamed"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "renamed"
    assert body["origin_address"] == "100 Main St"


def test_patch_trip_swap_flips_origin_and_destination(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    r = patched_app.patch("/api/v1/trips/1", json={"swap_addresses": True})
    assert r.status_code == 200
    body = r.json()
    assert body["origin_address"] == "200 Oak Ave"
    assert body["destination_address"] == "100 Main St"


def test_patch_trip_clear_name_sets_it_to_null(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="had a name",
        origin_address="a st",
        destination_address="b st",
        created_at=None,
    )
    r = patched_app.patch("/api/v1/trips/1", json={"clear_name": True})
    assert r.status_code == 200
    assert r.json()["name"] is None


def test_patch_trip_rejects_same_origin_destination(
    patched_app: TestClient, fake_trips_store: dict[int, Trip]
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    r = patched_app.patch(
        "/api/v1/trips/1",
        json={"origin_address": "same addr", "destination_address": "same addr"},
    )
    assert r.status_code == 400


def test_current_week_start_is_monday() -> None:
    # Thursday 2025-11-13 → Monday 2025-11-10
    from datetime import date as d

    assert trips_service.current_week_start(d(2025, 11, 13)) == d(2025, 11, 10)


class _StubValidator:
    """Test double that rejects a preconfigured set of addresses.

    Lets us exercise the prod validation path without mocking the real
    Google Geocoding HTTP call at the route layer.
    """

    def __init__(self, invalid: set[str]) -> None:
        self._invalid = invalid
        self.calls: list[str] = []

    def validate(self, address: str):
        from app.services.address_validation import AddressValidation

        self.calls.append(address)
        if address in self._invalid:
            return AddressValidation(
                is_valid=False, reason=f"fake: rejected {address!r}"
            )
        return AddressValidation(is_valid=True, canonical=address)


def _install_validator(
    monkeypatch: pytest.MonkeyPatch, invalid: set[str]
) -> _StubValidator:
    stub = _StubValidator(invalid=invalid)
    import app.api.trips_api as trips_api_mod

    monkeypatch.setattr(
        trips_api_mod, "get_address_validator", lambda _settings=None: stub
    )
    return stub


def test_create_trip_rejects_invalid_address(
    patched_app: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub = _install_validator(monkeypatch, invalid={"bogus origin"})
    r = patched_app.post(
        "/api/v1/trips",
        json={
            "name": "Commute",
            "origin_address": "bogus origin",
            "destination_address": "200 Oak Ave",
        },
    )
    assert r.status_code == 400
    assert "bogus origin" in r.json()["detail"]
    # The origin should short-circuit before the destination is checked.
    assert stub.calls == ["bogus origin"]


def test_create_trip_accepts_valid_addresses_via_validator(
    patched_app: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub = _install_validator(monkeypatch, invalid=set())
    r = patched_app.post(
        "/api/v1/trips",
        json={
            "name": "Commute",
            "origin_address": "100 Main St",
            "destination_address": "200 Oak Ave",
        },
    )
    assert r.status_code == 201
    assert stub.calls == ["100 Main St", "200 Oak Ave"]


def test_patch_trip_validates_only_changed_origin(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    stub = _install_validator(monkeypatch, invalid={"junk"})
    r = patched_app.patch(
        "/api/v1/trips/1",
        json={"origin_address": "junk"},
    )
    assert r.status_code == 400
    # Destination wasn't in the request, so we shouldn't waste a
    # Geocoding call on it.
    assert stub.calls == ["junk"]


def test_patch_trip_skips_validation_when_addresses_unchanged(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    stub = _install_validator(monkeypatch, invalid=set())
    r = patched_app.patch(
        "/api/v1/trips/1",
        json={
            "origin_address": "100 Main St",
            "destination_address": "200 Oak Ave",
        },
    )
    assert r.status_code == 200
    # Nothing actually changed, so the validator should be untouched.
    assert stub.calls == []


def test_patch_trip_swap_skips_validation(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    # Both addresses would be "invalid" per the stub, but a swap is
    # reusing already-stored values, so we skip validation.
    stub = _install_validator(
        monkeypatch, invalid={"100 Main St", "200 Oak Ave"}
    )
    r = patched_app.patch("/api/v1/trips/1", json={"swap_addresses": True})
    assert r.status_code == 200
    assert stub.calls == []


# ---------------------------------------------------------------------------
# Weekly mutation quota
# ---------------------------------------------------------------------------


def test_quota_endpoint_includes_mutation_counters(
    patched_app: TestClient,
) -> None:
    """The /quota endpoint should expose the rolling mutation budget."""
    from app.config import get_settings

    settings = get_settings()
    r = patched_app.get("/api/v1/trips/quota")
    assert r.status_code == 200
    body = r.json()
    assert body["used"] == 0
    assert body["limit"] == settings.max_trips_per_user
    assert body["mutations_used"] == 0
    assert body["mutations_limit"] == settings.max_trip_mutations_per_week
    assert body["mutations_oldest_age_seconds"] is None


def test_create_trip_logs_a_mutation(
    patched_app: TestClient, fake_mutation_log: list[dict]
) -> None:
    r = patched_app.post(
        "/api/v1/trips",
        json={"origin_address": "100 Main St", "destination_address": "200 Oak Ave"},
    )
    assert r.status_code == 201
    assert len(fake_mutation_log) == 1
    assert fake_mutation_log[0]["kind"] == "create"


def test_create_trip_429_when_at_mutation_cap(
    patched_app: TestClient,
    fake_mutation_log: list[dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MAX_TRIP_MUTATIONS_PER_WEEK", "2")
    from app.config import reset_settings_cache

    reset_settings_cache()

    # Pre-fill 2 mutations -> at the cap.
    for _ in range(2):
        fake_mutation_log.append({"user_id": 99, "trip_id": 1, "kind": "create"})

    r = patched_app.post(
        "/api/v1/trips",
        json={
            "origin_address": "100 Main St",
            "destination_address": "200 Oak Ave",
        },
    )
    assert r.status_code == 429
    assert "weekly trip changes" in r.json()["detail"].lower()
    assert "Retry-After" in r.headers


def test_patch_name_only_does_not_count(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    r = patched_app.patch("/api/v1/trips/1", json={"name": "Renamed"})
    assert r.status_code == 200
    # Name-only patch is free; mutation log untouched.
    assert fake_mutation_log == []


def test_patch_address_change_logs_a_mutation(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    _install_validator(monkeypatch, invalid=set())
    r = patched_app.patch(
        "/api/v1/trips/1", json={"origin_address": "999 Different St"}
    )
    assert r.status_code == 200
    assert len(fake_mutation_log) == 1
    assert fake_mutation_log[0]["kind"] == "address_change"


def test_patch_swap_logs_a_mutation(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="100 Main St",
        destination_address="200 Oak Ave",
        created_at=None,
    )
    r = patched_app.patch("/api/v1/trips/1", json={"swap_addresses": True})
    assert r.status_code == 200
    assert len(fake_mutation_log) == 1
    assert fake_mutation_log[0]["kind"] == "swap"


def test_patch_address_change_429_when_at_cap(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MAX_TRIP_MUTATIONS_PER_WEEK", "2")
    from app.config import reset_settings_cache

    reset_settings_cache()

    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="A",
        destination_address="B",
        created_at=None,
    )
    fake_mutation_log.extend(
        [
            {"user_id": 99, "trip_id": 1, "kind": "create"},
            {"user_id": 99, "trip_id": 1, "kind": "address_change"},
        ]
    )

    stub = _install_validator(monkeypatch, invalid=set())
    r = patched_app.patch(
        "/api/v1/trips/1", json={"origin_address": "C is different"}
    )
    assert r.status_code == 429
    # Crucially: we 429 *before* paying for Geocoding.
    assert stub.calls == []


def test_delete_trip_does_not_consume_mutation(
    patched_app: TestClient,
    fake_trips_store: dict[int, Trip],
    fake_mutation_log: list[dict],
) -> None:
    fake_trips_store[1] = Trip(
        id=1,
        user_id=99,
        name="x",
        origin_address="A",
        destination_address="B",
        created_at=None,
    )
    r = patched_app.delete("/api/v1/trips/1")
    assert r.status_code == 204
    assert fake_mutation_log == []
