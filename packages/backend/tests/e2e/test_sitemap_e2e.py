"""E2E tests for GET /api/v1/sitemap/data — J6 Block 3 Étape 3.2.

The sitemap data endpoint feeds Next.js app/sitemap.ts. We don't share
fixtures with test_products_public_handle_e2e.py (those are pre-cleaned
between tests) — this file owns its own seed with a unique handle prefix
to keep test isolation simple.
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

from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


def _wallet(suffix: str) -> str:
    return ("0x" + suffix).ljust(42, "0").lower()


async def _seed(db: AsyncSession, *, handle: str, n_active: int = 3) -> None:
    user = User(
        id=uuid.uuid4(),
        wallet_address=_wallet(handle.replace("-", "")[:10]),
        country="NGA",
    )
    db.add(user)
    await db.flush()

    seller = SellerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        shop_handle=handle,
        shop_name=f"Sitemap Shop {handle}",
    )
    db.add(seller)
    await db.flush()

    for i in range(n_active):
        db.add(
            Product(
                id=uuid.uuid4(),
                seller_id=seller.id,
                title=f"Item {i}",
                slug=f"sitemap-item-{i}",
                price_usdt=Decimal("10.00"),
                stock=5,
                status="active",
            )
        )
    # 1 draft that must NOT appear in the products list
    db.add(
        Product(
            id=uuid.uuid4(),
            seller_id=seller.id,
            title="Draft",
            slug="sitemap-draft",
            price_usdt=Decimal("99.99"),
            stock=0,
            status="draft",
        )
    )
    await db.commit()


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
        await db.execute(delete(SellerProfile).where(SellerProfile.id.in_(seller_ids)))
    if user_ids:
        await db.execute(delete(User).where(User.id.in_(user_ids)))
    await db.commit()


@pytest_asyncio.fixture
async def sitemap_seeded_seller(
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    handle = "sitemap-seller-1"
    await _seed(db, handle=handle, n_active=3)
    try:
        yield handle
    finally:
        await _cleanup(db, [handle])


@pytest.mark.asyncio
async def test_sitemap_data_shape(client: AsyncClient):
    """Endpoint returns the documented JSON shape regardless of data."""
    resp = await client.get("/api/v1/sitemap/data")
    assert resp.status_code == 200
    data = resp.json()
    assert "sellers" in data
    assert "products" in data
    assert isinstance(data["sellers"], list)
    assert isinstance(data["products"], list)


@pytest.mark.asyncio
async def test_sitemap_data_with_seeded_seller(
    client: AsyncClient,
    sitemap_seeded_seller: str,
):
    """Seeded seller + 3 active products show up; draft excluded."""
    resp = await client.get("/api/v1/sitemap/data")
    assert resp.status_code == 200
    data = resp.json()

    handles = {s["handle"] for s in data["sellers"]}
    assert sitemap_seeded_seller in handles

    seeded_products = [
        p for p in data["products"] if p["handle"] == sitemap_seeded_seller
    ]
    assert len(seeded_products) == 3
    slugs = {p["slug"] for p in seeded_products}
    assert slugs == {"sitemap-item-0", "sitemap-item-1", "sitemap-item-2"}
    # Draft must not appear
    assert all(p["slug"] != "sitemap-draft" for p in seeded_products)
