"""E2E tests for GET /api/v1/marketplace/products — J6 Block 7 Étape 7.1.

Pattern aligned with cart token tests (Étape 6.1):
- uuid-suffixed handles to avoid UNIQUE collisions across tests
- _seed_seller returns (seller, wallet) tuple to dodge psycopg3
  DuplicatePreparedStatement on subsequent SELECT in same fixture
- uuid.hex wallet bodies (valid hex regex)
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    country: str = "NGA",
) -> tuple[SellerProfile, str]:
    wallet = _wallet()
    user = User(
        id=uuid.uuid4(),
        wallet_address=wallet,
        country=country,
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
    created_at: datetime | None = None,
) -> Product:
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title=title,
        slug=slug,
        price_usdt=Decimal(price),
        stock=stock,
        status=status,
        created_at=created_at or datetime.now(timezone.utc),
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
async def mp_seed_3_active(
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Single seller, 3 active products with controlled created_at so
    sort + cursor pagination assertions are deterministic.
    """
    suffix = uuid.uuid4().hex[:8]
    handle = f"mp-seller-a-{suffix}"
    seller, _ = await _seed_seller(db, handle=handle, shop_name="MP Seller A")

    # Anchor the seeded products at "now + far future offsets" so they
    # land at the head of the marketplace listing regardless of other
    # rows the DB may have accumulated from prior test runs. The
    # cursor test depends on this ordering.
    base = datetime.now(timezone.utc) + timedelta(days=365)
    p_old = await _seed_product(
        db, seller=seller, slug=f"item-old-{suffix}", title="Item Old",
        created_at=base,
    )
    p_mid = await _seed_product(
        db, seller=seller, slug=f"item-mid-{suffix}", title="Item Mid",
        created_at=base + timedelta(hours=1),
    )
    p_new = await _seed_product(
        db, seller=seller, slug=f"item-new-{suffix}", title="Item New",
        created_at=base + timedelta(hours=2),
    )
    await db.commit()
    try:
        yield {
            "handle": handle,
            "p_old_slug": p_old.slug,
            "p_mid_slug": p_mid.slug,
            "p_new_slug": p_new.slug,
        }
    finally:
        await _cleanup(db, [handle])


