"""E2E tests for /orders endpoints — Sprint J5 Block 7."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatus
from app.models.order import Order

from tests.e2e.fixtures_data import (
    AISSA,
    CHIOMA,
    MAMADOU,
    SEED_ORDER_ONCHAIN_ID,
    SEED_SELLER_HANDLE,
)


pytestmark = pytest.mark.asyncio


async def test_get_order_by_onchain_id(client: AsyncClient):
    """GET /orders/by-onchain-id/{id} returns the seeded scenario-1 order."""
    r = await client.get(f"/api/v1/orders/by-onchain-id/{SEED_ORDER_ONCHAIN_ID}")
    assert r.status_code == 200
    data = r.json()
    assert data["onchain_order_id"] == SEED_ORDER_ONCHAIN_ID
    assert data["buyer_address"] == AISSA
    assert data["seller_address"] == CHIOMA
    assert data["total_amount_usdt"] == 70_000_000
    assert data["global_status"] == "Completed"
    assert data["item_count"] == 2
    assert data["is_cross_border"] is False
    assert len(data["items"]) == 2
    assert len(data["shipment_groups"]) == 1


async def test_get_order_404(client: AsyncClient):
    """Random UUID → 404."""
    bogus = uuid.uuid4()
    r = await client.get(f"/api/v1/orders/{bogus}")
    assert r.status_code == 404


async def test_list_orders_filter_by_seller(client: AsyncClient):
    """GET /orders?seller=CHIOMA returns the seeded scenario-1 order
    (and possibly others if the dev DB has more rows)."""
    r = await client.get(f"/api/v1/orders?seller={CHIOMA}&limit=200")
    assert r.status_code == 200
    data = r.json()
    found_ids = {o["onchain_order_id"] for o in data["items"]}
    assert SEED_ORDER_ONCHAIN_ID in found_ids


async def test_list_orders_filter_by_buyer(client: AsyncClient):
    """GET /orders?buyer=AISSA returns scenario-1 order."""
    r = await client.get(f"/api/v1/orders?buyer={AISSA}&limit=200")
    assert r.status_code == 200
    data = r.json()
    found_ids = {o["onchain_order_id"] for o in data["items"]}
    assert SEED_ORDER_ONCHAIN_ID in found_ids


async def test_list_orders_filter_by_status_completed(client: AsyncClient):
    """status=Completed returns at least the seeded order (which is Completed)."""
    r = await client.get(
        f"/api/v1/orders?seller={CHIOMA}&status=Completed&limit=200"
    )
    assert r.status_code == 200
    data = r.json()
    found_ids = {o["onchain_order_id"] for o in data["items"]}
    assert SEED_ORDER_ONCHAIN_ID in found_ids
    # Sanity: every returned order has Completed status
    assert all(o["global_status"] == "Completed" for o in data["items"])


async def test_get_order_items_endpoint(client: AsyncClient, db: AsyncSession):
    """GET /orders/{order_id}/items returns exactly 2 items in correct index order."""
    # Look up the seeded order's UUID
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    r = await client.get(f"/api/v1/orders/{order.id}/items")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    assert items[0]["item_index"] == 0
    assert items[1]["item_index"] == 1
    assert all(i["status"] == "Released" for i in items)
    assert all(i["item_price_usdt"] == 35_000_000 for i in items)


# ============================================================
# J11.5 Block 1 — buyer interface MVP API gaps
# ============================================================


async def test_list_orders_unknown_buyer_returns_empty_not_404(client: AsyncClient):
    """A wallet with zero orders returns an empty array (count=0), not 404.
    The buyer order list is the buyer's first surface — a 404 here would
    be a UX dead-end on the new /orders route (J11.5 Block 3).
    """
    unknown_buyer = "0x" + "00" * 20  # all-zeros valid hex, no orders
    r = await client.get(f"/api/v1/orders?buyer={unknown_buyer}")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["count"] == 0


async def test_list_orders_pagination_boundary(client: AsyncClient):
    """limit/offset edges : limit=1 returns at most 1 item ; offset
    beyond the count returns an empty list, not 404."""
    # Page size 1
    r = await client.get(f"/api/v1/orders?seller={CHIOMA}&limit=1&offset=0")
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 1
    assert data["offset"] == 0
    assert len(data["items"]) <= 1

    # Offset past the end : empty items, not 404
    r = await client.get(f"/api/v1/orders?seller={CHIOMA}&limit=10&offset=10000")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["count"] == 0


async def test_list_orders_address_case_insensitive(client: AsyncClient):
    """Address filter must accept both `0xABC...` and `0xabc...` and
    return the same results. Wallets entering the system from
    `window.ethereum` may surface mixed-case (EIP-55 checksum) ; the
    indexer writes lowercase so the API normalizes on read.
    """
    # Lowercase (canonical)
    r_low = await client.get(f"/api/v1/orders?buyer={AISSA}&limit=200")
    assert r_low.status_code == 200
    ids_low = sorted(o["onchain_order_id"] for o in r_low.json()["items"])

    # Uppercase prefix preserved, hex body uppercased
    aissa_upper = "0x" + AISSA[2:].upper()
    r_up = await client.get(f"/api/v1/orders?buyer={aissa_upper}&limit=200")
    assert r_up.status_code == 200
    ids_up = sorted(o["onchain_order_id"] for o in r_up.json()["items"])

    assert ids_low == ids_up
    assert SEED_ORDER_ONCHAIN_ID in ids_low


async def test_list_orders_includes_seller_handle(client: AsyncClient):
    """Buyer-side order list must expose seller_handle (CLAUDE.md
    rule 5 — never display raw 0x... in UI). The handle is derived
    via Order.seller_address → User.wallet_address →
    SellerProfile.shop_handle.
    """
    r = await client.get(f"/api/v1/orders?buyer={AISSA}&limit=200")
    assert r.status_code == 200
    items = r.json()["items"]
    seed = next(
        (o for o in items if o["onchain_order_id"] == SEED_ORDER_ONCHAIN_ID), None
    )
    assert seed is not None, "seeded order missing from buyer list"
    assert seed["seller_address"] == CHIOMA
    assert seed["seller_handle"] == SEED_SELLER_HANDLE


# ============================================================
# J11.5 Block 2 — privacy guard on detail endpoint (ADR-043)
# ============================================================


async def test_get_order_without_caller_succeeds_v1_casual_filter(
    client: AsyncClient, db: AsyncSession
):
    """ADR-043 casual privacy : caller is OPTIONAL at V1. Endpoint
    remains readable without the filter (backwards compat for seller
    dashboard + other consumers). Buyer interface (J11.5 Block 4)
    will pass caller systematically.
    """
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    r = await client.get(f"/api/v1/orders/{order.id}")
    assert r.status_code == 200
    assert r.json()["onchain_order_id"] == SEED_ORDER_ONCHAIN_ID


async def test_get_order_with_buyer_caller_succeeds(
    client: AsyncClient, db: AsyncSession
):
    """Caller == buyer → 200 with full detail."""
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    r = await client.get(f"/api/v1/orders/{order.id}?caller={AISSA}")
    assert r.status_code == 200
    data = r.json()
    assert data["buyer_address"] == AISSA
    assert data["seller_address"] == CHIOMA


async def test_get_order_with_seller_caller_succeeds(
    client: AsyncClient, db: AsyncSession
):
    """Caller == seller → 200 (the seller dashboard reads the same
    detail endpoint to surface buyer order state)."""
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    r = await client.get(f"/api/v1/orders/{order.id}?caller={CHIOMA}")
    assert r.status_code == 200
    assert r.json()["seller_handle"] == SEED_SELLER_HANDLE


async def test_get_order_with_wrong_caller_returns_404_not_403(
    client: AsyncClient, db: AsyncSession
):
    """ADR-043 — unauthorized caller returns 404 (NOT 403). 403 would
    leak whether the order_id exists, enabling enumeration. 404
    presents identical surface to "order doesn't exist".
    """
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    r = await client.get(f"/api/v1/orders/{order.id}?caller={MAMADOU}")
    assert r.status_code == 404
    # Body matches the "order not found" shape used elsewhere — no
    # discriminating field that would let an attacker tell apart
    # "doesn't exist" vs "exists but not yours".
    assert r.json() == {"detail": "Order not found"}


async def test_get_order_caller_case_insensitive(
    client: AsyncClient, db: AsyncSession
):
    """Mixed-case (EIP-55 checksum) caller addresses must succeed —
    `window.ethereum` may surface them. The privacy filter normalizes
    lowercase before comparison.
    """
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
    )
    order = result.scalar_one()

    aissa_upper = "0x" + AISSA[2:].upper()
    r = await client.get(f"/api/v1/orders/{order.id}?caller={aissa_upper}")
    assert r.status_code == 200


async def test_get_order_by_onchain_id_with_wrong_caller_returns_404(
    client: AsyncClient,
):
    """The /by-onchain-id/ variant carries the same privacy guard.
    Block 2 applies the filter to both lookup keys for symmetry.
    """
    r = await client.get(
        f"/api/v1/orders/by-onchain-id/{SEED_ORDER_ONCHAIN_ID}?caller={MAMADOU}"
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Order not found"}


async def test_get_order_by_onchain_id_with_correct_caller_succeeds(
    client: AsyncClient,
):
    """The /by-onchain-id/ variant accepts buyer caller too."""
    r = await client.get(
        f"/api/v1/orders/by-onchain-id/{SEED_ORDER_ONCHAIN_ID}?caller={AISSA}"
    )
    assert r.status_code == 200
    assert r.json()["onchain_order_id"] == SEED_ORDER_ONCHAIN_ID
