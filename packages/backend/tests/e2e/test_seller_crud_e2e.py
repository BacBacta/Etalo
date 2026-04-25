"""E2E tests for J6 Block 8 Étape 8.1 — seller CRUD + IPFS upload + reads.

Patterns aligned with prior J6 backend tests:
- uuid-suffixed handles for cross-test isolation
- _seed_seller returns (seller, wallet) to dodge psycopg3
  DuplicatePreparedStatement on subsequent SELECT in same fixture
- valid hex wallet bodies via uuid.uuid4().hex
"""
from __future__ import annotations

import io
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


def _wallet() -> str:
    return ("0x" + uuid.uuid4().hex).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession,
    *,
    handle: str,
    shop_name: str,
) -> tuple[SellerProfile, str]:
    wallet = _wallet()
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


async def _cleanup(
    db: AsyncSession, handles: list[str], extra_orders: list[str] | None = None
) -> None:
    seller_rows = (
        await db.scalars(
            select(SellerProfile).where(SellerProfile.shop_handle.in_(handles))
        )
    ).all()
    seller_ids = [s.id for s in seller_rows]
    user_ids = [s.user_id for s in seller_rows]
    if seller_ids:
        await db.execute(delete(Product).where(Product.seller_id.in_(seller_ids)))
        await db.execute(
            delete(SellerProfile).where(SellerProfile.id.in_(seller_ids))
        )
    if user_ids:
        await db.execute(delete(User).where(User.id.in_(user_ids)))
    if extra_orders:
        await db.execute(
            delete(Order).where(Order.onchain_order_id.in_([int(o) for o in extra_orders]))
        )
    await db.commit()


