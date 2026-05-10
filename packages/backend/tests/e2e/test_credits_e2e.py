"""E2E tests for J7 Block 6 — credits ledger + indexer + endpoints +
generate-image integration.

Mocking strategy mirrors the Block 4 caption tests: generate_caption,
_render_template_to_png, and the IPFS pin step are stubbed at their
import sites so the credit-consumption and persistence paths run
end-to-end without touching Claude / Playwright / Pinata.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.marketing_image import MarketingImage
from app.models.product import Product
from app.models.seller_credits_ledger import SellerCreditsLedger
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.services import credit_service
from app.services.credit_service import (
    InsufficientCreditsError,
    MONTHLY_FREE_CREDITS,
    WELCOME_BONUS_CREDITS,
    consume_credits,
    ensure_monthly_free_granted,
    get_balance,
    grant_welcome_bonus_if_first,
)

# ADR-049 V1 pivot : welcome 10 → 3, monthly 5 → 0. Tests reference
# the live constants so they stay green if the values move again.
_INITIAL_BALANCE = WELCOME_BONUS_CREDITS + MONTHLY_FREE_CREDITS
from app.services.indexer_handlers import handle_credits_purchased


def _wallet() -> str:
    return ("0x" + uuid.uuid4().hex).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession, *, handle: str, shop_name: str
) -> tuple[SellerProfile, str]:
    wallet = _wallet()
    user = User(id=uuid.uuid4(), wallet_address=wallet, country="NGA")
    db.add(user)
    await db.flush()
    seller = SellerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        shop_handle=handle,
        shop_name=shop_name,
    )
    db.add(seller)
    await db.flush()
    return seller, wallet


async def _cleanup(db: AsyncSession, handles: list[str]) -> None:
    seller_rows = (
        await db.scalars(
            select(SellerProfile).where(SellerProfile.shop_handle.in_(handles))
        )
    ).all()
    seller_ids = [s.id for s in seller_rows]
    user_ids = [s.user_id for s in seller_rows]
    if seller_ids:
        await db.execute(
            delete(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id.in_(seller_ids)
            )
        )
        await db.execute(
            delete(MarketingImage).where(
                MarketingImage.seller_id.in_(seller_ids)
            )
        )
        await db.execute(delete(Product).where(Product.seller_id.in_(seller_ids)))
        await db.execute(
            delete(SellerProfile).where(SellerProfile.id.in_(seller_ids))
        )
    if user_ids:
        await db.execute(delete(User).where(User.id.in_(user_ids)))
    await db.commit()


@pytest_asyncio.fixture
async def credits_seed(db: AsyncSession) -> AsyncGenerator[dict, None]:
    suffix = uuid.uuid4().hex[:8]
    handle = f"credits-{suffix}"
    seller, wallet = await _seed_seller(
        db, handle=handle, shop_name="Credits Seller"
    )
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title="Test Product",
        slug=f"prod-{suffix}",
        description="For credit tests",
        price_usdt=Decimal("20.00"),
        stock=5,
        status="active",
    )
    db.add(product)
    await db.commit()

    try:
        yield {
            "wallet": wallet,
            "seller_id": str(seller.id),
            "product_id": str(product.id),
            "handle": handle,
        }
    finally:
        await _cleanup(db, [handle])


# ============================================================
# /balance — lazy welcome + monthly free grants
# ============================================================
@pytest.mark.asyncio
async def test_balance_grants_welcome_and_monthly_on_first_call(
    client: AsyncClient, credits_seed: dict
):
    resp = await client.get(
        "/api/v1/sellers/me/credits/balance",
        headers={"X-Wallet-Address": credits_seed["wallet"]},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Welcome bonus (V1 pivot ADR-049: 3) + monthly free (0)
    assert data["balance"] == _INITIAL_BALANCE
    assert data["wallet_address"] == credits_seed["wallet"]


@pytest.mark.asyncio
async def test_balance_idempotent_on_second_call(
    client: AsyncClient, credits_seed: dict
):
    """Both grants are once-per-(condition); a second call returns the
    same balance, no duplicate ledger entries."""
    headers = {"X-Wallet-Address": credits_seed["wallet"]}
    r1 = await client.get("/api/v1/sellers/me/credits/balance", headers=headers)
    r2 = await client.get("/api/v1/sellers/me/credits/balance", headers=headers)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["balance"] == _INITIAL_BALANCE
    assert r2.json()["balance"] == _INITIAL_BALANCE


# ============================================================
# Indexer handler — mirrors purchase to ledger
# ============================================================
@pytest.mark.asyncio
async def test_indexer_writes_purchase_ledger_entry(
    db: AsyncSession, credits_seed: dict
):
    tx_hash_bytes = bytes.fromhex(uuid.uuid4().hex + uuid.uuid4().hex)
    fake_event = {
        "args": {
            "buyer": credits_seed["wallet"],
            "creditAmount": 100,
            "usdtAmount": 100 * 150_000,
            "timestamp": 1_777_000_000,
        },
        "transactionHash": SimpleNamespace(hex=lambda: tx_hash_bytes.hex()),
        "blockNumber": 23948500,
        "logIndex": 0,
    }

    await handle_credits_purchased(fake_event, db, services={})
    await db.commit()

    rows = (
        await db.scalars(
            select(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id
                == uuid.UUID(credits_seed["seller_id"])
            )
        )
    ).all()
    purchase_rows = [r for r in rows if r.source == "purchase"]
    assert len(purchase_rows) == 1
    assert purchase_rows[0].credits_delta == 100
    assert purchase_rows[0].tx_hash == "0x" + tx_hash_bytes.hex()


@pytest.mark.asyncio
async def test_indexer_idempotent_on_duplicate_tx_hash(
    db: AsyncSession, credits_seed: dict
):
    """The (tx_hash, source) UniqueConstraint catches the dupe — the
    second insert must not produce a second ledger row. Behavior matches
    what the indexer dispatcher already enforces via IndexerEvent;
    handler-level idempotency is defense-in-depth."""
    tx_hash_bytes = bytes.fromhex(uuid.uuid4().hex + uuid.uuid4().hex)
    base_event = {
        "args": {
            "buyer": credits_seed["wallet"],
            "creditAmount": 50,
            "usdtAmount": 50 * 150_000,
            "timestamp": 1_777_000_001,
        },
        "transactionHash": SimpleNamespace(hex=lambda: tx_hash_bytes.hex()),
        "blockNumber": 23948501,
        "logIndex": 0,
    }

    await handle_credits_purchased(base_event, db, services={})
    await db.commit()

    # Second call with the same tx_hash should fail at flush time.
    await handle_credits_purchased(base_event, db, services={})
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()

    rows = (
        await db.scalars(
            select(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id
                == uuid.UUID(credits_seed["seller_id"]),
                SellerCreditsLedger.source == "purchase",
            )
        )
    ).all()
    assert len(rows) == 1


# ============================================================
# consume_credits — service-level
# ============================================================
@pytest.mark.asyncio
async def test_consume_decrements_balance(
    db: AsyncSession, credits_seed: dict
):
    seller_id = uuid.UUID(credits_seed["seller_id"])
    # Bootstrap: welcome bonus only (monthly_free is now no-op per ADR-049).
    await grant_welcome_bonus_if_first(seller_id, db)

    new_balance = await consume_credits(seller_id, db, amount=1)
    # WELCOME_BONUS_CREDITS - 1
    assert new_balance == WELCOME_BONUS_CREDITS - 1
    assert await get_balance(seller_id, db) == WELCOME_BONUS_CREDITS - 1

    consumption_rows = (
        await db.scalars(
            select(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id == seller_id,
                SellerCreditsLedger.source == "image_consumption",
            )
        )
    ).all()
    assert len(consumption_rows) == 1
    assert consumption_rows[0].credits_delta == -1


@pytest.mark.asyncio
async def test_consume_raises_insufficient_when_balance_zero(
    db: AsyncSession, credits_seed: dict
):
    seller_id = uuid.UUID(credits_seed["seller_id"])
    # ADR-049 V1 pivot : monthly_free is no-op. Grant welcome bonus
    # explicitly (consume_credits doesn't trigger it on its own) then
    # drain it to reach the InsufficientCreditsError path.
    await grant_welcome_bonus_if_first(seller_id, db)
    await consume_credits(seller_id, db, amount=WELCOME_BONUS_CREDITS)
    assert await get_balance(seller_id, db) == 0

    with pytest.raises(InsufficientCreditsError) as exc_info:
        await consume_credits(seller_id, db, amount=1)
    assert exc_info.value.needed == 1
    assert exc_info.value.available == 0

    # No new ledger entry was written for the failed call
    rows = (
        await db.scalars(
            select(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id == seller_id,
                SellerCreditsLedger.source == "image_consumption",
            )
        )
    ).all()
    assert len(rows) == 1  # only the single successful consume


# ============================================================
# /generate-image — credit consumption + persistence
# ============================================================
@pytest.fixture
def _mock_external_services(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_caption(**kwargs) -> str:
        return f"[mock] {kwargs.get('title')}"

    async def fake_render(template_name, template_vars):
        return b"\x89PNG\r\n\x1a\n" + b"x" * 64

    monkeypatch.setattr(
        "app.services.asset_generator.generate_caption", fake_caption
    )
    monkeypatch.setattr(
        "app.services.asset_generator._render_template_to_png", fake_render
    )


@pytest.mark.asyncio
async def test_generate_image_consumes_credit_and_persists(
    _mock_external_services: None,
    client: AsyncClient,
    credits_seed: dict,
    db: AsyncSession,
):
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": credits_seed["wallet"]},
        json={
            "product_id": credits_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 200, resp.text

    seller_id = uuid.UUID(credits_seed["seller_id"])

    # Balance went from WELCOME_BONUS_CREDITS to WELCOME_BONUS_CREDITS - 1
    # (monthly_free is no-op per ADR-049)
    assert await get_balance(seller_id, db) == WELCOME_BONUS_CREDITS - 1

    # MarketingImage row exists
    images = (
        await db.scalars(
            select(MarketingImage).where(
                MarketingImage.seller_id == seller_id
            )
        )
    ).all()
    assert len(images) == 1
    img = images[0]
    assert img.template == "ig_square"
    assert img.caption_lang == "en"
    assert img.ipfs_hash.startswith("Qm")
    assert "Test Product" in img.caption

    # Consumption ledger entry is linked to the image
    consumption = (
        await db.scalars(
            select(SellerCreditsLedger).where(
                SellerCreditsLedger.seller_id == seller_id,
                SellerCreditsLedger.source == "image_consumption",
            )
        )
    ).all()
    assert len(consumption) == 1
    assert consumption[0].image_id == img.id


@pytest.mark.asyncio
async def test_generate_image_returns_402_when_no_credits(
    _mock_external_services: None,
    client: AsyncClient,
    credits_seed: dict,
    db: AsyncSession,
):
    """Drain the seller's welcome bonus (V1 pivot ADR-049: 3) by
    seeding an offsetting ledger entry, then ask for an image — must
    402 before any render runs."""
    seller_id = uuid.UUID(credits_seed["seller_id"])
    # Force lazy grants to fire so the 0-balance path is real
    await grant_welcome_bonus_if_first(seller_id, db)
    await ensure_monthly_free_granted(seller_id, db)  # no-op since pivot
    db.add(
        SellerCreditsLedger(
            seller_id=seller_id,
            credits_delta=-WELCOME_BONUS_CREDITS,
            source="image_consumption",
        )
    )
    await db.commit()
    assert await get_balance(seller_id, db) == 0

    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": credits_seed["wallet"]},
        json={
            "product_id": credits_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 402, resp.text
    assert "credits" in resp.json()["detail"].lower()

    # No image was persisted
    images = (
        await db.scalars(
            select(MarketingImage).where(
                MarketingImage.seller_id == seller_id
            )
        )
    ).all()
    assert len(images) == 0


# ============================================================
# /history — paginated ledger
# ============================================================
@pytest.mark.asyncio
async def test_history_returns_paginated_entries(
    client: AsyncClient, credits_seed: dict
):
    headers = {"X-Wallet-Address": credits_seed["wallet"]}
    # Trigger welcome grant only (monthly_free is no-op per ADR-049)
    await client.get("/api/v1/sellers/me/credits/balance", headers=headers)

    resp = await client.get(
        "/api/v1/sellers/me/credits/history?page=1&page_size=10",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1  # welcome only (monthly retired ADR-049)
    sources = {e["source"] for e in data["entries"]}
    assert sources == {"welcome_bonus"}
    assert all(e["credits_delta"] > 0 for e in data["entries"])
