"""E2E tests for curated marketplace sections (editorial rails).

Covers GET /api/v1/marketplace/sections : the `new` rail, the
`top_rated` rail (reputation-driven, one product per seller), empty-rail
omission, and country scoping.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.enums import SellerStatus
from app.models.product import Product
from app.models.reputation_cache import ReputationCache
from app.models.seller_profile import SellerProfile
from app.models.user import User

_TOP_WALLET = "0x" + "e" * 39 + "1"
_PLAIN_WALLET = "0x" + "f" * 39 + "1"
_GHA_WALLET = "0x" + "a" * 38 + "21"

_TOP_HANDLE = "sections-top"
_PLAIN_HANDLE = "sections-plain"
_GHA_HANDLE = "sections-gha"

_ALL_WALLETS = [_TOP_WALLET, _PLAIN_WALLET, _GHA_WALLET]
_ALL_HANDLES = [_TOP_HANDLE, _PLAIN_HANDLE, _GHA_HANDLE]


@pytest_asyncio.fixture(autouse=True)
async def _seed_sections() -> AsyncGenerator[dict, None]:
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            sellers = (
                await s.execute(
                    select(SellerProfile).where(
                        SellerProfile.shop_handle.in_(_ALL_HANDLES)
                    )
                )
            ).scalars().all()
            for sp in sellers:
                await s.execute(delete(Product).where(Product.seller_id == sp.id))
                await s.execute(
                    delete(SellerProfile).where(SellerProfile.id == sp.id)
                )
            await s.execute(
                delete(ReputationCache).where(
                    ReputationCache.seller_address.in_(_ALL_WALLETS)
                )
            )
            await s.execute(delete(User).where(User.wallet_address.in_(_ALL_WALLETS)))
            await s.commit()

    await wipe()

    async with factory() as s:
        # Top-rated NGA seller (has a reputation track record).
        top_user = User(wallet_address=_TOP_WALLET, country="NGA")
        s.add(top_user)
        await s.flush()
        top_seller = SellerProfile(
            user_id=top_user.id, shop_handle=_TOP_HANDLE, shop_name="Top Shop"
        )
        s.add(top_seller)
        await s.flush()
        s.add_all(
            [
                Product(
                    seller_id=top_seller.id,
                    title="Top Product A",
                    slug="sections-top-a",
                    price_usdt=10,
                    stock=5,
                    status="active",
                    image_ipfs_hashes=["QmTop1"],
                ),
                Product(
                    seller_id=top_seller.id,
                    title="Top Product B",
                    slug="sections-top-b",
                    price_usdt=12,
                    stock=5,
                    status="active",
                    image_ipfs_hashes=["QmTop2"],
                ),
            ]
        )
        s.add(
            ReputationCache(
                seller_address=_TOP_WALLET,
                orders_completed=10,
                is_top_seller=True,
                score=88,
                status=SellerStatus.ACTIVE,
                last_synced_at=datetime.now(timezone.utc),
            )
        )

        # Plain NGA seller (no reputation row).
        plain_user = User(wallet_address=_PLAIN_WALLET, country="NGA")
        s.add(plain_user)
        await s.flush()
        plain_seller = SellerProfile(
            user_id=plain_user.id, shop_handle=_PLAIN_HANDLE, shop_name="Plain Shop"
        )
        s.add(plain_seller)
        await s.flush()
        s.add(
            Product(
                seller_id=plain_seller.id,
                title="Plain Product",
                slug="sections-plain-a",
                price_usdt=8,
                stock=5,
                status="active",
                image_ipfs_hashes=["QmPlain1"],
            )
        )

        # GHA seller — for country scoping.
        gha_user = User(wallet_address=_GHA_WALLET, country="GHA")
        s.add(gha_user)
        await s.flush()
        gha_seller = SellerProfile(
            user_id=gha_user.id, shop_handle=_GHA_HANDLE, shop_name="GHA Shop"
        )
        s.add(gha_seller)
        await s.flush()
        s.add(
            Product(
                seller_id=gha_seller.id,
                title="GHA Product",
                slug="sections-gha-a",
                price_usdt=9,
                stock=5,
                status="active",
                image_ipfs_hashes=["QmGha1"],
            )
        )
        await s.commit()

    yield {}
    await wipe()


def _section(body: dict, key: str) -> dict | None:
    return next((s for s in body["sections"] if s["key"] == key), None)


async def test_sections_new_rail_lists_recent_products(client: AsyncClient):
    r = await client.get("/api/v1/marketplace/sections")
    assert r.status_code == 200, r.text
    new = _section(r.json(), "new")
    assert new is not None
    handles = {p["seller_handle"] for p in new["products"]}
    # Freshly-seeded products are within the 7-day window.
    assert _TOP_HANDLE in handles
    assert _PLAIN_HANDLE in handles


async def test_sections_top_rated_dedupes_by_seller(client: AsyncClient):
    r = await client.get("/api/v1/marketplace/sections")
    body = r.json()
    top = _section(body, "top_rated")
    assert top is not None
    handles = [p["seller_handle"] for p in top["products"]]
    # Only the seller with a reputation row appears…
    assert _TOP_HANDLE in handles
    assert _PLAIN_HANDLE not in handles
    # …and exactly once despite owning two products (per-seller dedupe).
    assert handles.count(_TOP_HANDLE) == 1
    # Real social proof flows through.
    top_item = next(p for p in top["products"] if p["seller_handle"] == _TOP_HANDLE)
    assert top_item["seller_orders_completed"] == 10
    assert top_item["seller_is_top_seller"] is True


async def test_sections_country_scoping_omits_empty_rails(client: AsyncClient):
    # GHA seller has a product but no reputation → `new` present,
    # `top_rated` omitted (empty rail not rendered).
    r = await client.get("/api/v1/marketplace/sections?country=GHA")
    assert r.status_code == 200
    body = r.json()
    new = _section(body, "new")
    assert new is not None
    assert {p["seller_handle"] for p in new["products"]} == {_GHA_HANDLE}
    assert _section(body, "top_rated") is None


async def test_sections_invalid_country_returns_400(client: AsyncClient):
    r = await client.get("/api/v1/marketplace/sections?country=USA")
    assert r.status_code == 400
