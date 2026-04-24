"""Shared pytest fixtures.

The multi-user app relies on a real MySQL for most end-to-end paths, but
many unit-level route tests only need:
  * the Settings cache reset between tests
  * a way to override the authenticated-user dependency
  * a fake Database so services layer code can run without MySQL

The helpers below cover those needs. Tests that really need a DB should
mark themselves `@pytest.mark.integration` and use the testcontainers
fixtures in `tests/integration/`.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

os.environ.setdefault("APP_ENV", "local")
os.environ.pop("DEVELOPMENT_MODE", None)


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> Iterator[None]:
    """Clear cached Settings/DB pool between tests so env overrides apply."""
    from app.config import reset_settings_cache
    from app.db.db import reset_pool_for_tests

    reset_settings_cache()
    reset_pool_for_tests()
    yield
    reset_settings_cache()
    reset_pool_for_tests()
