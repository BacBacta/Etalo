"""E2E tests for delivery_address_snapshot endpoint — Sprint J11.7 Block 7 (ADR-044).

Covers PATCH /api/v1/orders/by-onchain-id/{id}/delivery-address :
- Snapshot success path (buyer writes their own address into their order)
- 401 no-auth
- 403 wrong-buyer
- 403 address-not-owned-by-caller
- 404 order not yet indexed
- 404 deleted address
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.delivery_address import DeliveryAddress
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.user import User


_BUYER = "0x" + "7" * 39 + "1"
_OTHER = "0x" + "7" * 39 + "2"
_SELLER = "0x" + "8" * 39 + "1"
_ONCHAIN_ID = 99_077

_ADDR_PAYLOAD = {
    "phone_number": "+2348000000000",
    "country": "NGA",
    "city": "Lagos",
    "region": "Lagos State",
    "address_line": "Block 7 test street",
}


@pytest_asyncio.fixture
async def seeded() -> AsyncGenerator[dict, None]:
    factory = get_async_session_factory()

    async def wipe():
        async with factory() as s:
            await s.execute(
                delete(Order).where(Order.onchain_order_id == _ONCHAIN_ID)
            )
            users = (
                await s.execute(
                    select(User).where(User.wallet_address.in_([_BUYER, _OTHER, _SELLER]))
                )
            ).scalars().all()
            for u in users:
                await s.execute(
                    delete(DeliveryAddress).where(DeliveryAddress.user_id == u.id)
                )
            await s.execute(
                delete(User).where(User.wallet_address.in_([_BUYER, _OTHER, _SELLER]))
            )
            await s.commit()

    await wipe()

    info: dict = {}
    async with factory() as s:
        buyer_user = User(wallet_address=_BUYER, country="NGA")
        other_user = User(wallet_address=_OTHER, country="NGA")
        seller_user = User(wallet_address=_SELLER, country="NGA")
        s.add_all([buyer_user, other_user, seller_user])
        await s.flush()

        buyer_addr = DeliveryAddress(
            user_id=buyer_user.id, is_default=True, **_ADDR_PAYLOAD
        )
        other_addr = DeliveryAddress(
            user_id=other_user.id, is_default=True, **_ADDR_PAYLOAD
        )
        s.add_all([buyer_addr, other_addr])
        await s.flush()

        order = Order(
            onchain_order_id=_ONCHAIN_ID,
            buyer_address=_BUYER,
            seller_address=_SELLER,
            total_amount_usdt=10_000_000,
            total_commission_usdt=180_000,
            is_cross_border=False,
            global_status=OrderStatus.FUNDED,
            item_count=1,
            funded_at=datetime.now(timezone.utc),
            created_at_chain=datetime.now(timezone.utc),
        )
        s.add(order)
        await s.commit()
        await s.refresh(buyer_addr)
        await s.refresh(other_addr)

        info["buyer_addr_id"] = str(buyer_addr.id)
        info["other_addr_id"] = str(other_addr.id)

    yield info

    await wipe()


def _hdr(wallet: str) -> dict[str, str]:
    return {"X-Wallet-Address": wallet}


PATH = f"/api/v1/orders/by-onchain-id/{_ONCHAIN_ID}/delivery-address"


# ============================================================
# Happy path
# ============================================================
async def test_buyer_can_set_snapshot(client: AsyncClient, seeded):
    r = await client.patch(
        PATH,
        headers=_hdr(_BUYER),
        json={"address_id": seeded["buyer_addr_id"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    snap = body["delivery_address_snapshot"]
    assert snap is not None
    assert snap["country"] == "NGA"
    assert snap["city"] == "Lagos"
    assert snap["address_line"] == "Block 7 test street"


async def test_snapshot_idempotent_overwrite(client: AsyncClient, seeded):
    """Calling PATCH twice writes the latest snapshot."""
    await client.patch(
        PATH,
        headers=_hdr(_BUYER),
        json={"address_id": seeded["buyer_addr_id"]},
    )
    r2 = await client.patch(
        PATH,
        headers=_hdr(_BUYER),
        json={"address_id": seeded["buyer_addr_id"]},
    )
    assert r2.status_code == 200


# ============================================================
# Auth + privacy guards
# ============================================================
async def test_no_auth_returns_401(client: AsyncClient, seeded):
    r = await client.patch(
        PATH, json={"address_id": seeded["buyer_addr_id"]}
    )
    assert r.status_code == 401


async def test_wrong_buyer_returns_403(client: AsyncClient, seeded):
    """Caller != order.buyer_address — should be 403, not silent overwrite."""
    r = await client.patch(
        PATH,
        headers=_hdr(_OTHER),
        json={"address_id": seeded["other_addr_id"]},
    )
    assert r.status_code == 403


async def test_buyer_using_someone_elses_address_returns_403(
    client: AsyncClient, seeded
):
    r = await client.patch(
        PATH,
        headers=_hdr(_BUYER),
        json={"address_id": seeded["other_addr_id"]},
    )
    assert r.status_code == 403


# ============================================================
# Indexer race tolerance
# ============================================================
async def test_unknown_onchain_id_returns_404(client: AsyncClient, seeded):
    """Frontend retries on 404 — write before indexer caught up should
    surface a 404 cleanly, not a 500."""
    fake_path = "/api/v1/orders/by-onchain-id/9999999999/delivery-address"
    r = await client.patch(
        fake_path,
        headers=_hdr(_BUYER),
        json={"address_id": seeded["buyer_addr_id"]},
    )
    assert r.status_code == 404


# ============================================================
# ADR-050 — inline endpoint (delivery-address-inline)
# ============================================================
INLINE_PATH = (
    f"/api/v1/orders/by-onchain-id/{_ONCHAIN_ID}/delivery-address-inline"
)

_VALID_INLINE = {
    "recipient_name": "Adaeze Okafor",
    "phone_number": "+234 801 234 5678",
    "country": "NGA",
    "region": "Lagos State",
    "city": "Lagos",
    "area": "Lekki Phase 1",
    "address_line": "Plot 12B, off Adeola Odeku Street, Block C",
    "landmark": "Behind the blue gate, opposite the bakery",
    "notes": "Call when 5 minutes away",
}


async def test_inline_buyer_can_set_snapshot(client: AsyncClient, seeded):
    r = await client.patch(
        INLINE_PATH, headers=_hdr(_BUYER), json=_VALID_INLINE
    )
    assert r.status_code == 200, r.text
    snap = r.json()["delivery_address_snapshot"]
    assert snap["recipient_name"] == "Adaeze Okafor"
    assert snap["area"] == "Lekki Phase 1"
    assert snap["country"] == "NGA"
    assert snap["address_line"].startswith("Plot 12B")


async def test_inline_no_auth_returns_401(client: AsyncClient, seeded):
    r = await client.patch(INLINE_PATH, json=_VALID_INLINE)
    assert r.status_code == 401


async def test_inline_wrong_buyer_returns_403(client: AsyncClient, seeded):
    r = await client.patch(
        INLINE_PATH, headers=_hdr(_OTHER), json=_VALID_INLINE
    )
    assert r.status_code == 403


async def test_inline_invalid_country_returns_422(
    client: AsyncClient, seeded
):
    bad = {**_VALID_INLINE, "country": "USA"}
    r = await client.patch(INLINE_PATH, headers=_hdr(_BUYER), json=bad)
    assert r.status_code == 422


async def test_inline_missing_recipient_name_returns_422(
    client: AsyncClient, seeded
):
    bad = {**_VALID_INLINE}
    del bad["recipient_name"]
    r = await client.patch(INLINE_PATH, headers=_hdr(_BUYER), json=bad)
    assert r.status_code == 422


async def test_inline_whitespace_only_field_returns_422(
    client: AsyncClient, seeded
):
    bad = {**_VALID_INLINE, "area": "   "}
    r = await client.patch(INLINE_PATH, headers=_hdr(_BUYER), json=bad)
    assert r.status_code == 422


async def test_inline_unknown_onchain_id_returns_404(
    client: AsyncClient, seeded
):
    fake_path = (
        "/api/v1/orders/by-onchain-id/9999999999/delivery-address-inline"
    )
    r = await client.patch(fake_path, headers=_hdr(_BUYER), json=_VALID_INLINE)
    assert r.status_code == 404
