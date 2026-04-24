"""
One-shot local seeder.

Runs the data-gathering pipeline against the FixtureProvider so that a fresh
local MySQL container has meaningful content without needing a Google API key.

Usage:
    python -m scripts.seed_local

Idempotent: existing slots are left alone.
"""

from __future__ import annotations

import logging
import os

from app.job.data_gathering import main as data_gathering_main
from app.job.providers import FixtureProvider


def run() -> None:
    os.environ.setdefault("APP_ENV", "local")
    logging.basicConfig(level=logging.INFO)
    data_gathering_main(provider=FixtureProvider())


if __name__ == "__main__":
    run()
