"""E2E contract tests for /api/v1/analytics/summary — Block 5 sub-block 5.2a.

The endpoint was rewritten in this sub-block to migrate every SQL query
from the V1 Order schema to V2 (Sprint J5 Block 2). These tests pin the
response contract so the V1 regression cannot reappear and so the
frontend hook (sub-block 5.3) can rely on a stable JSON shape — in
particular the Decimal-as-JSON-string serialisation.

Strategy:
- Place tests under `tests/e2e/` (NOT `tests/routers/`) because the HTTP
  client + DB fixtures + auto-applied `e2e` marker only exist here. The
  unit-style `tests/routers/test_auth.py` has no TestClient
  infrastructure, and duplicating it for one new module would be more
  cost than value.
- Build a self-contained `analytics_seed` fixture rather than reusing
  `seed_j4_data` from conftest.py: the seed Order's `created_at_chain`
  is hardcoded to 2026-04-24, which would drift in/out of the h24/d7/
  d30 buckets depending on the actual wall-clock of test execution
  (flaky). The fixture below pins all timestamps relative to
  `datetime.now(timezone.utc)` so the d7/d30 assertions are
  deterministic across machines and dates.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User


def _wallet() -> str:
    """Return a unique 42-char lowercase hex wallet for fixture isolation."""
    return ("0x" + uuid.uuid4().hex).ljust(42, "0").lower()


# Allowed values per the ReputationBlock schema. "top_seller" was dropped
# in Phase 5 Angle C sub-block C.1 (Top Seller program deferred V1.1 per
# ADR-041 ; analytics router never set the value at runtime, so the
# enum tightening to Literal["new_seller", "active", "suspended"] is
# safe without a data migration).
ALLOWED_BADGES = {"new_seller", "active", "suspended"}


# ============================================================
# Fixture — User + SellerProfile + 1 completed Order at "now - 1h"
# ============================================================
@pytest_asyncio.fixture
async def analytics_seed(db: AsyncSession) -> AsyncGenerator[dict, None]:
    """Seed a seller with one Completed order recent enough to land in
    h24 / d7 / d30 / timeline_7d. Yields the dict the tests need; cleans
    up Order + SellerProfile + User on teardown.
    """
    suffix = uuid.uuid4().hex[:8]
    handle = f"analytics-{suffix}"
    wallet = _wallet()

    user = User(id=uuid.uuid4(), wallet_address=wallet, country="NGA")
    db.add(user)
    await db.flush()

    seller = SellerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        shop_handle=handle,
        shop_name="Analytics Test Seller",
    )
    db.add(seller)
    await db.flush()

    product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        title="Analytics Test Product",
        slug=f"analytics-product-{suffix}",
        description="For analytics tests",
        price_usdt=Decimal("70.00"),
        stock=5,
        status="active",
        image_ipfs_hashes=["QmTestImageHashAnalytics"],
    )
    db.add(product)
    await db.flush()

    # Pin the order timestamp 1h before "now" so it lands in every
    # rolling bucket the contract exposes (h24, d7, d30, timeline_7d).
    # All amounts in raw 6-decimal BigInteger; 70 USDT = 70_000_000.
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    order = Order(
        id=uuid.uuid4(),
        onchain_order_id=int(uuid.uuid4().int % 10_000_000_000),
        buyer_address=_wallet(),
        seller_address=wallet,
        total_amount_usdt=70_000_000,
        total_commission_usdt=1_260_000,  # 1.8% intra (ADR-041)
        is_cross_border=False,
        global_status=OrderStatus.COMPLETED,
        item_count=1,
        product_ids=[product.id],
        funded_at=one_hour_ago,
        created_at_chain=one_hour_ago,
    )
    db.add(order)
    await db.commit()

    try:
        yield {
            "wallet": wallet,
            "seller_id": str(seller.id),
            "product_id": str(product.id),
            "order_id": str(order.id),
            "handle": handle,
        }
    finally:
        # Tear down in FK order: Order -> Product -> SellerProfile -> User.
        await db.execute(delete(Order).where(Order.id == order.id))
        await db.execute(delete(Product).where(Product.id == product.id))
        await db.execute(
            delete(SellerProfile).where(SellerProfile.id == seller.id)
        )
        await db.execute(delete(User).where(User.id == user.id))
        await db.commit()


# ============================================================
# Tests
# ============================================================
@pytest.mark.asyncio
async def test_analytics_summary_zero_state(client: AsyncClient):
    """A wallet with no User row in the off-chain DB returns the
    zeroed payload — the frontend renders empty states without any
    backend-side conditional. Critical that the response is 200 not
    404 so the dashboard never error-banners on a fresh seller.
    """
    fresh_wallet = _wallet()
    resp = await client.get(
        "/api/v1/analytics/summary",
        headers={"X-Wallet-Address": fresh_wallet},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Revenue block all-zero, timeline 7 days zero-filled.
    assert body["revenue"]["h24"] == "0"
    assert body["revenue"]["d7"] == "0"
    assert body["revenue"]["d30"] == "0"
    assert len(body["revenue"]["timeline_7d"]) == 7
    for point in body["revenue"]["timeline_7d"]:
        assert point["revenue_usdt"] == "0"

    assert body["active_orders"] == 0
    assert body["escrow"]["in_escrow"] == "0"
    assert body["escrow"]["released"] == "0"
    assert body["reputation"]["badge"] == "new_seller"
    assert body["reputation"]["score"] == 0
    assert body["reputation"]["auto_release_days"] == 3
    assert body["top_products"] == []


@pytest.mark.asyncio
async def test_analytics_summary_populated(
    client: AsyncClient, analytics_seed: dict
):
    """Seller with one Completed 70 USDT order placed 1h ago: the
    revenue rolls up into every bucket (h24/d7/d30 + today's timeline
    point), released equals 70 USDT, in_escrow stays 0 (Completed funds
    are no longer escrowed), top_products lists the seeded product.
    """
    resp = await client.get(
        "/api/v1/analytics/summary",
        headers={"X-Wallet-Address": analytics_seed["wallet"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Decimal serialisation: revenue values are JSON strings (FastAPI
    # default for Pydantic Decimal). 70 USDT raw / 10**6 = "70" with
    # default Decimal formatting (no trailing zeros).
    assert body["revenue"]["h24"] == "70"
    assert body["revenue"]["d7"] == "70"
    assert body["revenue"]["d30"] == "70"
    assert len(body["revenue"]["timeline_7d"]) == 7

    # Today's bucket carries the full revenue; older buckets are 0.
    today = datetime.now(timezone.utc).date().isoformat()
    today_point = next(
        p for p in body["revenue"]["timeline_7d"] if p["date"] == today
    )
    assert today_point["revenue_usdt"] == "70"

    # Completed orders are NOT active and NOT escrowed.
    assert body["active_orders"] == 0
    assert body["escrow"]["in_escrow"] == "0"
    assert body["escrow"]["released"] == "70"

    # Top products: 1 entry referencing the seeded product.
    assert len(body["top_products"]) == 1
    top = body["top_products"][0]
    assert top["product_id"] == analytics_seed["product_id"]
    assert top["title"] == "Analytics Test Product"
    assert top["revenue_usdt"] == "70"
    assert top["image_ipfs_hash"] == "QmTestImageHashAnalytics"


@pytest.mark.asyncio
async def test_analytics_summary_decimal_serialization(
    client: AsyncClient, analytics_seed: dict
):
    """Every Decimal field on the contract MUST serialise as a JSON
    string (never number, never null). The frontend's TanStack Query
    selector (sub-block 5.3) parses these strings via parseFloat — if
    the contract ever flips to JSON number we'd silently lose precision
    on amounts > 2^53 / 10^6 USDT (~9 quadrillion, irrelevant in
    practice but the type contract is still load-bearing for the
    selector).
    """
    resp = await client.get(
        "/api/v1/analytics/summary",
        headers={"X-Wallet-Address": analytics_seed["wallet"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    decimal_paths: list[tuple[str, object]] = [
        ("revenue.h24", body["revenue"]["h24"]),
        ("revenue.d7", body["revenue"]["d7"]),
        ("revenue.d30", body["revenue"]["d30"]),
        ("escrow.in_escrow", body["escrow"]["in_escrow"]),
        ("escrow.released", body["escrow"]["released"]),
    ]
    for path, value in decimal_paths:
        assert isinstance(value, str), f"{path} must be JSON string, got {type(value).__name__}: {value!r}"

    for i, point in enumerate(body["revenue"]["timeline_7d"]):
        assert isinstance(
            point["revenue_usdt"], str
        ), f"timeline_7d[{i}].revenue_usdt must be JSON string"

    for i, p in enumerate(body["top_products"]):
        assert isinstance(
            p["revenue_usdt"], str
        ), f"top_products[{i}].revenue_usdt must be JSON string"


@pytest.mark.asyncio
async def test_analytics_summary_badge_enum(client: AsyncClient):
    """Contract pin on the ReputationBlock.badge enum. Post-Phase 5
    Angle C sub-block C.1 the badge field is a Pydantic Literal of
    {"new_seller", "active", "suspended"} (Top Seller deferred V1.1 per
    ADR-041). Any drift from this set means the schema or the router's
    badge computation needs investigation.
    """
    fresh_wallet = _wallet()
    resp = await client.get(
        "/api/v1/analytics/summary",
        headers={"X-Wallet-Address": fresh_wallet},
    )
    assert resp.status_code == 200
    badge = resp.json()["reputation"]["badge"]
    assert badge in ALLOWED_BADGES, (
        f"badge {badge!r} not in current allow-list {ALLOWED_BADGES}"
    )


@pytest.mark.asyncio
async def test_analytics_summary_auth_required(client: AsyncClient):
    """X-Wallet-Address header is mandatory in dev-mode auth (per
    routers/sellers.get_current_wallet). Missing header → 401 with a
    descriptive detail; the frontend gates the request via
    useWalletHeaders so this branch should be unreachable in practice,
    but the contract pin protects the contract.
    """
    resp = await client.get("/api/v1/analytics/summary")
    assert resp.status_code == 401, resp.text
    detail = resp.json().get("detail", "")
    assert "X-Wallet-Address" in detail or "header" in detail.lower()
