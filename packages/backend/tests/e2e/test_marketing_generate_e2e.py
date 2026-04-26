"""E2E tests for J7 Block 3 — POST /api/v1/marketing/generate-image.

Patterns follow tests/e2e/test_seller_crud_e2e.py:
- uuid-suffixed handles for cross-test isolation
- _seed_seller returns (seller, wallet) tuple to dodge psycopg3
  DuplicatePreparedStatement on subsequent SELECT in same fixture
- valid hex wallet bodies via uuid.uuid4().hex

The full pipeline (Playwright Chromium launch + screenshot) runs end-
to-end. Pinata is exercised against the dev-stub fallback unless the
local .env has PINATA_API_KEY set, in which case real Pinata is hit
(and a real CID is returned). The assertions accept both paths via
`ipfs_hash.startswith("Qm")`.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
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
async def marketing_seed(
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Two sellers (A owns a product, B owns nothing) for happy-path +
    wrong-owner tests."""
    suffix = uuid.uuid4().hex[:8]
    handles = [f"mkt-a-{suffix}", f"mkt-b-{suffix}"]
    seller_a, wallet_a = await _seed_seller(
        db, handle=handles[0], shop_name="Marketing Seller A"
    )
    _seller_b, wallet_b = await _seed_seller(
        db, handle=handles[1], shop_name="Marketing Seller B"
    )

    product = Product(
        id=uuid.uuid4(),
        seller_id=seller_a.id,
        title="Red Ankara Dress",
        slug=f"red-ankara-{suffix}",
        description="Hand-stitched, size M",
        price_usdt=Decimal("30.00"),
        stock=4,
        status="active",
        # No image_ipfs_hashes set — generator falls back to placeholder URL.
    )
    db.add(product)
    await db.commit()

    try:
        yield {
            "wallet_a": wallet_a,
            "wallet_b": wallet_b,
            "handle_a": handles[0],
            "product_id": str(product.id),
        }
    finally:
        await _cleanup(db, handles)


# ============================================================
# Happy paths — 3 templates × 2 langs sample
# ============================================================
@pytest.mark.asyncio
async def test_generate_ig_square_happy_path(
    client: AsyncClient, marketing_seed: dict
):
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_a"]},
        json={
            "product_id": marketing_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["template"] == "ig_square"
    assert data["ipfs_hash"].startswith("Qm")
    assert data["image_url"].endswith(data["ipfs_hash"])
    # Block 4 will replace this with real Claude output; until then the
    # stub must surface caption_lang so callers can confirm round-trip.
    assert "en" in data["caption"]
    assert "Red Ankara Dress" in data["caption"]


@pytest.mark.asyncio
async def test_generate_ig_story_happy_path_swahili(
    client: AsyncClient, marketing_seed: dict
):
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_a"]},
        json={
            "product_id": marketing_seed["product_id"],
            "template": "ig_story",
            "caption_lang": "sw",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["template"] == "ig_story"
    assert data["ipfs_hash"].startswith("Qm")
    assert "sw" in data["caption"]


@pytest.mark.asyncio
async def test_generate_fb_feed_happy_path(
    client: AsyncClient, marketing_seed: dict
):
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_a"]},
        json={
            "product_id": marketing_seed["product_id"],
            "template": "fb_feed",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["template"] == "fb_feed"
    assert data["ipfs_hash"].startswith("Qm")


# ============================================================
# Authorization
# ============================================================
@pytest.mark.asyncio
async def test_generate_wrong_owner_returns_404(
    client: AsyncClient, marketing_seed: dict
):
    """Seller B owns no product; asking for A's product must 404, not 403,
    so we don't leak existence to other sellers."""
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_b"]},
        json={
            "product_id": marketing_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_generate_unknown_product_returns_404(
    client: AsyncClient, marketing_seed: dict
):
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_a"]},
        json={
            "product_id": str(uuid.uuid4()),
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_invalid_template_returns_422(
    client: AsyncClient, marketing_seed: dict
):
    """Pydantic Literal validation rejects unsupported template keys."""
    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": marketing_seed["wallet_a"]},
        json={
            "product_id": marketing_seed["product_id"],
            "template": "linkedin",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 422
