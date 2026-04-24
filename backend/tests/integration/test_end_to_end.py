"""Docker-backed end-to-end tests.

These tests spin up a real MySQL container, apply the db/init SQL, seed fake
data through the FixtureProvider, and assert the /api/v1/commute/heatmap
endpoint returns the expected shape. Opt-in via:

    pytest -m integration

(Excluded from the default run to keep CI + local iteration fast.)
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def mysql_container():
    pytest.importorskip("testcontainers.mysql")
    from testcontainers.mysql import MySqlContainer

    with MySqlContainer("mysql:8", dialect="mysql") as container:
        container.start()
        yield container


@pytest.fixture(scope="module")
def seeded_env(mysql_container, monkeypatch_module_env):
    """Apply schema + seed, then hand control back configured to point at the container."""
    import mysql.connector

    host = mysql_container.get_container_host_ip()
    port = int(mysql_container.get_exposed_port(3306))
    user = mysql_container.username
    password = mysql_container.password

    # Run schema + seed from the repo files.
    init_dir = Path(__file__).resolve().parents[2] / "db" / "init"

    conn = mysql.connector.connect(
        host=host, port=port, user=user, password=password, autocommit=True
    )
    cursor = conn.cursor()
    for sql_file in sorted(init_dir.glob("*.sql")):
        statements = _split_sql(sql_file.read_text())
        for stmt in statements:
            if stmt.strip():
                cursor.execute(stmt)
    cursor.close()
    conn.close()

    monkeypatch_module_env.setenv("APP_ENV", "local")
    monkeypatch_module_env.setenv("MYSQL_HOST", host)
    monkeypatch_module_env.setenv("MYSQL_PORT", str(port))
    monkeypatch_module_env.setenv("MYSQL_USER", user)
    monkeypatch_module_env.setenv("MYSQL_PASSWORD", password)
    monkeypatch_module_env.setenv("MYSQL_DATABASE", "traffic_larsjohansen_com")

    from app.config import reset_settings_cache
    from app.db.db import reset_pool_for_tests

    reset_settings_cache()
    reset_pool_for_tests()

    yield


@pytest.fixture(scope="module")
def monkeypatch_module_env():
    """Module-scoped equivalent of pytest's `monkeypatch`."""
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def _split_sql(text: str) -> list[str]:
    cleaned = [
        line
        for line in text.splitlines()
        if not line.lstrip().startswith("--") and line.strip()
    ]
    joined = "\n".join(cleaned)
    return [s for s in joined.split(";") if s.strip()]


def test_heatmap_end_to_end(seeded_env):
    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        r = c.get("/api/v1/commute/heatmap")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"Home → Work", "Work → Home"}
    assert body["Home → Work"]["weekdays"] == ["Mon", "Tue", "Wed", "Thu", "Fri"]
    assert len(body["Home → Work"]["times"]) > 0