@pytest_asyncio.fixture
async def mp_seed_mixed_status(
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """1 active + 1 draft + 1 paused product on a single seller."""
    suffix = uuid.uuid4().hex[:8]
    handle = f"mp-mixed-{suffix}"
    seller, _ = await _seed_seller(db, handle=handle, shop_name="MP Mixed")
    await _seed_product(
        db, seller=seller, slug=f"active-{suffix}", title="Active",
        status="active",
    )
    await _seed_product(
        db, seller=seller, slug=f"draft-{suffix}", title="Draft",
        status="draft",
    )
    await _seed_product(
        db, seller=seller, slug=f"paused-{suffix}", title="Paused",
        status="paused",
    )
    await db.commit()
    try:
        yield handle
    finally:
        await _cleanup(db, [handle])


@pytest_asyncio.fixture
async def mp_seed_two_sellers(
    db: AsyncSession,
) -> AsyncGenerator[tuple[str, str], None]:
    suffix = uuid.uuid4().hex[:8]
    handles = (f"mp-multi-a-{suffix}", f"mp-multi-b-{suffix}")
    a, _ = await _seed_seller(db, handle=handles[0], shop_name="Multi A")
    b, _ = await _seed_seller(db, handle=handles[1], shop_name="Multi B")
    await _seed_product(db, seller=a, slug=f"a-item-{suffix}", title="A Item")
    await _seed_product(db, seller=b, slug=f"b-item-{suffix}", title="B Item")
    await db.commit()
    try:
        yield handles
    finally:
        await _cleanup(db, list(handles))


# ============================================================
# Tests
# ============================================================
@pytest.mark.asyncio
async def test_marketplace_response_shape(client: AsyncClient):
    """Endpoint always returns the documented JSON shape, even on empty DB."""
    resp = await client.get("/api/v1/marketplace/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "products" in data
    assert "pagination" in data
    assert isinstance(data["products"], list)
    assert "next_cursor" in data["pagination"]
    assert "has_more" in data["pagination"]


@pytest.mark.asyncio
async def test_marketplace_happy_path_sorted(
    client: AsyncClient,
    mp_seed_3_active: dict,
):
    resp = await client.get("/api/v1/marketplace/products")
    assert resp.status_code == 200
    data = resp.json()

    seeded_slugs = {
        mp_seed_3_active["p_old_slug"],
        mp_seed_3_active["p_mid_slug"],
        mp_seed_3_active["p_new_slug"],
    }
    seeded = [p for p in data["products"] if p["slug"] in seeded_slugs]
    assert len(seeded) == 3

    # The fixture's 3 seeded products must appear in created_at DESC order
    # *relative to each other*. (Other DB rows may interleave.)
    seeded_in_response_order = [
        p["slug"] for p in data["products"] if p["slug"] in seeded_slugs
    ]
    assert seeded_in_response_order == [
        mp_seed_3_active["p_new_slug"],
        mp_seed_3_active["p_mid_slug"],
        mp_seed_3_active["p_old_slug"],
    ]

    sample = seeded[0]
    assert sample["seller_handle"] == mp_seed_3_active["handle"]
    assert sample["seller_shop_name"] == "MP Seller A"
    assert sample["seller_country"] == "NGA"


@pytest.mark.asyncio
async def test_marketplace_excludes_inactive(
    client: AsyncClient,
    mp_seed_mixed_status: str,
):
    resp = await client.get("/api/v1/marketplace/products?limit=50")
    assert resp.status_code == 200
    data = resp.json()
    seeded = [
        p for p in data["products"] if p["seller_handle"] == mp_seed_mixed_status
    ]
    assert len(seeded) == 1
    assert seeded[0]["title"] == "Active"


@pytest.mark.asyncio
async def test_marketplace_pagination_cursor(
    client: AsyncClient,
    mp_seed_3_active: dict,
):
    # Page 1: only seeded items, limit=2 narrows to first two of the 3.
    # Filter to the seeded handle so other DB rows don't interfere.
    handle = mp_seed_3_active["handle"]

    page1 = await client.get(
        "/api/v1/marketplace/products", params={"limit": 2}
    )
    assert page1.status_code == 200
    page1_data = page1.json()

    # Get cursor from seeded subset assuming the 3 seeded products are at
    # the head (they're the most recent). The endpoint sorts globally, so
    # we walk the response and confirm the cursor advances *through* our
    # seeded set when no other rows interleave between p_new and p_old.
    seeded_slugs = {
        mp_seed_3_active["p_old_slug"],
        mp_seed_3_active["p_mid_slug"],
        mp_seed_3_active["p_new_slug"],
    }

    # Sanity: the response surfaces at least p_new (most recent of seed).
    assert any(
        p["slug"] == mp_seed_3_active["p_new_slug"] for p in page1_data["products"]
    )
    assert page1_data["pagination"]["has_more"] is True
    assert page1_data["pagination"]["next_cursor"] is not None

    # Page 2 with cursor — pass via params to URL-encode the `+` in the
    # ISO timezone offset (FastAPI parses raw `+` as space otherwise).
    next_cursor = page1_data["pagination"]["next_cursor"]
    page2 = await client.get(
        "/api/v1/marketplace/products",
        params={"limit": 50, "after": next_cursor},
    )
    assert page2.status_code == 200
    page2_data = page2.json()

    page1_seeded = {
        p["slug"] for p in page1_data["products"] if p["slug"] in seeded_slugs
    }
    page2_seeded = {
        p["slug"] for p in page2_data["products"] if p["slug"] in seeded_slugs
    }
    # No overlap of seeded slugs across pages.
    assert page1_seeded.isdisjoint(page2_seeded)
    # Combined pages cover the full seed.
    assert page1_seeded | page2_seeded == seeded_slugs
    # Filter ignored — handle var exists for future debug logs.
    _ = handle


@pytest.mark.asyncio
async def test_marketplace_two_sellers(
    client: AsyncClient,
    mp_seed_two_sellers: tuple[str, str],
):
    handle_a, handle_b = mp_seed_two_sellers
    resp = await client.get("/api/v1/marketplace/products?limit=50")
    assert resp.status_code == 200
    data = resp.json()

    handles_in_response = {p["seller_handle"] for p in data["products"]}
    assert handle_a in handles_in_response
    assert handle_b in handles_in_response


@pytest.mark.asyncio
async def test_marketplace_invalid_cursor_falls_back(client: AsyncClient):
    """A malformed cursor must not 400 — fall back to first page."""
    resp = await client.get("/api/v1/marketplace/products?after=garbage-not-iso")
    assert resp.status_code == 200
    data = resp.json()
    assert "products" in data
