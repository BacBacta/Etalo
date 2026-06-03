"""Unit tests for the auto-release keeper.

Focus is on the build_release_keeper factory + the deadline filter
logic in _maybe_release. The on-chain tx path needs a live RPC and is
exercised via the e2e suite.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.auto_release_keeper import (
    AutoReleaseKeeper,
    build_release_keeper,
)


# Well-known Hardhat/Foundry dev key — NEVER used for anything real.
DEV_TEST_KEY = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)


def _fake_celo() -> SimpleNamespace:
    return SimpleNamespace(_w3=MagicMock(), _escrow=MagicMock())


def test_build_release_keeper_none_when_disabled_via_setting() -> None:
    with patch("app.services.auto_release_keeper.settings") as s:
        s.auto_release_keeper_enabled = False
        s.relayer_private_key = DEV_TEST_KEY
        assert build_release_keeper(_fake_celo(), MagicMock()) is None


def test_build_release_keeper_none_when_relayer_key_empty() -> None:
    with patch("app.services.auto_release_keeper.settings") as s:
        s.auto_release_keeper_enabled = True
        s.relayer_private_key = ""
        assert build_release_keeper(_fake_celo(), MagicMock()) is None


def test_build_release_keeper_constructs_when_enabled() -> None:
    with patch("app.services.auto_release_keeper.settings") as s:
        s.auto_release_keeper_enabled = True
        s.relayer_private_key = DEV_TEST_KEY
        s.auto_release_keeper_interval_hours = 2.0
        keeper = build_release_keeper(_fake_celo(), MagicMock())
        assert isinstance(keeper, AutoReleaseKeeper)


def test_keeper_accepts_key_without_0x_prefix() -> None:
    keeper = AutoReleaseKeeper(
        celo=_fake_celo(),
        session_factory=MagicMock(),
        relayer_private_key=DEV_TEST_KEY[2:],
        interval_hours=1.0,
    )
    assert keeper._relayer_address == "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def test_keeper_clamps_minimum_interval_to_60s() -> None:
    keeper = AutoReleaseKeeper(
        celo=_fake_celo(),
        session_factory=MagicMock(),
        relayer_private_key=DEV_TEST_KEY,
        interval_hours=0.001,
    )
    assert keeper._interval_seconds == 60


def _make_keeper() -> AutoReleaseKeeper:
    return AutoReleaseKeeper(
        celo=_fake_celo(),
        session_factory=MagicMock(),
        relayer_private_key=DEV_TEST_KEY,
        interval_hours=1.0,
    )


def _item(*, deadline, onchain_order_id=42, onchain_item_id=7):
    """Build a fake OrderItem with attached order + shipment_group."""
    order = SimpleNamespace(onchain_order_id=onchain_order_id)
    group = SimpleNamespace(final_release_after=deadline)
    return SimpleNamespace(
        onchain_item_id=onchain_item_id,
        order=order,
        shipment_group=group,
    )


def test_keeper_skips_item_before_deadline() -> None:
    import asyncio

    keeper = _make_keeper()
    now = datetime.now(timezone.utc)
    # finalReleaseAfter is 1 day in the future — not yet releasable.
    item = _item(deadline=now + timedelta(days=1))

    sent = []

    async def fake_send(order_id, item_id):
        sent.append((order_id, item_id))

    keeper._send_release_tx = fake_send  # type: ignore[assignment]
    asyncio.run(keeper._maybe_release(item, now))
    assert sent == [], "Should not release before finalReleaseAfter"


def test_keeper_releases_item_past_deadline() -> None:
    import asyncio

    keeper = _make_keeper()
    now = datetime.now(timezone.utc)
    item = _item(deadline=now - timedelta(hours=1), onchain_item_id=99)

    sent = []

    async def fake_send(order_id, item_id):
        sent.append((order_id, item_id))

    keeper._send_release_tx = fake_send  # type: ignore[assignment]
    asyncio.run(keeper._maybe_release(item, now))
    assert sent == [(42, 99)]


def test_keeper_skips_item_with_no_group() -> None:
    import asyncio

    keeper = _make_keeper()
    now = datetime.now(timezone.utc)
    item = SimpleNamespace(
        onchain_item_id=1,
        order=SimpleNamespace(onchain_order_id=1),
        shipment_group=None,
    )

    sent = []

    async def fake_send(order_id, item_id):
        sent.append((order_id, item_id))

    keeper._send_release_tx = fake_send  # type: ignore[assignment]
    asyncio.run(keeper._maybe_release(item, now))
    assert sent == []


def test_keeper_handles_naive_deadline_as_utc() -> None:
    import asyncio

    keeper = _make_keeper()
    now = datetime.now(timezone.utc)
    # Postgres may return a naive datetime — keeper must treat it as UTC
    # and still release when it's in the past.
    naive_past = (now - timedelta(hours=2)).replace(tzinfo=None)
    item = _item(deadline=naive_past, onchain_item_id=5)

    sent = []

    async def fake_send(order_id, item_id):
        sent.append((order_id, item_id))

    keeper._send_release_tx = fake_send  # type: ignore[assignment]
    asyncio.run(keeper._maybe_release(item, now))
    assert sent == [(42, 5)]
