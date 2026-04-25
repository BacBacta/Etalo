"""E2E tests for /orders endpoints — Sprint J5 Block 7."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatus
from app.models.order import Order

from tests.e2e.fixtures_data import AISSA, CHIOMA, SEED_ORDER_ONCHAIN_ID


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
