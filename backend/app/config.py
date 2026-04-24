"""
Typed application settings.

All environment-specific values live here. Local development works with the
built-in defaults; production overrides come from environment variables and
AWS Secrets Manager (loaded lazily on first access in prod).
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

AppEnv = Literal["local", "dev", "prod"]


class Settings(BaseSettings):
    """Top-level application settings.

    Values can be overridden by environment variables (case-insensitive).
    A `.env` file in the backend working directory is also respected.
    """

    app_env: AppEnv = "local"

    # MySQL connection.
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = "Abcd1234"
    mysql_database: str = "traffic_larsjohansen_com"
    mysql_pool_size: int = 5

    # Data-gathering provider configuration.
    google_maps_api_key: str | None = None
    data_provider: Literal["google", "fixture"] = "fixture"

    # AWS Secrets Manager (prod only).
    aws_secret_name: str = "MySecret"
    aws_region: str = "us-west-2"

    # CORS origins allowed outside of prod. In prod we always allow exactly
    # https://traffic.larsjohansen.com.
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://traffic.larsjohansen.com:5173",
        ]
    )

    # Admin endpoints (manual run of the data-gathering job, etc.) are only
    # mounted when this is truthy AND app_env != "prod".
    enable_admin_api: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


def _apply_legacy_env_aliases() -> None:
    """Accept the old DEVELOPMENT_MODE env var as an alias for APP_ENV.

    Removes a breaking change for anything still setting DEVELOPMENT_MODE
    (notably the prod docker-compose.yml before it's re-pulled).
    """
    if "APP_ENV" in os.environ:
        return
    legacy = os.environ.get("DEVELOPMENT_MODE")
    if legacy == "prod":
        os.environ["APP_ENV"] = "prod"
    elif legacy in {"dev", "local"}:
        os.environ["APP_ENV"] = legacy


def _load_from_aws_secrets_manager(settings: Settings) -> None:
    """Overlay MySQL + Google credentials from AWS Secrets Manager.

    Only invoked when app_env == "prod". Imported lazily so that local
    development does not require boto3 to reach AWS at import time.
    """
    import boto3
    from botocore.exceptions import ClientError

    session = boto3.session.Session()
    client = session.client(
        service_name="secretsmanager", region_name=settings.aws_region
    )
    try:
        resp = client.get_secret_value(SecretId=settings.aws_secret_name)
    except ClientError:
        logger.exception(
            "Failed to load AWS secret '%s' in region %s",
            settings.aws_secret_name,
            settings.aws_region,
        )
        raise

    payload: dict[str, str] = json.loads(resp["SecretString"])
    if "mysql_user" in payload:
        settings.mysql_user = payload["mysql_user"]
    if "mysql_password" in payload:
        settings.mysql_password = payload["mysql_password"]
    if "google_maps_api_key" in payload:
        settings.google_maps_api_key = payload["google_maps_api_key"]
        if settings.data_provider == "fixture":
            settings.data_provider = "google"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide singleton Settings instance.

    Resolution order:
      1. Start from defaults.
      2. Apply env vars (including any `.env` file).
      3. In prod, overlay AWS Secrets Manager values.
    """
    _apply_legacy_env_aliases()
    settings = Settings()

    if settings.app_env == "prod":
        _load_from_aws_secrets_manager(settings)
    else:
        logger.info(
            "Running in %s mode; skipping AWS Secrets Manager and using env/defaults",
            settings.app_env,
        )

    return settings


def reset_settings_cache() -> None:
    """Clear the cached Settings. Intended for tests."""
    get_settings.cache_clear()