@pytest_asyncio.fixture
async def crud_seed(
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Two sellers: A owns one product (for CRUD tests + ownership conflict)
    + B is empty (for wallet-not-seller tests in reverse)."""
    suffix = uuid.uuid4().hex[:8]
    handles = [f"crud-a-{suffix}", f"crud-b-{suffix}"]
    a, wallet_a = await _seed_seller(db, handle=handles[0], shop_name="CRUD A")
    b, wallet_b = await _seed_seller(db, handle=handles[1], shop_name="CRUD B")

    p_owned = Product(
        id=uuid.uuid4(),
        seller_id=a.id,
        title="Owned Product",
        slug=f"owned-{suffix}",
        price_usdt=Decimal("12.00"),
        stock=5,
        status="active",
    )
    db.add(p_owned)
    await db.commit()

    try:
        yield {
            "wallet_a": wallet_a,
            "wallet_b": wallet_b,
            "handle_a": handles[0],
            "handle_b": handles[1],
            "p_owned_id": str(p_owned.id),
            "p_owned_slug": p_owned.slug,
            "suffix": suffix,
        }
    finally:
        await _cleanup(db, handles)


@pytest_asyncio.fixture
async def orders_seed(
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """One seller + 2 orders (one COMPLETED, one CREATED) for the public
    orders read test."""
    suffix = uuid.uuid4().hex[:8]
    handle = f"orders-{suffix}"
    seller, wallet = await _seed_seller(db, handle=handle, shop_name="Orders Seller")

    base_id = 90_000 + (uuid.uuid4().int % 1_000)
    o1 = Order(
        id=uuid.uuid4(),
        onchain_order_id=base_id,
        buyer_address=_wallet(),
        seller_address=wallet,
        total_amount_usdt=20_000_000,
        total_commission_usdt=360_000,
        is_cross_border=False,
        global_status=OrderStatus.COMPLETED,
        item_count=1,
        created_at_chain=datetime(2026, 4, 24, 10, tzinfo=timezone.utc),
    )
    o2 = Order(
        id=uuid.uuid4(),
        onchain_order_id=base_id + 1,
        buyer_address=_wallet(),
        seller_address=wallet,
        total_amount_usdt=15_000_000,
        total_commission_usdt=270_000,
        is_cross_border=False,
        global_status=OrderStatus.CREATED,
        item_count=1,
        created_at_chain=datetime(2026, 4, 25, 10, tzinfo=timezone.utc),
    )
    db.add_all([o1, o2])
    await db.commit()

    try:
        yield {
            "wallet": wallet,
            "handle": handle,
            "order_ids": [str(base_id), str(base_id + 1)],
        }
    finally:
        await _cleanup(db, [handle], extra_orders=[str(base_id), str(base_id + 1)])


# ============================================================
# Product CRUD
# ============================================================
@pytest.mark.asyncio
async def test_create_product_happy_path(client: AsyncClient, crud_seed: dict):
    resp = await client.post(
        "/api/v1/products",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        json={
            "title": "New Product",
            "slug": f"new-{crud_seed['suffix']}",
            "description": "Hello",
            "price_usdt": "10.50",
            "stock": 3,
            "status": "active",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "New Product"
    assert data["slug"] == f"new-{crud_seed['suffix']}"
    assert Decimal(data["price_usdt"]) == Decimal("10.50")


@pytest.mark.asyncio
async def test_create_product_missing_header(client: AsyncClient, crud_seed: dict):
    resp = await client.post(
        "/api/v1/products",
        json={
            "title": "X",
            "slug": f"missing-{crud_seed['suffix']}",
            "price_usdt": "5.00",
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_product_unknown_wallet(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.post(
        "/api/v1/products",
        headers={"X-Wallet-Address": _wallet()},
        json={
            "title": "X",
            "slug": f"unknown-{crud_seed['suffix']}",
            "price_usdt": "5.00",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_product_slug_collision(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.post(
        "/api/v1/products",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        json={
            "title": "Dup",
            "slug": crud_seed["p_owned_slug"],
            "price_usdt": "5.00",
        },
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_product_happy_path(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.put(
        f"/api/v1/products/{crud_seed['p_owned_id']}",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        json={"price_usdt": "20.00", "stock": 99},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert Decimal(data["price_usdt"]) == Decimal("20.00")
    assert data["stock"] == 99


@pytest.mark.asyncio
async def test_update_product_wrong_owner(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.put(
        f"/api/v1/products/{crud_seed['p_owned_id']}",
        headers={"X-Wallet-Address": crud_seed["wallet_b"]},
        json={"price_usdt": "1.00"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_product_soft(client: AsyncClient, crud_seed: dict, db: AsyncSession):
    resp = await client.delete(
        f"/api/v1/products/{crud_seed['p_owned_id']}",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
    )
    assert resp.status_code == 204
    # Soft delete: status='deleted'. Expire the cached identity-map row
    # so the re-query reflects the API-side commit.
    db.expire_all()
    fresh = await db.scalar(
        select(Product).where(Product.id == uuid.UUID(crud_seed["p_owned_id"]))
    )
    assert fresh is not None
    assert fresh.status == "deleted"


# ============================================================
# Seller orders public read
# ============================================================
@pytest.mark.asyncio
async def test_seller_orders_public_read(
    client: AsyncClient, orders_seed: dict
):
    resp = await client.get(f"/api/v1/sellers/{orders_seed['wallet']}/orders")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pagination"]["total"] == 2
    assert len(data["orders"]) == 2


@pytest.mark.asyncio
async def test_seller_orders_status_filter(
    client: AsyncClient, orders_seed: dict
):
    # Enum stores the title-case value ("Completed", not "completed").
    resp = await client.get(
        f"/api/v1/sellers/{orders_seed['wallet']}/orders",
        params={"order_status": "Completed"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pagination"]["total"] == 1
    assert data["orders"][0]["global_status"] == "Completed"


# ============================================================
# IPFS upload (existing /uploads/ipfs, tightened to require_seller_auth)
# ============================================================
@pytest.mark.asyncio
async def test_upload_image_happy_path_dev_stub(
    client: AsyncClient, crud_seed: dict
):
    """Upload returns a valid IPFS hash. Dev stub vs real Pinata depends
    on whether PINATA_API_KEY is configured locally — both are valid."""
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"x" * 64
    resp = await client.post(
        "/api/v1/uploads/ipfs",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        files={"file": ("test.png", png_bytes, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ipfs_hash"].startswith("Qm")
    assert "url" in data
    assert isinstance(data["is_dev_stub"], bool)


@pytest.mark.asyncio
async def test_upload_image_invalid_type(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.post(
        "/api/v1/uploads/ipfs",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        files={"file": ("doc.pdf", b"%PDF", "application/pdf")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_image_unknown_wallet_404(client: AsyncClient):
    """ADR-036 tightens upload from any wallet → registered seller only."""
    resp = await client.post(
        "/api/v1/uploads/ipfs",
        headers={"X-Wallet-Address": _wallet()},
        files={"file": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert resp.status_code == 404


# ============================================================
# Profile update
# ============================================================
@pytest.mark.asyncio
async def test_update_my_profile_happy_path(
    client: AsyncClient, crud_seed: dict
):
    resp = await client.put(
        "/api/v1/sellers/me/profile",
        headers={"X-Wallet-Address": crud_seed["wallet_a"]},
        json={"shop_name": "Renamed Shop", "description": "Updated bio"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shop_name"] == "Renamed Shop"
    assert data["description"] == "Updated bio"
    # shop_handle stays immutable
    assert data["shop_handle"] == crud_seed["handle_a"]
