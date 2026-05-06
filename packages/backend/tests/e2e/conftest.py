"""E2E test fixtures — Sprint J5 Block 7.

Strategy:
- TestClient against FastAPI app with `indexer_enabled=False` so the
  background poller doesn't mutate state during tests.
- AsyncSession from the live dev DB (postgresql+psycopg). Each test
  receives a fresh session; mutations roll back via explicit cleanup
  or use unique records to avoid cross-test pollution.
- Session-scope `seed_j4_data` fixture inserts a predictable set of
  rows mirroring known J4 smoke outcomes (Order 1 from scenario 1,
  Stake CHIOMA orphan ADR-033, Reputation CHIOMA snapshot, etc.).
  Runs once per pytest session; rolls back at end.
- `test_signer` fixture wraps a test private key (NOT real funds)
  and produces (signature, timestamp) tuples for the EIP-191 auth
  on POST endpoints.

Run E2E only:
    pytest tests/e2e -v -m e2e

Run unit-only (default CI skip e2e):
    pytest -m "not e2e"
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from collections.abc import AsyncGenerator, Callable
from datetime import datetime, timezone

# Windows asyncio event loop fix BEFORE any sqlalchemy/psycopg async import.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import pytest_asyncio
from eth_account import Account
from eth_account.messages import encode_defunct
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_session_factory
from app.models.dispute import Dispute
from app.models.enums import (
    DisputeLevel,
    ItemStatus,
    OrderStatus,
    SellerStatus,
    ShipmentStatus,
    StakeTier,
)
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.reputation_cache import ReputationCache
from app.models.seller_profile import SellerProfile
from app.models.shipment_group import ShipmentGroup
from app.models.stake import Stake
from app.models.user import User
from tests.e2e.fixtures_data import (
    AISSA,
    CHIOMA,
    MAMADOU,
    SEED_DISPUTE_ONCHAIN_ID,
    SEED_GROUP_ONCHAIN_ID,
    SEED_ITEM_ONCHAIN_ID,
    SEED_ORDER_ONCHAIN_ID,
    SEED_SELLER_HANDLE,
    SEED_SELLER_SHOP_NAME,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
)


# Disable the background indexer for the entire E2E test session.
# Override BEFORE the FastAPI app loads its lifespan.
settings.indexer_enabled = False

from app.main import app  # noqa: E402 — must come after settings override


# Constants imported from fixtures_data — defined there so tests can
# import them via `from tests.e2e.fixtures_data import ...` without
# touching pytest fixtures.


# ============================================================
# Markers — set @pytest.mark.e2e on all tests in this module
# ============================================================
def pytest_collection_modifyitems(config, items):  # noqa: ARG001
    e2e_marker = pytest.mark.e2e
    for item in items:
        # Auto-mark every test in tests/e2e/
        if "tests/e2e" in str(item.fspath).replace("\\", "/"):
            item.add_marker(e2e_marker)


# ============================================================
# Async DB session
# ============================================================
@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()


# ============================================================
# Seed data — session-scope, inserted once and cleaned up at end
# ============================================================
@pytest_asyncio.fixture(scope="session")
async def _event_loop():
    """Pytest-asyncio session-scope async fixtures need an explicit loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def seed_j4_data():
    """Insert canonical J4 outcomes once per session, clean up at end.

    The data mirrors what the live indexer WOULD produce after a full
    sync, so endpoint tests don't depend on indexer catchup time.
    """
    factory = get_async_session_factory()

    async with factory() as session:
        # --- Cleanup any prior seed data (idempotent across reruns) ---
        await session.execute(
            delete(Dispute).where(Dispute.onchain_dispute_id == SEED_DISPUTE_ONCHAIN_ID)
        )
        await session.execute(
            delete(OrderItem).where(OrderItem.onchain_item_id == SEED_ITEM_ONCHAIN_ID)
        )
        await session.execute(
            delete(ShipmentGroup).where(
                ShipmentGroup.onchain_group_id == SEED_GROUP_ONCHAIN_ID
            )
        )
        await session.execute(
            delete(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
        )
        # CHIOMA stake/rep are read-only references; use UPSERT-style
        await session.execute(delete(Stake).where(Stake.seller_address == CHIOMA))
        await session.execute(
            delete(ReputationCache).where(ReputationCache.seller_address == CHIOMA)
        )
        # CHIOMA seller profile + user — J11.5 Block 1, idempotent across reruns.
        # SellerProfile FK → User, so delete profile first then user.
        await session.execute(
            delete(SellerProfile).where(SellerProfile.shop_handle == SEED_SELLER_HANDLE)
        )
        await session.execute(delete(User).where(User.wallet_address == CHIOMA))

        await session.commit()

    # --- Insert seed ---
    async with factory() as session:
        # CHIOMA's onboarded User + SellerProfile — J11.5 Block 1.
        # Lets /orders endpoints expose seller_handle without leaking
        # raw 0x in UI (CLAUDE.md rule 5). Mirrors what the onboarding
        # flow would produce.
        chioma_user = User(
            id=uuid.uuid4(),
            wallet_address=CHIOMA,
            country="NGA",
        )
        session.add(chioma_user)
        await session.flush()

        chioma_seller = SellerProfile(
            id=uuid.uuid4(),
            user_id=chioma_user.id,
            shop_handle=SEED_SELLER_HANDLE,
            shop_name=SEED_SELLER_SHOP_NAME,
        )
        session.add(chioma_seller)
        await session.flush()

        order = Order(
            onchain_order_id=SEED_ORDER_ONCHAIN_ID,
            buyer_address=AISSA,
            seller_address=CHIOMA,
            total_amount_usdt=70_000_000,  # 70 USDT (J4 scenario 1)
            total_commission_usdt=1_260_000,  # 1.8% intra
            is_cross_border=False,
            global_status=OrderStatus.COMPLETED,
            item_count=2,
            funded_at=datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc),
            created_at_chain=datetime(2026, 4, 24, 11, 59, 0, tzinfo=timezone.utc),
        )
        session.add(order)
        await session.flush()

        group = ShipmentGroup(
            onchain_group_id=SEED_GROUP_ONCHAIN_ID,
            order_id=order.id,
            status=ShipmentStatus.SHIPPED,
            release_stage=0,
            shipped_at=datetime(2026, 4, 24, 13, 0, 0, tzinfo=timezone.utc),
        )
        session.add(group)
        await session.flush()

        item1 = OrderItem(
            onchain_item_id=SEED_ITEM_ONCHAIN_ID,
            order_id=order.id,
            item_index=0,
            item_price_usdt=35_000_000,
            item_commission_usdt=630_000,
            status=ItemStatus.RELEASED,
            shipment_group_id=group.id,
            released_amount_usdt=34_370_000,  # net after 1.8% comm
        )
        item2 = OrderItem(
            onchain_item_id=SEED_ITEM_ONCHAIN_ID + 1,
            order_id=order.id,
            item_index=1,
            item_price_usdt=35_000_000,
            item_commission_usdt=630_000,
            status=ItemStatus.RELEASED,
            shipment_group_id=group.id,
            released_amount_usdt=34_370_000,
        )
        session.add_all([item1, item2])
        await session.flush()  # ensure item2.id is populated for Dispute FK

        # CHIOMA: ADR-033 orphan stake (post-J4-scenario-4)
        chioma_stake = Stake(
            seller_address=CHIOMA,
            tier=StakeTier.NONE,
            amount_usdt=5_000_000,  # 5 USDT residual after slash
            active_sales=0,
            freeze_count=0,
            last_synced_at=datetime.now(timezone.utc),
        )
        session.add(chioma_stake)

        chioma_rep = ReputationCache(
            seller_address=CHIOMA,
            orders_completed=11,
            orders_disputed=3,
            disputes_lost=3,
            total_volume_usdt=500_000_000,
            score=44,
            is_top_seller=False,
            status=SellerStatus.ACTIVE,
            last_sanction_at=None,
            first_order_at=datetime(2026, 4, 24, 18, 41, 9, tzinfo=timezone.utc),
            last_synced_at=datetime.now(timezone.utc),
        )
        session.add(chioma_rep)

        # Dispute on item2 — N1 amicable resolved with refund 15 USDT (scenario 3)
        dispute = Dispute(
            onchain_dispute_id=SEED_DISPUTE_ONCHAIN_ID,
            order_id=order.id,
            order_item_id=item2.id,
            buyer_address=AISSA,
            seller_address=CHIOMA,
            level=DisputeLevel.RESOLVED,
            refund_amount_usdt=15_000_000,
            slash_amount_usdt=0,
            favor_buyer=True,
            resolved=True,
            reason="Item damaged in transit",
            opened_at=datetime(2026, 4, 24, 14, 0, 0, tzinfo=timezone.utc),
            n1_deadline=datetime(2026, 4, 26, 14, 0, 0, tzinfo=timezone.utc),
            resolved_at=datetime(2026, 4, 24, 14, 30, 0, tzinfo=timezone.utc),
            buyer_proposal_amount_usdt=15_000_000,
            seller_proposal_amount_usdt=15_000_000,
        )
        session.add(dispute)

        await session.commit()

    yield  # tests run here

    # --- Cleanup (idempotent) ---
    async with factory() as session:
        await session.execute(
            delete(Dispute).where(Dispute.onchain_dispute_id == SEED_DISPUTE_ONCHAIN_ID)
        )
        await session.execute(
            delete(OrderItem).where(
                OrderItem.onchain_item_id.in_(
                    [SEED_ITEM_ONCHAIN_ID, SEED_ITEM_ONCHAIN_ID + 1]
                )
            )
        )
        await session.execute(
            delete(ShipmentGroup).where(
                ShipmentGroup.onchain_group_id == SEED_GROUP_ONCHAIN_ID
            )
        )
        await session.execute(
            delete(Order).where(Order.onchain_order_id == SEED_ORDER_ONCHAIN_ID)
        )
        await session.execute(delete(Stake).where(Stake.seller_address == CHIOMA))
        await session.execute(
            delete(ReputationCache).where(ReputationCache.seller_address == CHIOMA)
        )
        # SellerProfile FK → User : delete profile first, then user.
        await session.execute(
            delete(SellerProfile).where(SellerProfile.shop_handle == SEED_SELLER_HANDLE)
        )
        await session.execute(delete(User).where(User.wallet_address == CHIOMA))
        await session.commit()


