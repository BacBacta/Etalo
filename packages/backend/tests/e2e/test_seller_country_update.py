"""E2E tests for seller profile country update — Sprint J11.7 Block 4.

Tests that PUT /sellers/me/profile correctly writes country to the
joined User row (not SellerProfile, which has no country column).
"""
from __future__ import annotations

import uuid
from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


_SELLER_WALLET = "0x" + "e" * 39 + "1"
_SELLER_HANDLE = "j117-block4-test"


@pytest_asyncio.fixture(autouse=True)
async def _seed_block4() -> AsyncGenerator[None, None]:
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            sp = (
                await s.execute(
                    select(SellerProfile).where(
                        SellerProfile.shop_handle == _SELLER_HANDLE
                    )
                )
            ).scalar_one_or_none()
            if sp is not None:
                await s.execute(delete(Product).where(Product.seller_id == sp.id))
                await s.execute(delete(SellerProfile).where(SellerProfile.id == sp.id))
            await s.execute(
                delete(User).where(User.wallet_address == _SELLER_WALLET)
            )
            await s.commit()

    await wipe()

    async with factory() as s:
        user = User(wallet_address=_SELLER_WALLET, country="NGA")
        s.add(user)
        await s.flush()
        sp = SellerProfile(
            user_id=user.id,
            shop_handle=_SELLER_HANDLE,
            shop_name="Block4 Test Shop",
        )
        s.add(sp)
        await s.commit()

    yield

    await wipe()


def _hdr() -> dict[str, str]:
    return {"X-Wallet-Address": _SELLER_WALLET}


# ============================================================
# GET /sellers/me — country hydrated from User
# ============================================================
async def test_get_me_returns_country(client: AsyncClient):
    r = await client.get("/api/v1/sellers/me", headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert body["profile"]["country"] == "NGA"


# ============================================================
# PUT /sellers/me/profile — country update
# ============================================================
async def test_update_country_writes_to_user(client: AsyncClient):
    r = await client.put(
        "/api/v1/sellers/me/profile",
        headers=_hdr(),
        json={"country": "GHA"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["country"] == "GHA"

    # Verify persisted on the User row
    factory = get_async_session_factory()
    async with factory() as s:
        user = (
            await s.execute(
                select(User).where(User.wallet_address == _SELLER_WALLET)
            )
        ).scalar_one()
        assert user.country == "GHA"


async def test_update_country_invalid_returns_422(client: AsyncClient):
    r = await client.put(
        "/api/v1/sellers/me/profile",
        headers=_hdr(),
        json={"country": "USA"},
    )
    assert r.status_code == 422
    assert "Invalid country" in r.text


async def test_update_other_field_preserves_country(client: AsyncClient):
    """Updating shop_name without sending country must NOT clear country."""
    r = await client.put(
        "/api/v1/sellers/me/profile",
        headers=_hdr(),
        json={"shop_name": "Renamed Shop"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["shop_name"] == "Renamed Shop"
    assert body["country"] == "NGA"  # untouched
