"""E2E tests for marketplace country filter + cross-border block —
Sprint J11.7 Block 3 (ADR-045 + ADR-041 defense-in-depth).
"""
from __future__ import annotations

import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


# Test wallets / handles isolated from seed_j4_data CHIOMA fixtures.
# Each wallet : "0x" + 40 hex chars = 42 chars total (matches users.wallet_address VARCHAR(42)).
_NGA_BUYER = "0x" + "b" * 39 + "1"
_NGA_SELLER_WALLET = "0x" + "c" * 39 + "1"
_GHA_SELLER_WALLET = "0x" + "d" * 39 + "1"

_NGA_HANDLE = "j117-test-nga"
_GHA_HANDLE = "j117-test-gha"


@pytest_asyncio.fixture(autouse=True)
async def _seed_block3() -> AsyncGenerator[dict, None]:
    """Seed 1 NGA seller + 1 GHA seller, each with 1 active product. Cleanup
    before AND after to allow re-runs."""
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            sellers = (
                await s.execute(
                    select(SellerProfile).where(
                        SellerProfile.shop_handle.in_([_NGA_HANDLE, _GHA_HANDLE])
                    )
                )
            ).scalars().all()
            for sp in sellers:
                await s.execute(delete(Product).where(Product.seller_id == sp.id))
                await s.execute(delete(SellerProfile).where(SellerProfile.id == sp.id))
            await s.execute(
                delete(User).where(
                    User.wallet_address.in_(
                        [_NGA_BUYER, _NGA_SELLER_WALLET, _GHA_SELLER_WALLET]
                    )
                )
            )
            await s.commit()

    await wipe()

    seeded: dict[str, uuid.UUID] = {}
    async with factory() as s:
        # Buyer in NGA
        buyer = User(wallet_address=_NGA_BUYER, country="NGA")
        s.add(buyer)

        # NGA seller + product
        nga_user = User(wallet_address=_NGA_SELLER_WALLET, country="NGA")
        s.add(nga_user)
        await s.flush()
        nga_seller = SellerProfile(
            user_id=nga_user.id, shop_handle=_NGA_HANDLE, shop_name="Test NGA Shop"
        )
        s.add(nga_seller)
        await s.flush()
        nga_product = Product(
            seller_id=nga_seller.id,
            title="Test NGA Product",
            slug="test-product-nga",
            price_usdt=10,
            stock=5,
            status="active",
        )
        s.add(nga_product)

        # GHA seller + product
        gha_user = User(wallet_address=_GHA_SELLER_WALLET, country="GHA")
        s.add(gha_user)
        await s.flush()
        gha_seller = SellerProfile(
            user_id=gha_user.id, shop_handle=_GHA_HANDLE, shop_name="Test GHA Shop"
        )
        s.add(gha_seller)
        await s.flush()
        gha_product = Product(
            seller_id=gha_seller.id,
            title="Test GHA Product",
            slug="test-product-gha",
            price_usdt=12,
            stock=5,
            status="active",
        )
        s.add(gha_product)

        await s.commit()
        await s.refresh(nga_product)
        await s.refresh(gha_product)
        seeded["nga_product_id"] = nga_product.id
        seeded["gha_product_id"] = gha_product.id

    yield seeded

    await wipe()


# ============================================================
# Marketplace country filter
# ============================================================
async def test_marketplace_filter_by_nga(client: AsyncClient, _seed_block3):
    r = await client.get("/api/v1/marketplace/products?country=NGA")
    assert r.status_code == 200
    body = r.json()
    handles = {p["seller_handle"] for p in body["products"]}
    assert _NGA_HANDLE in handles
    assert _GHA_HANDLE not in handles


async def test_marketplace_filter_by_gha(client: AsyncClient, _seed_block3):
    r = await client.get("/api/v1/marketplace/products?country=GHA")
    assert r.status_code == 200
    handles = {p["seller_handle"] for p in r.json()["products"]}
    assert _GHA_HANDLE in handles
    assert _NGA_HANDLE not in handles


async def test_marketplace_country_all_returns_both(client: AsyncClient, _seed_block3):
    r = await client.get("/api/v1/marketplace/products?country=all")
    assert r.status_code == 200
    handles = {p["seller_handle"] for p in r.json()["products"]}
    assert _NGA_HANDLE in handles
    assert _GHA_HANDLE in handles


async def test_marketplace_invalid_country_returns_400(client: AsyncClient):
    r = await client.get("/api/v1/marketplace/products?country=USA")
    assert r.status_code == 400
    assert "Invalid country" in r.json()["detail"]


async def test_marketplace_invalid_sort_returns_400(client: AsyncClient):
    r = await client.get("/api/v1/marketplace/products?sort=cheapest")
    assert r.status_code == 400


# ============================================================
# Cross-border block (defense-in-depth on /cart/checkout-token)
# ============================================================
async def test_checkout_token_cross_border_blocked(client: AsyncClient, _seed_block3):
    """Buyer in NGA tries to checkout a GHA seller's product → 422 with
    cross_border_not_supported reason."""
    payload = {"items": [{"product_id": str(_seed_block3["gha_product_id"]), "qty": 1}]}
    r = await client.post(
        "/api/v1/cart/checkout-token",
        json=payload,
        headers={"X-Wallet-Address": _NGA_BUYER},
    )
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["validation_errors"][0]["reason"] == "cross_border_not_supported"
    assert detail["validation_errors"][0]["buyer_country"] == "NGA"
    assert any(
        s["shop_handle"] == _GHA_HANDLE
        for s in detail["validation_errors"][0]["blocked_sellers"]
    )


async def test_checkout_token_intra_succeeds(client: AsyncClient, _seed_block3):
    """Buyer in NGA buys NGA seller's product → 200 with token."""
    payload = {"items": [{"product_id": str(_seed_block3["nga_product_id"]), "qty": 1}]}
    r = await client.post(
        "/api/v1/cart/checkout-token",
        json=payload,
        headers={"X-Wallet-Address": _NGA_BUYER},
    )
    assert r.status_code == 200, r.text
    assert "token" in r.json()


async def test_checkout_token_no_wallet_header_skips_block(
    client: AsyncClient, _seed_block3
):
    """If X-Wallet-Address header absent (legacy callers / public funnel),
    cross-border block is skipped (intra-only is enforced via
    is_cross_border=False hardcode in the contract path per ADR-041)."""
    payload = {"items": [{"product_id": str(_seed_block3["gha_product_id"]), "qty": 1}]}
    r = await client.post("/api/v1/cart/checkout-token", json=payload)
    assert r.status_code == 200, r.text
