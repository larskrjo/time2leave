"""Shared pytest fixtures."""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

# Force a clean test environment before any app module is imported.
os.environ.setdefault("APP_ENV", "local")
os.environ.pop("DEVELOPMENT_MODE", None)


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> Iterator[None]:
    """Clear cached Settings between tests so env overrides take effect."""
    from app.config import reset_settings_cache
    from app.db.db import reset_pool_for_tests

    reset_settings_cache()
    reset_pool_for_tests()
    yield
    reset_settings_cache()
    reset_pool_for_tests()


@pytest.fixture
def sample_commute_df() -> pd.DataFrame:
    """A small DataFrame matching the columns traffic_api.process_commute_data expects."""
    rows = [
        ("2025-11-10", "2025-11-10 07:00:00", "2025-11-10T07:00:00-08:00", "H2W",
         78000, "2400s", "NORMAL", "OK", ""),
        ("2025-11-10", "2025-11-10 08:00:00", "2025-11-10T08:00:00-08:00", "H2W",
         78000, "4800s", "HEAVY", "OK", ""),
        ("2025-11-11", "2025-11-11 07:00:00", "2025-11-11T07:00:00-08:00", "H2W",
         78000, "2700s", "NORMAL", "OK", ""),
        ("2025-11-10", "2025-11-10 17:00:00", "2025-11-10T17:00:00-08:00", "W2H",
         78500, "5400s", "HEAVY", "OK", ""),
        ("2025-11-10", "2025-11-10 18:00:00", "2025-11-10T18:00:00-08:00", "W2H",
         78500, "3600s", "NORMAL", "OK", ""),
    ]
    return pd.DataFrame(
        rows,
        columns=[
            "date_local",
            "local_departure_time",
            "departure_time_rfc3339",
            "direction",
            "distance_meters",
            "duration",
            "condition",
            "status_code",
            "status_message",
        ],
    )


class FakeCursor:
    def __init__(self, rows: list[tuple]):
        self._rows = rows

    def execute(self, *_args, **_kwargs) -> None:
        return None

    def fetchone(self) -> tuple | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[tuple]:
        return list(self._rows)

    def close(self) -> None:
        return None


class FakeConnection:
    def __init__(self, rows: list[tuple]):
        self._rows = rows
        self._open = True

    def cursor(self, dictionary: bool = False):
        return FakeCursor(self._rows)

    def is_connected(self) -> bool:
        return self._open

    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        self._open = False


class FakePool:
    """Drop-in replacement for mysql.connector.pooling.MySQLConnectionPool."""

    def __init__(self, rows: list[tuple] | None = None):
        self._rows = rows or []

    def get_connection(self):
        return FakeConnection(self._rows)


@pytest.fixture
def fake_pool() -> FakePool:
    return FakePool()


@pytest.fixture
def client_with_pool(
    sample_commute_df: pd.DataFrame, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    """FastAPI TestClient with the DB pool dependency overridden.

    Intercepts `pandas.read_sql` so the test never hits an actual database.
    """
    from app.api.traffic_api import get_connection_pool
    from app.main import create_app

    app = create_app()

    def _fake_read_sql(*_args: Any, **_kwargs: Any) -> pd.DataFrame:
        return sample_commute_df

    import app.api.traffic_api as traffic_mod

    monkeypatch.setattr(traffic_mod.pd, "read_sql", _fake_read_sql)

    app.dependency_overrides[get_connection_pool] = lambda: FakePool()

    with TestClient(app) as c:
        yield c
