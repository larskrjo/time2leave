"""Docker-backed end-to-end tests.

The old single-user heatmap test has been retired along with the
`commute_slots` table. The replacement tests that exercise the
multi-user trip flow land in the next backend-tests commit.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.mark.skip(reason="Rewritten for the multi-user schema in a follow-up commit.")
def test_placeholder() -> None:
    pass
