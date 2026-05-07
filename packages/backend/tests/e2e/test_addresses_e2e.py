"""E2E tests for buyer address book CRUD — Sprint J11.7 Block 2 (ADR-044).

Covers : list / create / patch / delete / set-default flows + privacy
guard (caller header isolation) + country enum validation. Uses a
dedicated test wallet that is created and cleaned up per-module to
avoid pollution of seed_j4_data fixtures.
"""
from __future__ import annotations

import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.delivery_address import DeliveryAddress
from app.models.user import User


# Dedicated test wallets (lowercase, won't collide with seed CHIOMA/AISSA)
TEST_BUYER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
TEST_BUYER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_addresses_fixture() -> AsyncGenerator[None, None]:
    """Wipe both test buyers + their addresses before AND after each
    test. Block 2 tests are not transactional so we rely on explicit
    cleanup."""
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            users = (
                await s.execute(
                    select(User).where(
                        User.wallet_address.in_([TEST_BUYER_A, TEST_BUYER_B])
                    )
                )
            ).scalars().all()
            for u in users:
                await s.execute(delete(DeliveryAddress).where(DeliveryAddress.user_id == u.id))
            await s.execute(
                delete(User).where(User.wallet_address.in_([TEST_BUYER_A, TEST_BUYER_B]))
            )
            await s.commit()

    await wipe()

    # Seed both test users so the router's _get_or_404_user passes.
    async with factory() as s:
        s.add(User(wallet_address=TEST_BUYER_A, country="NGA"))
        s.add(User(wallet_address=TEST_BUYER_B, country="GHA"))
        await s.commit()

    yield

    await wipe()


def _hdr(wallet: str) -> dict[str, str]:
    return {"X-Wallet-Address": wallet}


def _payload(country: str = "NGA", **overrides) -> dict:
    base = {
        "phone_number": "+2348012345678",
        "country": country,
        "city": "Lagos",
        "region": "Lagos State",
        "address_line": "12 Allen Avenue, Ikeja",
        "landmark": "Pres de la pharmacie centrale",
        "notes": None,
    }
    base.update(overrides)
    return base


# ============================================================
# 1. List behavior
# ============================================================
async def test_list_empty_returns_zero_count(client: AsyncClient):
    r = await client.get("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A))
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["items"] == []


async def test_list_no_auth_header_returns_401(client: AsyncClient):
    r = await client.get("/api/v1/me/addresses")
    assert r.status_code == 401


# ============================================================
# 2. Create behavior
# ============================================================
async def test_create_first_address_becomes_default(client: AsyncClient):
    r = await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload()
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_default"] is True
    assert body["country"] == "NGA"
    assert body["city"] == "Lagos"


async def test_create_second_address_not_default(client: AsyncClient):
    # First — becomes default
    r1 = await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload()
    )
    assert r1.status_code == 201
    # Second — not default
    r2 = await client.post(
        "/api/v1/me/addresses",
        headers=_hdr(TEST_BUYER_A),
        json=_payload(city="Abuja", region="FCT"),
    )
    assert r2.status_code == 201
    assert r2.json()["is_default"] is False


async def test_create_invalid_country_returns_422(client: AsyncClient):
    r = await client.post(
        "/api/v1/me/addresses",
        headers=_hdr(TEST_BUYER_A),
        json=_payload(country="USA"),
    )
    assert r.status_code == 422


async def test_create_missing_required_field_returns_422(client: AsyncClient):
    bad = _payload()
    del bad["city"]
    r = await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=bad
    )
    assert r.status_code == 422


# ============================================================
# 3. Privacy isolation
# ============================================================
async def test_get_list_returns_only_caller_addresses(client: AsyncClient):
    # Buyer A creates 2 addresses
    await client.post("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload())
    await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A),
        json=_payload(city="Abuja"),
    )
    # Buyer B creates 1 address (in GHA)
    await client.post(
        "/api/v1/me/addresses",
        headers=_hdr(TEST_BUYER_B),
        json=_payload(country="GHA", city="Accra", region="Greater Accra"),
    )

    list_a = (await client.get("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A))).json()
    list_b = (await client.get("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_B))).json()

    assert list_a["count"] == 2
    assert list_b["count"] == 1
    assert list_b["items"][0]["country"] == "GHA"


async def test_patch_other_user_address_returns_404(client: AsyncClient):
    """Buyer A creates addr ; Buyer B tries to PATCH it ; must 404 (not 403,
    no information leak between cases per privacy guard)."""
    create = await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload()
    )
    addr_id = create.json()["id"]

    r = await client.patch(
        f"/api/v1/me/addresses/{addr_id}",
        headers=_hdr(TEST_BUYER_B),
        json={"city": "Hijacked"},
    )
    assert r.status_code == 404


# ============================================================
# 4. Patch
# ============================================================
async def test_patch_address_updates_partial_fields(client: AsyncClient):
    create = await client.post(
        "/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload()
    )
    addr_id = create.json()["id"]

    r = await client.patch(
        f"/api/v1/me/addresses/{addr_id}",
        headers=_hdr(TEST_BUYER_A),
        json={"city": "Port Harcourt", "notes": "Building 3"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["city"] == "Port Harcourt"
    assert body["notes"] == "Building 3"
    # Untouched fields preserved
    assert body["region"] == "Lagos State"
    assert body["country"] == "NGA"


# ============================================================
# 5. Delete (soft) + default reassignment
# ============================================================
async def test_delete_default_promotes_another(client: AsyncClient):
    r1 = await client.post("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload())
    addr1 = r1.json()
    assert addr1["is_default"] is True

    r2 = await client.post(
        "/api/v1/me/addresses",
        headers=_hdr(TEST_BUYER_A),
        json=_payload(city="Abuja"),
    )
    addr2 = r2.json()
    assert addr2["is_default"] is False

    # Soft-delete addr1 (the default) ; addr2 should be promoted.
    d = await client.delete(
        f"/api/v1/me/addresses/{addr1['id']}", headers=_hdr(TEST_BUYER_A)
    )
    assert d.status_code == 204

    listing = (await client.get("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A))).json()
    assert listing["count"] == 1
    assert listing["items"][0]["id"] == addr2["id"]
    assert listing["items"][0]["is_default"] is True


async def test_delete_returns_404_for_unknown_id(client: AsyncClient):
    fake_id = uuid.uuid4()
    r = await client.delete(
        f"/api/v1/me/addresses/{fake_id}", headers=_hdr(TEST_BUYER_A)
    )
    assert r.status_code == 404


# ============================================================
# 6. Set-default
# ============================================================
async def test_set_default_unsets_others(client: AsyncClient):
    r1 = await client.post("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A), json=_payload())
    r2 = await client.post(
        "/api/v1/me/addresses",
        headers=_hdr(TEST_BUYER_A),
        json=_payload(city="Abuja"),
    )
    id1, id2 = r1.json()["id"], r2.json()["id"]

    # Promote id2 to default
    promote = await client.post(
        f"/api/v1/me/addresses/{id2}/set-default", headers=_hdr(TEST_BUYER_A)
    )
    assert promote.status_code == 200
    assert promote.json()["is_default"] is True

    # id1 should no longer be default
    listing = (await client.get("/api/v1/me/addresses", headers=_hdr(TEST_BUYER_A))).json()
    by_id = {item["id"]: item for item in listing["items"]}
    assert by_id[id2]["is_default"] is True
    assert by_id[id1]["is_default"] is False
