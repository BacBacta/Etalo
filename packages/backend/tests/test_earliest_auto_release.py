"""Unit tests for sellers._earliest_auto_release (ADR-058 payout ETA).

Pure function over eager-loaded shipment groups + items — no DB needed.
Guards the dispute-exclusion fix from the PR review: a fully-disputed
group must NOT contribute a payout ETA (its items won't auto-release).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.models.enums import ItemStatus
from app.routers.sellers import _earliest_auto_release


def _item(status: ItemStatus):
    return SimpleNamespace(status=status)


def _group(*, final_release_after, release_stage, item_statuses):
    return SimpleNamespace(
        final_release_after=final_release_after,
        release_stage=release_stage,
        items=[_item(s) for s in item_statuses],
    )


def _order(groups):
    return SimpleNamespace(shipment_groups=groups)


NOW = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)


def test_returns_none_when_no_groups():
    assert _earliest_auto_release(_order([])) is None


def test_returns_deadline_for_a_shipped_group():
    d = NOW + timedelta(days=3)
    order = _order(
        [_group(final_release_after=d, release_stage=0, item_statuses=[ItemStatus.SHIPPED])]
    )
    assert _earliest_auto_release(order) == d


def test_picks_earliest_across_groups():
    early = NOW + timedelta(days=1)
    late = NOW + timedelta(days=3)
    order = _order(
        [
            _group(final_release_after=late, release_stage=0, item_statuses=[ItemStatus.SHIPPED]),
            _group(final_release_after=early, release_stage=0, item_statuses=[ItemStatus.ARRIVED]),
        ]
    )
    assert _earliest_auto_release(order) == early


def test_excludes_fully_disputed_group():
    """A group whose only item is disputed must not yield a payout ETA —
    that money is frozen, not pending release."""
    d = NOW + timedelta(days=2)
    order = _order(
        [_group(final_release_after=d, release_stage=0, item_statuses=[ItemStatus.DISPUTED])]
    )
    assert _earliest_auto_release(order) is None


def test_partially_disputed_group_still_counts_for_shipped_sibling():
    """One disputed + one shipped item → the shipped sibling will
    auto-release, so the ETA stands."""
    d = NOW + timedelta(days=2)
    order = _order(
        [
            _group(
                final_release_after=d,
                release_stage=0,
                item_statuses=[ItemStatus.DISPUTED, ItemStatus.SHIPPED],
            )
        ]
    )
    assert _earliest_auto_release(order) == d


def test_excludes_fully_released_group():
    d = NOW + timedelta(days=2)
    order = _order(
        [_group(final_release_after=d, release_stage=3, item_statuses=[ItemStatus.RELEASED])]
    )
    assert _earliest_auto_release(order) is None


def test_excludes_group_with_null_deadline():
    order = _order(
        [_group(final_release_after=None, release_stage=0, item_statuses=[ItemStatus.SHIPPED])]
    )
    assert _earliest_auto_release(order) is None
