"""E2E tests for /users/me endpoints — Sprint J11.7 Block 5 (ADR-045).

Replaces the J5 stub coverage with real assertions on read + upsert
behavior. Same dev-auth pattern as Block 2/4 (X-Wallet-Address header).
"""
from __future__ import annotations

from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.user import User


_BUYER_WALLET = "0x" + "5" * 39 + "1"


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_buyer() -> AsyncGenerator[None, None]:
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            await s.execute(
                delete(User).where(User.wallet_address == _BUYER_WALLET)
            )
            await s.commit()

    await wipe()
    yield
    await wipe()


def _hdr() -> dict[str, str]:
    return {"X-Wallet-Address": _BUYER_WALLET}


# ============================================================
# GET /users/me — null-when-missing pattern
# ============================================================
async def test_get_me_returns_null_for_unknown_wallet(client: AsyncClient):
    r = await client.get("/api/v1/users/me", headers=_hdr())
    assert r.status_code == 200
    assert r.json() == {"user": None}


async def test_get_me_no_auth_returns_401(client: AsyncClient):
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401


# ============================================================
# PUT /users/me — upsert + country validation
# ============================================================
async def test_put_me_creates_row_first_visit(client: AsyncClient):
    """Fresh wallet : PUT /users/me should create the User row."""
    r = await client.put(
        "/api/v1/users/me", headers=_hdr(), json={"country": "GHA"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wallet_address"] == _BUYER_WALLET
    assert body["country"] == "GHA"
    assert body["has_seller_profile"] is False

    # Verify GET reflects the change
    r2 = await client.get("/api/v1/users/me", headers=_hdr())
    assert r2.json()["user"]["country"] == "GHA"


async def test_put_me_updates_existing_row(client: AsyncClient):
    """First write creates ; second write updates."""
    await client.put("/api/v1/users/me", headers=_hdr(), json={"country": "NGA"})
    r = await client.put(
        "/api/v1/users/me", headers=_hdr(), json={"country": "KEN"}
    )
    assert r.status_code == 200
    assert r.json()["country"] == "KEN"


async def test_put_me_invalid_country_returns_422(client: AsyncClient):
    r = await client.put(
        "/api/v1/users/me", headers=_hdr(), json={"country": "USA"}
    )
    assert r.status_code == 422
    assert "Invalid country" in r.text


async def test_put_me_partial_update_preserves_other_fields(
    client: AsyncClient,
):
    """Updating language alone must NOT clear country."""
    await client.put(
        "/api/v1/users/me",
        headers=_hdr(),
        json={"country": "NGA", "language": "en"},
    )
    r = await client.put(
        "/api/v1/users/me", headers=_hdr(), json={"language": "fr"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["language"] == "fr"
    assert body["country"] == "NGA"  # preserved
