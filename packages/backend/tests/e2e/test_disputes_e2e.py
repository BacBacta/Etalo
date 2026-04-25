"""E2E tests for /disputes endpoints — Sprint J5 Block 7."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dispute import Dispute
from app.models.order import Order
from app.models.order_item import OrderItem

from tests.e2e.fixtures_data import (
    AISSA,
    CHIOMA,
    SEED_DISPUTE_ONCHAIN_ID,
    SEED_ORDER_ONCHAIN_ID,
)


pytestmark = pytest.mark.asyncio


async def test_get_dispute_by_onchain_id(client: AsyncClient):
    """GET /disputes/by-onchain-id/{id} returns seeded N1-amicable dispute."""
    r = await client.get(
        f"/api/v1/disputes/by-onchain-id/{SEED_DISPUTE_ONCHAIN_ID}"
    )
    assert r.status_code == 200
    data = r.json()
    assert data["onchain_dispute_id"] == SEED_DISPUTE_ONCHAIN_ID
    assert data["buyer_address"] == AISSA
    assert data["seller_address"] == CHIOMA
    assert data["level"] == "Resolved"
    assert data["resolved"] is True
    assert data["favor_buyer"] is True
    assert data["refund_amount_usdt"] == 15_000_000
    assert data["slash_amount_usdt"] == 0
    assert data["buyer_proposal_amount_usdt"] == 15_000_000
    assert data["seller_proposal_amount_usdt"] == 15_000_000


async def test_get_dispute_by_item(client: AsyncClient, db: AsyncSession):
    """GET /disputes/by-item?order_id=&item_id= finds the dispute."""
    order = (
        await db.execute(
            select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
        )
    ).scalar_one()
    # The seeded dispute targets item_index=1
    item = (
        await db.execute(
            select(OrderItem).where(
                (OrderItem.order_id == order.id) & (OrderItem.item_index == 1)
            )
        )
    ).scalar_one()

    r = await client.get(
        f"/api/v1/disputes/by-item?order_id={order.id}&item_id={item.id}"
    )
    assert r.status_code == 200
    data = r.json()
    assert data["onchain_dispute_id"] == SEED_DISPUTE_ONCHAIN_ID


async def test_get_dispute_404(client: AsyncClient):
    bogus = uuid.uuid4()
    r = await client.get(f"/api/v1/disputes/{bogus}")
    assert r.status_code == 404
