"""E2E tests for GET /api/v1/products/public/{handle} — J6 Block 2 Étape A.

The boutique listing endpoint backs the Next.js SSR page at /{handle}.
The seed_j4_data fixture in conftest.py does NOT insert SellerProfile or
Product rows (those weren't in J5 scope), so each test below seeds and
cleans up its own User / SellerProfile / Product rows. We use unique
handles per test (boutique-* prefix) to avoid collisions with other
seeds and to make cleanup trivial.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


def _wallet(suffix: str) -> str:
    """Make a syntactically-valid 0x address tagged for cleanup."""
    return ("0x" + suffix).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession,
    *,
    handle: str,
    shop_name: str,
    country: str = "NGA",
) -> SellerProfile:
    user = User(
        id=uuid.uuid4(),
        wallet_address=_wallet(handle.replace("-", "")[:8]),
        country=country,
    )
    db.add(user)
    await db.flush()

    seller = SellerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        shop_handle=handle,
        shop_name=shop_name,
        logo_ipfs_hash="QmTestLogoHash" + handle[:6],
    )
    db.add(seller)
    await db.flush()
    return seller


async def _seed_product(
    db: AsyncSession,
    *,
    seller: SellerProfile,
    slug: str,
    title: str,
    price: str = "10.00",
    status: str = "active",
    created_at: datetime | None = None,
    image_hashes: list[str] | None = None,
) -> Product:
    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title=title,
        slug=slug,
        price_usdt=Decimal(price),
        stock=5,
        status=status,
        image_ipfs_hashes=image_hashes or ["QmImg" + slug[:6]],
        created_at=created_at or datetime.now(timezone.utc),
    )
    db.add(product)
    await db.flush()
    return product


async def _cleanup(db: AsyncSession, handles: list[str]) -> None:
    from sqlalchemy import select

    seller_rows = (
        await db.scalars(
            select(SellerProfile).where(SellerProfile.shop_handle.in_(handles))
        )
    ).all()
    seller_ids = [s.id for s in seller_rows]
    user_ids = [s.user_id for s in seller_rows]
    if seller_ids:
        await db.execute(delete(Product).where(Product.seller_id.in_(seller_ids)))
        await db.execute(delete(SellerProfile).where(SellerProfile.id.in_(seller_ids)))
    if user_ids:
        await db.execute(delete(User).where(User.id.in_(user_ids)))
    await db.commit()


# ============================================================
# Fixtures
# ============================================================
@pytest_asyncio.fixture
async def seeded_seller_with_3_products(
    db: AsyncSession,
) -> AsyncGenerator[SellerProfile, None]:
    handle = "boutique-chioma"
    seller = await _seed_seller(db, handle=handle, shop_name="Chioma's Closet")
    base = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
    for i, slug in enumerate(["dress-red", "scarf-silk", "bag-leather"]):
        await _seed_product(
            db,
            seller=seller,
            slug=slug,
            title=slug.replace("-", " ").title(),
            created_at=base.replace(hour=10 + i),
        )
    await db.commit()
    try:
        yield seller
    finally:
        await _cleanup(db, [handle])


@pytest_asyncio.fixture
async def seeded_seller_mixed_status(
    db: AsyncSession,
) -> AsyncGenerator[SellerProfile, None]:
    handle = "boutique-aissa"
    seller = await _seed_seller(db, handle=handle, shop_name="Aissa Couture")
    await _seed_product(db, seller=seller, slug="ankara", title="Ankara", status="active")
    await _seed_product(db, seller=seller, slug="boubou", title="Boubou", status="draft")
    await _seed_product(db, seller=seller, slug="kente", title="Kente", status="paused")
    await db.commit()
    try:
        yield seller
    finally:
        await _cleanup(db, [handle])


# ============================================================
# Tests
# ============================================================
@pytest.mark.asyncio
async def test_404_unknown_handle(client: AsyncClient):
    resp = await client.get("/api/v1/products/public/zzz-not-found")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_happy_path_with_products(
    client: AsyncClient,
    seeded_seller_with_3_products: SellerProfile,
):
    resp = await client.get("/api/v1/products/public/boutique-chioma")
    assert resp.status_code == 200
    data = resp.json()

    assert data["seller"]["shop_handle"] == "boutique-chioma"
    assert data["seller"]["shop_name"] == "Chioma's Closet"
    assert data["seller"]["country"] == "NGA"
    assert data["seller"]["logo_url"] is not None
    # CLAUDE.md rule 5: no raw 0x addresses in public payloads.
    assert "wallet_address" not in data["seller"]
    assert "seller_address" not in data["seller"]

    assert len(data["products"]) == 3
    titles = {p["title"] for p in data["products"]}
    assert titles == {"Dress Red", "Scarf Silk", "Bag Leather"}

    # Each product has price + stock + primary_image_url resolved.
    sample = data["products"][0]
    assert sample["primary_image_url"].startswith("https://")
    assert "image_ipfs_hashes" not in sample  # raw hash not exposed

    assert data["pagination"]["page"] == 1
    assert data["pagination"]["page_size"] == 20
    assert data["pagination"]["total"] == 3
    assert data["pagination"]["has_more"] is False


@pytest.mark.asyncio
async def test_excludes_inactive_products(
    client: AsyncClient,
    seeded_seller_mixed_status: SellerProfile,
):
    resp = await client.get("/api/v1/products/public/boutique-aissa")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["products"]) == 1
    assert data["products"][0]["title"] == "Ankara"
    assert data["pagination"]["total"] == 1


@pytest.mark.asyncio
async def test_pagination_math(
    client: AsyncClient,
    seeded_seller_with_3_products: SellerProfile,
):
    resp = await client.get(
        "/api/v1/products/public/boutique-chioma?page=2&page_size=1"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["products"]) == 1
    assert data["pagination"]["page"] == 2
    assert data["pagination"]["page_size"] == 1
    assert data["pagination"]["total"] == 3
    assert data["pagination"]["has_more"] is True