# ============================================================
# TestClient (httpx AsyncClient against FastAPI)
#
# ASGITransport does NOT trigger FastAPI lifespan, so app.state is
# empty by default. We attach the CeloService manually here, mirroring
# what the real lifespan does. The indexer is intentionally not
# launched (settings.indexer_enabled = False at module top).
# ============================================================
@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from app.services.celo import CeloService

    if not getattr(app.state, "celo_service", None):
        app.state.celo_service = CeloService.from_settings()

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as ac:
        yield ac


# ============================================================
# Signer fixture — returns (address, sign_callable)
# ============================================================
@pytest.fixture
def test_signer() -> tuple[str, Callable[[str, str], dict[str, str]]]:
    """Return (test_address, sign(method, path) → headers dict)."""

    def sign(method: str, path: str) -> dict[str, str]:
        ts = int(time.time())
        msg = f"Etalo auth: {method.upper()} {path} {ts}"
        encoded = encode_defunct(text=msg)
        signed = Account.sign_message(encoded, private_key=TEST_PRIVATE_KEY)
        sig = signed.signature.hex()
        if not sig.startswith("0x"):
            sig = "0x" + sig
        return {
            "X-Etalo-Signature": sig,
            "X-Etalo-Timestamp": str(ts),
        }

    return TEST_ADDRESS, sign
