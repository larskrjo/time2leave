"""Address validation to avoid wasting Routes Matrix quota on bad input.

Every trip creation kicks off a ~840-call Routes Matrix backfill. If
the user typed a garbage address (""test"", ""4585 Thousand O""), every
one of those calls is wasted budget. Before we let the trip through,
we run a single Geocoding-API check per address (~$0.005 each), which
is three orders of magnitude cheaper than the backfill itself.

In dev/local mode — i.e. whenever we're on the ``fixture`` provider —
we skip validation entirely so tests, CI, and no-key forks keep
working. Only when ``data_provider=google`` and an API key is actually
configured do we hit Google.

Network / quota failures fail-open: a Google outage shouldn't block
every trip creation, since the Routes Matrix backfill will surface
any real issues shortly after. We only fail-closed for unambiguous
"this address doesn't exist" results.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

import requests

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


@dataclass
class AddressValidation:
    """Outcome of an `AddressValidator.validate()` call."""

    is_valid: bool
    canonical: str | None = None
    reason: str | None = None


class AddressValidator(Protocol):
    """Interface: decide whether a user-supplied address is worth
    spending Routes Matrix quota on."""

    def validate(self, address: str) -> AddressValidation: ...


class NullAddressValidator:
    """Accepts everything.

    Used in local/dev, in tests, and in self-hosted forks where no
    Google API key is configured — i.e. anywhere the commute provider
    is the `FixtureProvider` and there's no real quota to protect.
    """

    def validate(self, address: str) -> AddressValidation:
        del address
        return AddressValidation(is_valid=True)


class GoogleGeocodingValidator:
    """Thin wrapper over Google's Geocoding API.

    An address is treated as valid iff Google returns ``status=OK`` with
    at least one non-``partial_match`` result. ``partial_match=true``
    is what you get when a user types ``4585 Thousand O`` and Google
    silently completes it to ``4585 Thousand Oaks Dr``; we reject that
    so the user is forced to be explicit instead of letting a whole
    week's worth of Routes Matrix calls run against an auto-completed
    address that might be wrong.
    """

    def __init__(self, api_key: str, timeout_seconds: float = 10.0) -> None:
        if not api_key:
            raise ValueError(
                "GoogleGeocodingValidator requires a non-empty API key"
            )
        self._api_key = api_key
        self._timeout = timeout_seconds

    def validate(self, address: str) -> AddressValidation:
        params = {"address": address, "key": self._api_key}
        try:
            resp = requests.get(
                GEOCODE_URL, params=params, timeout=self._timeout
            )
        except requests.RequestException as exc:
            # Fail-open on network/transport errors. The Routes Matrix
            # backfill that follows will surface any real problems.
            logger.warning(
                "Geocoding request failed for %r: %s", address, exc
            )
            return AddressValidation(
                is_valid=True, reason="validator_unavailable"
            )

        if resp.status_code != 200:
            logger.warning(
                "Geocoding HTTP %s for %r: %s",
                resp.status_code,
                address,
                resp.text[:200],
            )
            return AddressValidation(
                is_valid=True, reason="validator_unavailable"
            )

        data = resp.json()
        status = data.get("status")
        results = data.get("results") or []

        if status == "ZERO_RESULTS" or (status == "OK" and not results):
            return AddressValidation(
                is_valid=False,
                reason=(
                    f"We couldn't find {address!r} on Google Maps. "
                    "Please enter a more specific address."
                ),
            )
        if status != "OK":
            # OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR.
            # Fail-open so a Google quota hiccup doesn't hard-block
            # legitimate users.
            logger.warning(
                "Geocoding returned status=%s for %r", status, address
            )
            return AddressValidation(
                is_valid=True, reason=f"validator_{status.lower()}"
            )

        top = results[0]
        if top.get("partial_match"):
            suggestion = top.get("formatted_address")
            return AddressValidation(
                is_valid=False,
                reason=(
                    f"{address!r} looks incomplete."
                    + (f" Did you mean {suggestion!r}?" if suggestion else "")
                ),
            )

        return AddressValidation(
            is_valid=True,
            canonical=top.get("formatted_address"),
        )


def get_address_validator(
    settings: Settings | None = None,
) -> AddressValidator:
    """Return the real Geocoding validator only in prod, no-op everywhere else.

    Gated on `app_env == "prod"` (not just `data_provider == "google"`)
    so that local or dev environments can point at real Google for
    integration testing without accidentally turning on the pre-flight
    Geocoding spend. The production deployment is the only place we
    want to hard-block trips on a Google lookup.
    """
    settings = settings or get_settings()
    if (
        settings.app_env == "prod"
        and settings.data_provider == "google"
        and settings.google_maps_api_key
    ):
        return GoogleGeocodingValidator(settings.google_maps_api_key)
    return NullAddressValidator()
