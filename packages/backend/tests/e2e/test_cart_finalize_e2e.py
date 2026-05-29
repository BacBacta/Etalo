"""E2E tests for POST /api/v1/cart/finalize.

The frontend calls this right after `fundOrder` confirms to:
1. Decrement Product.stock by qty for each item in the seller group.
2. Stamp Order.product_ids with the expanded list.

The endpoint must be idempotent (retry-safe) and must never push stock
below zero even under concurrent calls.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


def _wallet(_suffix: str) -> str:
    body = uuid.uuid4().hex
    return ("0x" + body).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession,
    *,
    handle: str,
    shop_name: str,
) -> tuple[SellerProfile, str]:
    wallet = _wallet(handle.replace("-", ""))
    user = User(
        id=uuid.uuid4(),
        wallet_address=wallet,
        country="NGA",
    )
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


async def _seed_product(
    db: AsyncSession,
    *,
    seller: SellerProfile,
    slug: str,
    title: str,
    price: str = "10.00",
    stock: int = 5,
) -> Product:
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title=title,
        slug=slug,
        price_usdt=Decimal(price),
        stock=stock,
        status="active",
    )
    db.add(product)
    await db.flush()
    return product


async def _seed_order(
    db: AsyncSession,
    *,
    onchain_order_id: int,
    buyer: str,
    seller: str,
    total_amount_usdt: int = 10_000_000,
) -> Order:
    order = Order(
        id=uuid.uuid4(),
        onchain_order_id=onchain_order_id,
        buyer_address=buyer,
        seller_address=seller,
        total_amount_usdt=total_amount_usdt,
        total_commission_usdt=180_000,
        is_cross_border=False,
        global_status=OrderStatus.FUNDED,
        item_count=1,
        funded_at=datetime.now(timezone.utc),
        created_at_chain=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.flush()
    return order


@pytest_asyncio.fixture
async def finalize_seed(db: AsyncSession) -> AsyncGenerator[dict, None]:
    """Seed: 1 seller + 2 active products (stock=5, stock=2) + 1
    pre-existing Order row at onchain_order_id=900001 already in FUNDED
    state (mimics the indexer's handle_order_funded result).
    """
    suffix = uuid.uuid4().hex[:8]
    handle = f"fin-seller-{suffix}"
    seller, wallet = await _seed_seller(
        db, handle=handle, shop_name="Finalize Seller"
    )
    p_a = await _seed_product(
        db, seller=seller, slug=f"item-a-{suffix}", title="Item A",
        price="12.00", stock=5,
    )
    p_b = await _seed_product(
        db, seller=seller, slug=f"item-b-{suffix}", title="Item B",
        price="7.50", stock=2,
    )
    buyer = _wallet(f"buyer-{suffix}")

    # Match the onchain_order_id used in the test below.
    onchain_id = int(uuid.uuid4().int % 1_000_000_000) + 1
    order = await _seed_order(
        db,
        onchain_order_id=onchain_id,
        buyer=buyer,
        seller=wallet,
    )
    await db.commit()

    try:
        yield {
            "p_a": str(p_a.id),
            "p_b": str(p_b.id),
            "handle": handle,
            "onchain_order_id": onchain_id,
            "buyer": buyer,
            "order_db_id": order.id,
        }
    finally:
        await db.execute(delete(Order).where(Order.id == order.id))
        await db.execute(
            delete(Product).where(Product.seller_id == seller.id)
        )
        await db.execute(
            delete(SellerProfile).where(SellerProfile.id == seller.id)
        )
        await db.execute(delete(User).where(User.id == seller.user_id))
        await db.commit()


async def _issue_token(
    client: AsyncClient,
    *,
    product_id: str,
    qty: int,
    extra: list[dict] | None = None,
) -> str:
    items = [{"product_id": product_id, "qty": qty}]
    if extra:
        items.extend(extra)
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": items},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


# ============================================================
# Tests
# ============================================================
@pytest.mark.asyncio
async def test_finalize_decrements_stock_and_stamps_product_ids(
    client: AsyncClient, finalize_seed: dict, db: AsyncSession
):
    token = await _issue_token(
        client, product_id=finalize_seed["p_a"], qty=2
    )
    resp = await client.post(
        "/api/v1/cart/finalize",
        json={
            "token": token,
            "onchain_order_id": finalize_seed["onchain_order_id"],
            "seller_handle": finalize_seed["handle"],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "finalized"

    # Product.stock went 5 → 3
    prod = await db.get(Product, uuid.UUID(finalize_seed["p_a"]))
    await db.refresh(prod)
    assert prod.stock == 3

    # Order.product_ids contains [pid, pid] (expanded by qty)
    order = await db.get(Order, finalize_seed["order_db_id"])
    await db.refresh(order)
    assert order.product_ids == [
        uuid.UUID(finalize_seed["p_a"]),
        uuid.UUID(finalize_seed["p_a"]),
    ]


@pytest.mark.asyncio
async def test_finalize_is_idempotent(
    client: AsyncClient, finalize_seed: dict, db: AsyncSession
):
    token = await _issue_token(
        client, product_id=finalize_seed["p_a"], qty=1
    )
    body = {
        "token": token,
        "onchain_order_id": finalize_seed["onchain_order_id"],
        "seller_handle": finalize_seed["handle"],
    }
    first = await client.post("/api/v1/cart/finalize", json=body)
    assert first.json()["status"] == "finalized"

    second = await client.post("/api/v1/cart/finalize", json=body)
    assert second.status_code == 200
    assert second.json()["status"] == "already_finalized"

    # Stock decremented exactly once : 5 → 4 (not 3)
    prod = await db.get(Product, uuid.UUID(finalize_seed["p_a"]))
    await db.refresh(prod)
    assert prod.stock == 4


@pytest.mark.asyncio
async def test_finalize_returns_202_when_indexer_pending(
    client: AsyncClient, finalize_seed: dict
):
    token = await _issue_token(
        client, product_id=finalize_seed["p_a"], qty=1
    )
    # Use an onchain_order_id that does NOT match any Order row.
    resp = await client.post(
        "/api/v1/cart/finalize",
        json={
            "token": token,
            "onchain_order_id": finalize_seed["onchain_order_id"] + 999_999,
            "seller_handle": finalize_seed["handle"],
        },
    )
    assert resp.status_code == 202
    assert resp.json()["status"] == "indexer_pending"


@pytest.mark.asyncio
async def test_finalize_rejects_invalid_token(
    client: AsyncClient, finalize_seed: dict
):
    resp = await client.post(
        "/api/v1/cart/finalize",
        json={
            "token": "bogus.signature",
            "onchain_order_id": finalize_seed["onchain_order_id"],
            "seller_handle": finalize_seed["handle"],
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_finalize_accepts_expired_token(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    finalize_seed: dict,
    db: AsyncSession,
):
    """Fund txs can confirm > 60 min after token issuance on slow mobile
    networks. The signature is still valid, so finalize must accept the
    payload (no price re-check happens at this stage)."""
    monkeypatch.setattr("app.services.cart_token.TTL_MINUTES", -1)
    token = await _issue_token(
        client, product_id=finalize_seed["p_a"], qty=1
    )
    # Restore TTL so signature verification still passes ; only `exp`
    # in the envelope is now in the past.
    monkeypatch.setattr("app.services.cart_token.TTL_MINUTES", 60)

    resp = await client.post(
        "/api/v1/cart/finalize",
        json={
            "token": token,
            "onchain_order_id": finalize_seed["onchain_order_id"],
            "seller_handle": finalize_seed["handle"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "finalized"
    prod = await db.get(Product, uuid.UUID(finalize_seed["p_a"]))
    await db.refresh(prod)
    assert prod.stock == 4


@pytest.mark.asyncio
async def test_finalize_clamps_stock_at_zero_under_race(
    client: AsyncClient, finalize_seed: dict, db: AsyncSession
):
    """If a second finalize fires after stock is already exhausted (race
    between two orders sharing one Product), the UPDATE WHERE stock>=qty
    must skip silently rather than push stock negative.
    """
    # Drain stock_b to 0 manually so qty=2 would underflow.
    p_b_id = uuid.UUID(finalize_seed["p_b"])
    p_b = await db.get(Product, p_b_id)
    p_b.stock = 0
    await db.commit()

    token = await _issue_token(
        client, product_id=finalize_seed["p_b"], qty=2
    )
    resp = await client.post(
        "/api/v1/cart/finalize",
        json={
            "token": token,
            "onchain_order_id": finalize_seed["onchain_order_id"],
            "seller_handle": finalize_seed["handle"],
        },
    )
    assert resp.status_code == 200
    # Still "finalized" — product_ids gets stamped and order moves
    # forward ; warning logged for ops.
    assert resp.json()["status"] == "finalized"
    await db.refresh(p_b)
    assert p_b.stock == 0  # not -2
