"""E2E tests for POST /api/v1/cart/checkout-token + GET /resolve/{token}.

J6 Block 6 Étape 6.1. Stateless HMAC token, no DB persistence — the
service tests cover the round-trip + tamper detection + TTL.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User

ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def _wallet(_suffix: str) -> str:
    """Build a unique valid-hex 42-char wallet address.

    The Mini App and JSON-LD downstream enforce hex via regex, so we use
    uuid4 hex (32 chars) padded to 40 — more than collision-resistant
    given the UNIQUE constraint on User.wallet_address.
    """
    body = uuid.uuid4().hex
    return ("0x" + body).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession,
    *,
    handle: str,
    shop_name: str,
) -> tuple[SellerProfile, str]:
    """Returns (seller, wallet_address) so callers don't have to re-query
    User to get the wallet — avoids psycopg3 prepared-statement reuse
    issues observed in this fixture's setup path.
    """
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
    status: str = "active",
) -> Product:
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title=title,
        slug=slug,
        price_usdt=Decimal(price),
        stock=stock,
        status=status,
    )
    db.add(product)
    await db.flush()
    return product


async def _cleanup(db: AsyncSession, handles: list[str]) -> None:
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
    await db.commit()


@pytest_asyncio.fixture
async def cart_seed(db: AsyncSession) -> AsyncGenerator[dict, None]:
    """Seed: 1 seller (cart-seller-a-<uuid>) + 3 products (active, draft,
    low-stock) + 1 second seller (cart-seller-b-<uuid>) + 1 active
    product. Yields a dict of product UUIDs and seller addresses for
    tests to consume.

    Handles are uuid-suffixed to avoid cross-test UNIQUE collisions if a
    prior cleanup didn't fully complete.
    """
    suffix = uuid.uuid4().hex[:8]
    handles = [f"cart-seller-a-{suffix}", f"cart-seller-b-{suffix}"]
    seller_a, wallet_a = await _seed_seller(
        db, handle=handles[0], shop_name="Cart Seller A"
    )
    p_active = await _seed_product(
        db, seller=seller_a, slug="active-item", title="Active Item",
        price="12.99", stock=10,
    )
    p_draft = await _seed_product(
        db, seller=seller_a, slug="draft-item", title="Draft Item",
        price="5.00", stock=10, status="draft",
    )
    p_low = await _seed_product(
        db, seller=seller_a, slug="low-stock", title="Low Stock",
        price="20.00", stock=1,
    )

    seller_b, wallet_b = await _seed_seller(
        db, handle=handles[1], shop_name="Cart Seller B"
    )
    p_other = await _seed_product(
        db, seller=seller_b, slug="other-item", title="Other Item",
        price="7.50", stock=5,
    )

    await db.commit()

    try:
        yield {
            "p_active": str(p_active.id),
            "p_draft": str(p_draft.id),
            "p_low": str(p_low.id),
            "p_other": str(p_other.id),
            "seller_a_address": wallet_a,
            "seller_b_address": wallet_b,
            "seller_a_handle": handles[0],
            "seller_b_handle": handles[1],
        }
    finally:
        await _cleanup(db, handles)


# ============================================================
# Tests
# ============================================================
@pytest.mark.asyncio
async def test_create_token_happy_path(client: AsyncClient, cart_seed: dict):
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": cart_seed["p_active"], "qty": 2}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "expires_at" in data
    parts = data["token"].split(".")
    assert len(parts) == 2
    assert len(parts[1]) == 64  # hex sha256 = 32 bytes * 2


@pytest.mark.asyncio
async def test_resolve_token_returns_locked_cart(
    client: AsyncClient, cart_seed: dict
):
    create = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": cart_seed["p_active"], "qty": 2}]},
    )
    token = create.json()["token"]

    resp = await client.get(f"/api/v1/cart/resolve/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["groups"]) == 1
    group = data["groups"][0]
    assert group["seller_handle"] == cart_seed["seller_a_handle"]
    assert ETH_ADDRESS_RE.match(group["seller_address"]) is not None
    assert group["seller_address"].lower() == cart_seed["seller_a_address"].lower()
    assert len(group["items"]) == 1
    item = group["items"][0]
    assert item["qty"] == 2
    assert Decimal(item["price_usdt"]) == Decimal("12.99")
    assert Decimal(group["subtotal_usdt"]) == Decimal("25.98")
    assert Decimal(data["total_usdt"]) == Decimal("25.98")
    # ADR-041 V1 scope restriction : intra-Africa only, supersedes
    # ADR-005 cross-border default.
    assert group["is_cross_border"] is False


@pytest.mark.asyncio
async def test_create_token_inactive_product(
    client: AsyncClient, cart_seed: dict
):
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": cart_seed["p_draft"], "qty": 1}]},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    errors = detail["validation_errors"]
    assert len(errors) == 1
    assert errors[0]["product_id"] == cart_seed["p_draft"]
    assert errors[0]["reason"] == "inactive"


@pytest.mark.asyncio
async def test_create_token_qty_exceeds_stock(
    client: AsyncClient, cart_seed: dict
):
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": cart_seed["p_low"], "qty": 5}]},
    )
    assert resp.status_code == 422
    errors = resp.json()["detail"]["validation_errors"]
    assert errors[0]["reason"] == "qty_exceeds_stock"
    assert errors[0]["available_qty"] == 1


@pytest.mark.asyncio
async def test_create_token_unknown_product(client: AsyncClient):
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": fake_uuid, "qty": 1}]},
    )
    assert resp.status_code == 422
    errors = resp.json()["detail"]["validation_errors"]
    assert errors[0]["reason"] == "not_found"


@pytest.mark.asyncio
async def test_resolve_token_invalid_signature(client: AsyncClient):
    # Forged token — base64 of random JSON + bogus signature.
    resp = await client.get("/api/v1/cart/resolve/abc.def")
    assert resp.status_code == 401
    assert "invalid_signature" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_token_multi_seller_grouping(
    client: AsyncClient, cart_seed: dict
):
    resp = await client.post(
        "/api/v1/cart/checkout-token",
        json={
            "items": [
                {"product_id": cart_seed["p_active"], "qty": 1},
                {"product_id": cart_seed["p_other"], "qty": 3},
            ]
        },
    )
    assert resp.status_code == 200
    token = resp.json()["token"]

    resolved = await client.get(f"/api/v1/cart/resolve/{token}")
    assert resolved.status_code == 200
    data = resolved.json()
    assert len(data["groups"]) == 2
    handles = {g["seller_handle"] for g in data["groups"]}
    assert handles == {cart_seed["seller_a_handle"], cart_seed["seller_b_handle"]}
    # 12.99 * 1 + 7.50 * 3 = 35.49
    assert Decimal(data["total_usdt"]) == Decimal("35.49")


@pytest.mark.asyncio
async def test_resolve_token_expired(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    cart_seed: dict,
):
    """Force TTL to a negative value so the token is born expired."""
    monkeypatch.setattr("app.services.cart_token.TTL_MINUTES", -1)
    create = await client.post(
        "/api/v1/cart/checkout-token",
        json={"items": [{"product_id": cart_seed["p_active"], "qty": 1}]},
    )
    token = create.json()["token"]
    resp = await client.get(f"/api/v1/cart/resolve/{token}")
    assert resp.status_code == 410
    assert "expired" in resp.json()["detail"].lower()
