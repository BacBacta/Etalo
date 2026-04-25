"""E2E tests for authenticated POST endpoints — Sprint J5 Block 7.

Strategy: the seeded order has buyer=AISSA / seller=CHIOMA, neither
of which we have private keys for in tests. Instead, we create a
test-controlled order whose buyer == TEST_ADDRESS, then POST metadata
as that address. This exercises the full auth flow including
buyer-or-seller authorization.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatus
from app.models.order import Order

from tests.e2e.fixtures_data import (
    AUTH_TEST_ORDER_ONCHAIN_ID,
    CHIOMA,
    TEST_ADDRESS,
)


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def auth_test_order(db: AsyncSession):
    """Insert an order whose buyer is the TEST_ADDRESS so we can sign
    valid auth requests on its behalf. Cleanup at teardown."""
    # Cleanup any lingering row from a prior failed run
    await db.execute(
        delete(Order).where(Order.onchain_order_id == AUTH_TEST_ORDER_ONCHAIN_ID)
    )
    await db.commit()

    order = Order(
        onchain_order_id=AUTH_TEST_ORDER_ONCHAIN_ID,
        buyer_address=TEST_ADDRESS,
        seller_address=CHIOMA,
        total_amount_usdt=42_000_000,
        total_commission_usdt=756_000,
        is_cross_border=False,
        global_status=OrderStatus.FUNDED,
        item_count=1,
        funded_at=datetime.now(timezone.utc),
        created_at_chain=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    yield order

    # Teardown
    await db.execute(
        delete(Order).where(Order.onchain_order_id == AUTH_TEST_ORDER_ONCHAIN_ID)
    )
    await db.commit()


async def test_post_metadata_with_valid_signature_succeeds(
    client: AsyncClient,
    test_signer,
    auth_test_order: Order,
):
    """Buyer signs the canonical message → metadata accepted."""
    _, sign = test_signer
    path = f"/api/v1/orders/{auth_test_order.id}/metadata"
    headers = sign("POST", path)
    body = {"delivery_address": "12 Rue Test, Paris", "tracking_number": "DHL-TEST-42"}

    r = await client.post(path, json=body, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["delivery_address"] == "12 Rue Test, Paris"
    assert data["tracking_number"] == "DHL-TEST-42"


async def test_post_metadata_without_signature_returns_422(
    client: AsyncClient,
    auth_test_order: Order,
):
    """No headers at all → 422 (missing required headers)."""
    path = f"/api/v1/orders/{auth_test_order.id}/metadata"
    r = await client.post(path, json={"notes": "no auth"})
    assert r.status_code == 422  # missing required headers


async def test_post_metadata_with_malformed_signature_returns_401(
    client: AsyncClient,
    auth_test_order: Order,
):
    """Bogus signature header → 401."""
    path = f"/api/v1/orders/{auth_test_order.id}/metadata"
    headers = {
        "X-Etalo-Signature": "0xdeadbeef",
        "X-Etalo-Timestamp": "9999999999",  # also future-dated
    }
    r = await client.post(path, json={"notes": "nope"}, headers=headers)
    assert r.status_code == 401


async def test_post_metadata_address_mismatch_returns_403(
    client: AsyncClient,
    test_signer,
    db: AsyncSession,
):
    """Test wallet signs valid sig but is NOT the buyer/seller of the
    seeded scenario-1 order (AISSA/CHIOMA) → 403 Forbidden."""
    from tests.e2e.fixtures_data import SEED_ORDER_ONCHAIN_ID

    order = (
        await db.execute(
            select(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
        )
    ).scalar_one()

    _, sign = test_signer
    path = f"/api/v1/orders/{order.id}/metadata"
    headers = sign("POST", path)
    r = await client.post(
        path, json={"notes": "intruder"}, headers=headers
    )
    assert r.status_code == 403
