"""Docker-backed end-to-end test for the multi-user trip flow.

Spins up a real MySQL 8 container via testcontainers, applies the repo's
schema + seed SQL, then drives the full user journey through the
FastAPI TestClient:

    1. POST /api/v1/auth/dev-login           — log in as a seeded allowlist user
    2. POST /api/v1/trips                    — create a trip (backfill kicked off)
    3. GET  /api/v1/trips/{id}/heatmap       — empty scaffold (zeros / nulls)
    4. Run data_gathering.backfill_trip_current_week with a FixtureProvider
    5. GET  /api/v1/trips/{id}/heatmap       — now populated
    6. GET  /api/v1/trips/{id}/backfill-status — 100% complete
    7. DELETE /api/v1/trips/{id}             — soft-delete removes it

Opt in with: `pytest -m integration`
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def mysql_container():
    pytest.importorskip("testcontainers.mysql")
    from testcontainers.mysql import MySqlContainer

    # Connect as root so the schema's CREATE DATABASE / foreign keys don't
    # trip over a limited test user. `dbname="mysql"` gives us an initial
    # DB to connect to before our schema creates the real one.
    container = MySqlContainer(
        "mysql:8",
        dialect="mysql",
        username="root",
        root_password="test-root-pw",
        password="test-root-pw",
        dbname="mysql",
    )
    with container as c:
        c.start()
        yield c


@pytest.fixture(scope="module")
def monkeypatch_module_env():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def _split_sql(text: str) -> list[str]:
    cleaned: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        cleaned.append(line)
    joined = "\n".join(cleaned)
    return [s.strip() for s in joined.split(";") if s.strip()]


@pytest.fixture(scope="module")
def seeded_app(mysql_container, monkeypatch_module_env) -> Iterator[TestClient]:
    import mysql.connector

    host = mysql_container.get_container_host_ip()
    port = int(mysql_container.get_exposed_port(3306))
    user = mysql_container.username
    password = mysql_container.password

    init_dir = Path(__file__).resolve().parents[2] / "db" / "init"

    conn = mysql.connector.connect(
        host=host, port=port, user=user, password=password, autocommit=True
    )
    cursor = conn.cursor()
    for sql_file in sorted(init_dir.glob("*.sql")):
        for stmt in _split_sql(sql_file.read_text()):
            cursor.execute(stmt)
    cursor.close()
    conn.close()

    monkeypatch_module_env.setenv("APP_ENV", "local")
    monkeypatch_module_env.setenv("MYSQL_HOST", host)
    monkeypatch_module_env.setenv("MYSQL_PORT", str(port))
    monkeypatch_module_env.setenv("MYSQL_USER", user)
    monkeypatch_module_env.setenv("MYSQL_PASSWORD", password)
    monkeypatch_module_env.setenv("MYSQL_DATABASE", "time2leave")
    monkeypatch_module_env.setenv("SESSION_SECRET", "integration-secret-32-bytes-long")
    monkeypatch_module_env.setenv("ENABLE_DEV_LOGIN", "true")
    monkeypatch_module_env.setenv("ADMIN_EMAILS", "dev@example.com")

    from app.config import reset_settings_cache
    from app.db.db import reset_pool_for_tests
    from app.main import create_app

    reset_settings_cache()
    reset_pool_for_tests()

    with TestClient(create_app()) as client:
        yield client


def test_multiuser_flow(seeded_app: TestClient) -> None:
    # 1. Log in as the seeded dev user.
    r = seeded_app.post(
        "/api/v1/auth/dev-login",
        json={"email": "dev@example.com", "name": "Dev"},
    )
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == "dev@example.com"
    assert me["is_admin"] is True

    # 2. Create a brand-new trip (separate from the seeded one).
    r = seeded_app.post(
        "/api/v1/trips",
        json={
            "name": "Weekend beach run",
            "origin_address": "123 Alpha St, Cupertino, CA",
            "destination_address": "999 Ocean Blvd, Santa Cruz, CA",
        },
    )
    assert r.status_code == 201, r.text
    trip = r.json()
    trip_id = trip["id"]
    assert trip["backfill"]["total"] >= 0

    # 3. Empty heatmap scaffold: the outbound/return keys exist even
    # before the backfill is run; minutes are None for unfilled slots.
    r = seeded_app.get(f"/api/v1/trips/{trip_id}/heatmap")
    assert r.status_code == 200
    heatmap = r.json()
    assert set(heatmap.keys()) >= {"outbound", "return", "week_start_date", "weekdays"}

    # 4. Synchronous backfill with a FixtureProvider so we don't hit Google.
    from app.job.data_gathering import backfill_trip_current_week
    from app.job.providers import FixtureProvider

    backfill_trip_current_week(trip_id, provider=FixtureProvider())

    # 5. Heatmap is populated — at least one weekday has at least one slot.
    r = seeded_app.get(f"/api/v1/trips/{trip_id}/heatmap")
    assert r.status_code == 200
    heatmap = r.json()
    assert "Mon" in heatmap["outbound"]
    first_mon_value = next(iter(heatmap["outbound"]["Mon"].values()))
    assert first_mon_value is not None
    assert first_mon_value > 0

    # 6. Backfill status reports 100%.
    r = seeded_app.get(f"/api/v1/trips/{trip_id}/backfill-status")
    assert r.status_code == 200
    status = r.json()
    assert status["total"] > 0
    assert status["ready"] == status["total"]
    assert status["percent_complete"] == 100.0

    # 7. Delete the trip; it disappears from /trips.
    r = seeded_app.delete(f"/api/v1/trips/{trip_id}")
    assert r.status_code == 204

    remaining_ids = {t["id"] for t in seeded_app.get("/api/v1/trips").json()}
    assert trip_id not in remaining_ids


def test_ceiling_blocks_weekly_job_when_planned_budget_exceeds_cap(
    seeded_app: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """A misconfigured ceiling should abort `main()` before any DB writes."""
    from app.config import get_settings, reset_settings_cache

    settings = get_settings()
    settings.max_weekly_routes_calls = 10  # absurdly low

    from app.job.data_gathering import main
    from app.job.providers import FixtureProvider

    class CountingProvider(FixtureProvider):
        calls = 0

        def fetch(self, *args, **kwargs):
            CountingProvider.calls += 1
            return super().fetch(*args, **kwargs)

    CountingProvider.calls = 0
    with caplog.at_level("ERROR"):
        main(provider=CountingProvider(), settings=settings)

    # Ceiling hit → no provider calls made.
    assert CountingProvider.calls == 0
    assert any(
        "exceeds MAX_WEEKLY_ROUTES_CALLS" in rec.message for rec in caplog.records
    )
    reset_settings_cache()
