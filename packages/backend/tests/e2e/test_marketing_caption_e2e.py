"""E2E tests for J7 Block 4 — POST /api/v1/marketing/generate-caption
plus the caption integration in /generate-image.

Mocking strategy: we patch generate_caption at its IMPORT site
(app.routers.marketing.generate_caption and
app.services.asset_generator.generate_caption) so no test ever calls
the real Anthropic API. Keeps CI green without ANTHROPIC_API_KEY and
gives deterministic assertions.
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
from app.services.caption_generator import CaptionGenerationError


def _wallet() -> str:
    return ("0x" + uuid.uuid4().hex).ljust(42, "0").lower()


async def _seed_seller(
    db: AsyncSession, *, handle: str, shop_name: str
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
async def caption_seed(db: AsyncSession) -> AsyncGenerator[dict, None]:
    suffix = uuid.uuid4().hex[:8]
    handles = [f"capt-a-{suffix}", f"capt-b-{suffix}"]
    seller_a, wallet_a = await _seed_seller(
        db, handle=handles[0], shop_name="Caption Seller A"
    )
    _, wallet_b = await _seed_seller(
        db, handle=handles[1], shop_name="Caption Seller B"
    )

    product = Product(
        id=uuid.uuid4(),
        seller_id=seller_a.id,
        title="Hand-Beaded Bracelet",
        slug=f"bracelet-{suffix}",
        description="Maasai-inspired beadwork, adjustable",
        price_usdt=Decimal("18.50"),
        stock=10,
        status="active",
    )
    db.add(product)
    await db.commit()

    try:
        yield {
            "wallet_a": wallet_a,
            "wallet_b": wallet_b,
            "product_id": str(product.id),
        }
    finally:
        await _cleanup(db, handles)


# ============================================================
# /generate-caption — happy paths
# ============================================================
@pytest.mark.asyncio
async def test_generate_caption_en_happy_path(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    caption_seed: dict,
):
    async def fake_generate_caption(**kwargs) -> str:
        assert kwargs["lang"] == "en"
        assert kwargs["title"] == "Hand-Beaded Bracelet"
        assert kwargs["price_usdt"] == "18.50"
        return "Stunning hand-beaded bracelet 18.50 USDT — escrow-protected. Tap to shop @capt-a"

    monkeypatch.setattr(
        "app.routers.marketing.generate_caption", fake_generate_caption
    )

    resp = await client.post(
        "/api/v1/marketing/generate-caption",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={"product_id": caption_seed["product_id"], "lang": "en"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lang"] == "en"
    assert "18.50" in data["caption"]


@pytest.mark.asyncio
async def test_generate_caption_sw_happy_path(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    caption_seed: dict,
):
    async def fake_generate_caption(**kwargs) -> str:
        assert kwargs["lang"] == "sw"
        return "Bangili nzuri sana 18.50 USDT — ulinzi wa escrow. Bonyeza kununua @capt-a"

    monkeypatch.setattr(
        "app.routers.marketing.generate_caption", fake_generate_caption
    )

    resp = await client.post(
        "/api/v1/marketing/generate-caption",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={"product_id": caption_seed["product_id"], "lang": "sw"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lang"] == "sw"
    assert "USDT" in data["caption"]


# ============================================================
# /generate-caption — failure paths
# ============================================================
@pytest.mark.asyncio
async def test_generate_caption_wrong_owner_404(
    client: AsyncClient, caption_seed: dict
):
    """Wallet B doesn't own the product — 404, not 403, to avoid leaking
    existence across sellers. No mock needed: ownership check runs before
    the Claude call, so this never hits the API even without creds."""
    resp = await client.post(
        "/api/v1/marketing/generate-caption",
        headers={"X-Wallet-Address": caption_seed["wallet_b"]},
        json={"product_id": caption_seed["product_id"], "lang": "en"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_caption_unknown_product_404(
    client: AsyncClient, caption_seed: dict
):
    resp = await client.post(
        "/api/v1/marketing/generate-caption",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={"product_id": str(uuid.uuid4()), "lang": "en"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_caption_api_failure_returns_503(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    caption_seed: dict,
):
    """When Claude API fails, the standalone caption endpoint surfaces
    503 (it has no fallback — failing loud is the right UX for an
    explicit caption-regen action)."""

    async def failing_caption(**kwargs) -> str:
        raise CaptionGenerationError("Anthropic timed out (mock)")

    monkeypatch.setattr(
        "app.routers.marketing.generate_caption", failing_caption
    )

    resp = await client.post(
        "/api/v1/marketing/generate-caption",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={"product_id": caption_seed["product_id"], "lang": "en"},
    )
    assert resp.status_code == 503
    assert "Caption service" in resp.json()["detail"]


# ============================================================
# /generate-image — caption integration
# ============================================================
@pytest.mark.asyncio
async def test_generate_image_uses_real_caption_from_claude(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    caption_seed: dict,
):
    """The Block 3 image pipeline now feeds caption_generator. Mocked here
    to avoid real API calls; the assertion proves caption flows from the
    Claude path (vs. the Block 3 stub or the fallback)."""
    sentinel = "MOCKED-CLAUDE: shop the bracelet now"

    async def fake_generate_caption(**kwargs) -> str:
        return sentinel

    monkeypatch.setattr(
        "app.services.asset_generator.generate_caption", fake_generate_caption
    )

    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={
            "product_id": caption_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["caption"] == sentinel


@pytest.mark.asyncio
async def test_generate_image_falls_back_when_claude_fails(
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
    caption_seed: dict,
):
    """When Claude fails inside the full pipeline, the image still ships
    with a deterministic fallback caption (no 503 — the seller already
    waited 5s for the render)."""

    async def failing_caption(**kwargs) -> str:
        raise CaptionGenerationError("simulated outage")

    monkeypatch.setattr(
        "app.services.asset_generator.generate_caption", failing_caption
    )

    resp = await client.post(
        "/api/v1/marketing/generate-image",
        headers={"X-Wallet-Address": caption_seed["wallet_a"]},
        json={
            "product_id": caption_seed["product_id"],
            "template": "ig_square",
            "caption_lang": "en",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "Hand-Beaded Bracelet" in data["caption"]
    assert "USDT" in data["caption"]
