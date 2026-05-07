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
    image_ipfs_hashes: list[str] | None = None,
) -> Product:
    # Default to a placeholder image so the product clears the V1
    # marketplace quality bar (image_ipfs_hashes IS NOT NULL +
    # cardinality >= 1). Tests that specifically need an image-less
    # product pass `image_ipfs_hashes=[]` explicitly.
    image_hashes = (
        image_ipfs_hashes
        if image_ipfs_hashes is not None
        else ["QmTestPlaceholder"]
    )
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title=title,
        slug=slug,
        price_usdt=Decimal(price),
        stock=stock,
        status=status,
        image_ipfs_hashes=image_hashes if image_hashes else None,
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


@pytest.mark.asyncio
async def test_marketplace_excludes_products_without_images(
    client: AsyncClient, db: AsyncSession
):
    """V1 quality bar — products with NULL or empty image_ipfs_hashes
    must not appear in the public marketplace listing. Same seller
    surfaces them on the dashboard (seller-side query is unaffected).
    """
    suffix = uuid.uuid4().hex[:8]
    handle = f"mp-image-filter-{suffix}"
    seller, _ = await _seed_seller(db, handle=handle, shop_name="Image Filter")
    base = datetime.now(timezone.utc) + timedelta(days=400)
    with_image = await _seed_product(
        db,
        seller=seller,
        slug=f"with-image-{suffix}",
        title="Has Image",
        created_at=base + timedelta(hours=2),
    )
    await _seed_product(
        db,
        seller=seller,
        slug=f"no-image-{suffix}",
        title="No Image",
        image_ipfs_hashes=[],  # explicit opt-out → row gets image_ipfs_hashes=NULL
        created_at=base + timedelta(hours=1),
    )
    await db.commit()
    try:
        resp = await client.get(
            "/api/v1/marketplace/products?limit=50",
        )
        assert resp.status_code == 200
        slugs = {p["slug"] for p in resp.json()["products"]}
        assert with_image.slug in slugs
        assert f"no-image-{suffix}" not in slugs
    finally:
        await _cleanup(db, [handle])


@pytest.mark.asyncio
async def test_marketplace_search_filters_by_title_substring(
    client: AsyncClient, db: AsyncSession
):
    """`?q=` performs a case-insensitive substring match over Product.title.
    Empty / whitespace-only q is treated as absent."""
    suffix = uuid.uuid4().hex[:8]
    handle = f"mp-search-{suffix}"
    seller, _ = await _seed_seller(db, handle=handle, shop_name="Search Seller")
    base = datetime.now(timezone.utc) + timedelta(days=500)
    await _seed_product(
        db, seller=seller, slug=f"robe-{suffix}", title="Robe wax M",
        created_at=base + timedelta(hours=2),
    )
    await _seed_product(
        db, seller=seller, slug=f"tshirt-{suffix}", title="T-shirt logo XL",
        created_at=base + timedelta(hours=1),
    )
    await db.commit()
    try:
        # Substring match (case-insensitive) — "robe" finds "Robe wax M".
        resp = await client.get(
            "/api/v1/marketplace/products?limit=50&q=robe",
        )
        assert resp.status_code == 200
        slugs = {p["slug"] for p in resp.json()["products"]}
        assert f"robe-{suffix}" in slugs
        assert f"tshirt-{suffix}" not in slugs

        # Whitespace-only q → no filter (both products visible).
        resp_blank = await client.get(
            "/api/v1/marketplace/products?limit=50&q=   ",
        )
        assert resp_blank.status_code == 200
        blank_slugs = {p["slug"] for p in resp_blank.json()["products"]}
        assert f"robe-{suffix}" in blank_slugs
        assert f"tshirt-{suffix}" in blank_slugs

        # No match → empty product list (200, not 404).
        resp_none = await client.get(
            "/api/v1/marketplace/products?limit=50&q=nonexistent-xyz",
        )
        assert resp_none.status_code == 200
        assert resp_none.json()["products"] == []
    finally:
        await _cleanup(db, [handle])
