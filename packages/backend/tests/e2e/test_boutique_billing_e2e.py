"""E2E tests for ADR-059 — one-time boutique creation fee.

Covers:
- the indexer handler `handle_creation_fee_paid` mirroring
  CreationFeePaid into `boutique_billing` (insert + idempotent upsert);
- the onboarding gate `require_creation_fee_paid` wired into
  POST /api/v1/onboarding/complete: free during the Proof-of-Ship
  window, 402 once enforced + unpaid, 201 once paid.

The gate reads `settings.fees_enforced_from`; tests monkeypatch it to
simulate the window being open/closed without touching prod config.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.boutique_billing import BoutiqueBilling
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.services.indexer_handlers import handle_creation_fee_paid


def _wallet() -> str:
    return ("0x" + uuid.uuid4().hex).ljust(42, "0").lower()


def _onboarding_body(handle: str) -> dict:
    return {
        "profile": {
            "shop_handle": handle,
            "shop_name": "Billing Test Shop",
            "country": "NGA",
            "language": "en",
        }
    }


@pytest_asyncio.fixture
async def billing_cleanup(db: AsyncSession) -> AsyncGenerator[dict, None]:
    """Yields a fresh wallet + handle and deletes any rows they create."""
    suffix = uuid.uuid4().hex[:8]
    ctx = {"wallet": _wallet(), "handle": f"billing-{suffix}"}
    try:
        yield ctx
    finally:
        await db.execute(
            delete(SellerProfile).where(SellerProfile.shop_handle == ctx["handle"])
        )
        await db.execute(delete(User).where(User.wallet_address == ctx["wallet"]))
        await db.execute(
            delete(BoutiqueBilling).where(
                BoutiqueBilling.wallet_address == ctx["wallet"]
            )
        )
        await db.commit()


def _fake_event(wallet: str, *, ts: int, tx_hex: str) -> dict:
    return {
        "args": {"seller": wallet, "timestamp": ts},
        "transactionHash": SimpleNamespace(hex=lambda: tx_hex),
        "blockNumber": 23948600,
        "logIndex": 0,
    }


# ============================================================
# Indexer handler — mirrors CreationFeePaid → boutique_billing
# ============================================================
@pytest.mark.asyncio
async def test_indexer_writes_boutique_billing_row(
    db: AsyncSession, billing_cleanup: dict
):
    wallet = billing_cleanup["wallet"]
    tx_hex = uuid.uuid4().hex + uuid.uuid4().hex
    await handle_creation_fee_paid(
        _fake_event(wallet, ts=1_777_000_000, tx_hex=tx_hex), db, services={}
    )
    await db.commit()

    row = (
        await db.execute(
            select(BoutiqueBilling).where(
                BoutiqueBilling.wallet_address == wallet
            )
        )
    ).scalar_one()
    assert row.creation_paid_at is not None
    assert row.creation_tx_hash == "0x" + tx_hex


@pytest.mark.asyncio
async def test_indexer_upsert_idempotent_on_replay(
    db: AsyncSession, billing_cleanup: dict
):
    """Replaying CreationFeePaid for the same wallet updates the single
    row (PK on wallet_address) instead of erroring or duplicating."""
    wallet = billing_cleanup["wallet"]
    tx1 = uuid.uuid4().hex + uuid.uuid4().hex
    tx2 = uuid.uuid4().hex + uuid.uuid4().hex

    await handle_creation_fee_paid(
        _fake_event(wallet, ts=1_777_000_000, tx_hex=tx1), db, services={}
    )
    await db.commit()
    await handle_creation_fee_paid(
        _fake_event(wallet, ts=1_777_000_500, tx_hex=tx2), db, services={}
    )
    await db.commit()

    rows = (
        await db.scalars(
            select(BoutiqueBilling).where(
                BoutiqueBilling.wallet_address == wallet
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].creation_tx_hash == "0x" + tx2


# ============================================================
# Onboarding gate — free window / enforced+unpaid / enforced+paid
# ============================================================
@pytest.mark.asyncio
async def test_onboarding_free_window_allows_creation(
    client: AsyncClient, billing_cleanup: dict, monkeypatch: pytest.MonkeyPatch
):
    # Empty FEES_ENFORCED_FROM = free window open → no fee required.
    monkeypatch.setattr(settings, "fees_enforced_from", "")
    resp = await client.post(
        "/api/v1/onboarding/complete",
        headers={"X-Wallet-Address": billing_cleanup["wallet"]},
        json=_onboarding_body(billing_cleanup["handle"]),
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_onboarding_enforced_unpaid_returns_402(
    client: AsyncClient, billing_cleanup: dict, monkeypatch: pytest.MonkeyPatch
):
    # Fees enforced (date in the past) + no payment on record → 402.
    monkeypatch.setattr(
        settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00"
    )
    resp = await client.post(
        "/api/v1/onboarding/complete",
        headers={"X-Wallet-Address": billing_cleanup["wallet"]},
        json=_onboarding_body(billing_cleanup["handle"]),
    )
    assert resp.status_code == 402, resp.text
    assert resp.json()["detail"]["code"] == "creation_fee_required"


@pytest.mark.asyncio
async def test_onboarding_enforced_paid_allows_creation(
    client: AsyncClient,
    db: AsyncSession,
    billing_cleanup: dict,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00"
    )
    # Seed the on-chain-mirrored payment row (what the indexer would write).
    db.add(
        BoutiqueBilling(
            wallet_address=billing_cleanup["wallet"],
            creation_paid_at=datetime(2026, 6, 15, tzinfo=timezone.utc),
            creation_tx_hash="0x" + uuid.uuid4().hex,
        )
    )
    await db.commit()

    resp = await client.post(
        "/api/v1/onboarding/complete",
        headers={"X-Wallet-Address": billing_cleanup["wallet"]},
        json=_onboarding_body(billing_cleanup["handle"]),
    )
    assert resp.status_code == 201, resp.text
