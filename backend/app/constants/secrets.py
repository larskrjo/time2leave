"""
Backward-compatibility shim.

All secret/config access now flows through `app.config.get_settings()`. This
module is kept only so that older imports continue to work during the
transition; prefer `from app.config import get_settings` in new code.
"""

from __future__ import annotations

from app.config import get_settings


def _get_secrets_from_aws() -> dict[str, str]:
    """Deprecated: use app.config.get_settings() instead."""
    settings = get_settings()
    return {
        "mysql_user": settings.mysql_user,
        "mysql_password": settings.mysql_password,
        "google_maps_api_key": settings.google_maps_api_key or "",
    }


class _LazySecrets:
    """Dict-like proxy over Settings for legacy `SECRETS["..."]` access."""

    def __getitem__(self, key: str) -> str:
        return _get_secrets_from_aws()[key]

    def get(self, key: str, default: str | None = None) -> str | None:
        return _get_secrets_from_aws().get(key, default)


SECRETS: _LazySecrets = _LazySecrets()
