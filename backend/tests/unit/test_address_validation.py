"""Unit tests for address validation helpers."""

from __future__ import annotations

import pytest
import responses

from app.config import Settings
from app.services.address_validation import (
    GEOCODE_URL,
    GoogleGeocodingValidator,
    NullAddressValidator,
    get_address_validator,
)


class TestNullAddressValidator:
    def test_accepts_anything(self):
        v = NullAddressValidator()
        for address in ["", "   ", "asdf", "San Jose, CA"]:
            r = v.validate(address)
            assert r.is_valid is True
            assert r.canonical is None


class TestGoogleGeocodingValidator:
    def test_requires_api_key(self):
        with pytest.raises(ValueError):
            GoogleGeocodingValidator(api_key="")

    @responses.activate
    def test_valid_address(self):
        responses.add(
            responses.GET,
            GEOCODE_URL,
            json={
                "status": "OK",
                "results": [
                    {
                        "formatted_address": (
                            "650 California St, San Francisco, CA 94108, USA"
                        ),
                        "partial_match": False,
                    }
                ],
            },
            status=200,
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("650 California St")
        assert r.is_valid is True
        assert r.canonical is not None
        assert "California St" in r.canonical

    @responses.activate
    def test_zero_results_is_invalid(self):
        responses.add(
            responses.GET,
            GEOCODE_URL,
            json={"status": "ZERO_RESULTS", "results": []},
            status=200,
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("asdfjkl;")
        assert r.is_valid is False
        assert r.reason is not None
        assert "asdfjkl" in r.reason

    @responses.activate
    def test_partial_match_is_invalid(self):
        # Typing "4585 Thousand O" silently becomes "4585 Thousand Oaks Dr"
        # with partial_match=true — we refuse those so users have to be
        # explicit instead of gambling a full backfill on auto-completion.
        responses.add(
            responses.GET,
            GEOCODE_URL,
            json={
                "status": "OK",
                "results": [
                    {
                        "formatted_address": (
                            "4585 Thousand Oaks Dr, San Jose, CA 95136, USA"
                        ),
                        "partial_match": True,
                    }
                ],
            },
            status=200,
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("4585 Thousand O")
        assert r.is_valid is False
        assert r.reason is not None
        assert "Thousand Oaks" in r.reason

    @responses.activate
    def test_network_error_fails_open(self):
        # A Google outage should not block legitimate users from
        # creating trips; the Routes Matrix backfill that follows
        # will surface any real problems.
        import requests

        def raise_conn_err(request):
            raise requests.ConnectionError("boom")

        responses.add_callback(
            responses.GET, GEOCODE_URL, callback=raise_conn_err
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("650 California St")
        assert r.is_valid is True
        assert r.reason == "validator_unavailable"

    @responses.activate
    def test_non_200_fails_open(self):
        responses.add(
            responses.GET, GEOCODE_URL, body="nope", status=503
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("650 California St")
        assert r.is_valid is True
        assert r.reason == "validator_unavailable"

    @responses.activate
    def test_over_quota_fails_open(self):
        responses.add(
            responses.GET,
            GEOCODE_URL,
            json={"status": "OVER_QUERY_LIMIT", "results": []},
            status=200,
        )
        v = GoogleGeocodingValidator(api_key="fake")
        r = v.validate("650 California St")
        assert r.is_valid is True
        assert r.reason == "validator_over_query_limit"


class TestGetAddressValidator:
    def test_returns_null_for_fixture_provider(self):
        s = Settings(app_env="prod", data_provider="fixture")
        v = get_address_validator(s)
        assert isinstance(v, NullAddressValidator)

    def test_returns_null_when_google_provider_missing_key(self):
        s = Settings(
            app_env="prod", data_provider="google", google_maps_api_key=None
        )
        v = get_address_validator(s)
        assert isinstance(v, NullAddressValidator)

    def test_returns_null_outside_of_prod_even_with_google(self):
        # Real Geocoding is only used in production so dev/local can
        # point at a real provider for integration testing without
        # also racking up Geocoding charges on every trip create.
        for env in ("local", "dev"):
            s = Settings(
                app_env=env,
                data_provider="google",
                google_maps_api_key="fake",
            )
            v = get_address_validator(s)
            assert isinstance(v, NullAddressValidator), env

    def test_returns_google_in_prod_with_google_provider_and_key(self):
        s = Settings(
            app_env="prod",
            data_provider="google",
            google_maps_api_key="fake",
        )
        v = get_address_validator(s)
        assert isinstance(v, GoogleGeocodingValidator)
