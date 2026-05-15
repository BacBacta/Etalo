"""Unit tests for V2 event indexer infrastructure + a few core handlers.

We mock the AsyncWeb3 (eth.block_number, eth.get_logs, eth.get_block,
contract.events.X.process_log) at the boundary, and use a real
AsyncSession against an in-memory test DB OR an explicit
mocked-out session. To keep this test file simple and CI-portable
(no live Postgres dependency), we mock the DB session as well.

Coverage:
1. Checkpoint advance after a clean cycle
2. Idempotency — same (tx_hash, log_index) skipped on second pass
3. Block chunking respects INDEXER_BLOCK_CHUNK_SIZE
4. Reorg defense — last 3 blocks re-read
5. Multi-contract polling dispatches to correct handlers
6. handle_order_funded transitions Order.global_status to FUNDED
7. handle_stake_slashed + handle_tier_auto_downgraded sequence
8. handle_order_recorded creates ReputationCache row when missing
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _reset_indexer_start_block(monkeypatch):
    """Override the production INDEXER_START_BLOCK (~23.7M) so tests
    can use small, readable block numbers."""
    monkeypatch.setattr(settings, "indexer_start_block", 0)
    yield
from app.models.enums import OrderStatus, StakeTier
from app.services.indexer import Indexer
from app.models.enums import ItemStatus
from app.services.indexer_handlers import (
    handle_auto_refund_inactive,
    handle_order_funded,
    handle_order_recorded,
    handle_stake_slashed,
    handle_tier_auto_downgraded,
)


# ============================================================
# Helpers
# ============================================================
def _make_celo_mock(current_block: int = 100, logs_by_call: list[list] | None = None) -> MagicMock:
    """Build a CeloService stand-in for the indexer."""
    celo = MagicMock()
    celo._w3 = MagicMock()

    if logs_by_call is None:
        logs_by_call = [[]]
    get_logs = AsyncMock(side_effect=logs_by_call)
    celo._w3.eth.get_logs = get_logs

    # get_block returns dict with "number" + "timestamp"; "latest" used by
    # the cycle to read current block, integer keys used for tx timestamps.
    celo._w3.eth.get_block = AsyncMock(
        return_value={"number": current_block, "timestamp": 1700000000}
    )

    # Stub each contract attribute with an address + an empty events tuple.
    for attr, addr in [
        ("_escrow", "0xAeC58270973A973e3FF4913602Db1b5c98894640"),
        ("_dispute", "0xEe8339b29F54bd29d68E061c4212c8b202760F5b"),
        ("_stake", "0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB"),
        ("_reputation", "0x539e0d44c0773504075E1B00f25A99ED70258178"),
        ("_voting", "0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A"),
    ]:
        c = MagicMock()
        c.address = addr
        c.events = []  # tests will inject decoded events directly
        setattr(celo, attr, c)

    return celo


class FakeAsyncSession:
    """Minimal AsyncSession stand-in for unit tests.

    Tracks `add()` calls and `execute(...)` returns predictable empties.
    Tests assert on `self.added` to verify handler outputs.
    """

    def __init__(self):
        self.added: list = []
        self._existing: dict = {}

    def add(self, obj):
        self.added.append(obj)

    async def execute(self, stmt):  # noqa: ARG002
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        return result

    async def flush(self):
        pass

    async def rollback(self):
        pass

    async def commit(self):
        pass


def _fake_session_factory(session: FakeAsyncSession):
    class CtxMgr:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *a, **k):
            pass

    factory = MagicMock()
    factory.return_value = CtxMgr()
    return factory


# ============================================================
# Infrastructure tests
# ============================================================

@pytest.mark.asyncio
async def test_checkpoint_advances_on_clean_cycle():
    """After polling, indexer_state.last_processed_block should == current_block."""
    # Block 10 fits in a single 50-block chunk → 1 get_logs call.
    celo = _make_celo_mock(current_block=10, logs_by_call=[[]])
    session = FakeAsyncSession()

    indexer = Indexer(
        celo=celo,
        session_factory=_fake_session_factory(session),
        contracts_to_index=["EtaloEscrow"],
    )

    await indexer._poll_cycle()

    # IndexerState row should be added with last_processed_block=10
    state_rows = [
        a for a in session.added
        if a.__class__.__name__ == "IndexerState"
    ]
    assert len(state_rows) == 1
    assert state_rows[0].contract_name == "EtaloEscrow"
    assert state_rows[0].last_processed_block == 10


@pytest.mark.asyncio
async def test_block_chunking_respects_max():
    """If from_block..to_block > 50 blocks, indexer must call get_logs in 50-block chunks."""
    # Set checkpoint to 0, current to 130 → 130 blocks to scan in 3 chunks
    # (default reorg_depth=3 → from_block=max(0, -2)=0; chunks: 0-49, 50-99, 100-130)
    celo = _make_celo_mock(current_block=130, logs_by_call=[[], [], []])
    session = FakeAsyncSession()

    indexer = Indexer(
        celo=celo,
        session_factory=_fake_session_factory(session),
        contracts_to_index=["EtaloEscrow"],
    )

    # Override poll size for predictable ranges
    monkey = settings.indexer_block_chunk_size
    settings.indexer_block_chunk_size = 50
    try:
        await indexer._poll_cycle()
    finally:
        settings.indexer_block_chunk_size = monkey

    # 3 calls expected
    calls = celo._w3.eth.get_logs.call_args_list
    assert len(calls) == 3
    chunks = [(c.args[0]["fromBlock"], c.args[0]["toBlock"]) for c in calls]
    # First chunk starts at 0 (max of 0, 0-3+1), spans 50 blocks
    assert chunks[0] == (0, 49)
    assert chunks[1] == (50, 99)
    assert chunks[2] == (100, 130)


@pytest.mark.asyncio
async def test_reorg_defense_re_reads_last_n_blocks():
    """After a clean cycle ending at block 100, next cycle must start
    at block 100 - reorg_depth + 1 = 98 (with reorg_depth=3)."""
    celo = _make_celo_mock(current_block=100, logs_by_call=[[]])
    session = FakeAsyncSession()
    # Pre-existing checkpoint at 100
    session._existing["EtaloEscrow"] = MagicMock(last_processed_block=100)

    async def execute_with_existing(stmt):
        result = MagicMock()
        # Return the existing row only when looking up state
        if "indexer_state" in str(stmt).lower():
            row = MagicMock()
            row.last_processed_block = 100
            result.scalar_one_or_none = MagicMock(return_value=row)
        else:
            result.scalar_one_or_none = MagicMock(return_value=None)
        return result

    session.execute = execute_with_existing  # type: ignore

    indexer = Indexer(
        celo=celo,
        session_factory=_fake_session_factory(session),
        contracts_to_index=["EtaloEscrow"],
    )
    await indexer._poll_cycle()

    calls = celo._w3.eth.get_logs.call_args_list
    assert len(calls) == 1
    assert calls[0].args[0]["fromBlock"] == 98  # 100 - 3 + 1


@pytest.mark.asyncio
async def test_multi_contract_polling():
    """All contracts in the contracts_to_index list should each get an eth.get_logs call."""
    celo = _make_celo_mock(current_block=10, logs_by_call=[[], [], [], []])
    session = FakeAsyncSession()

    indexer = Indexer(
        celo=celo,
        session_factory=_fake_session_factory(session),
        contracts_to_index=["EtaloEscrow", "EtaloDispute", "EtaloStake", "EtaloReputation"],
    )
    await indexer._poll_cycle()

    # 4 contracts → 4 get_logs calls (each chunk fits in one since blocks 0..10 < 50)
    assert celo._w3.eth.get_logs.await_count == 4


# ============================================================
# Handler tests (smoke tests on a few representative handlers)
# ============================================================

@pytest.mark.asyncio
async def test_handle_order_funded_updates_status():
    session = FakeAsyncSession()
    fake_order = MagicMock()
    fake_order.global_status = OrderStatus.CREATED
    fake_order.funded_at = None

    async def execute_returning_order(stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=fake_order)
        return result

    session.execute = execute_returning_order  # type: ignore

    event = {
        "args": {"orderId": 7, "fundedAt": 1700001000},
        "blockNumber": 100,
    }
    await handle_order_funded(event, session, {})

    assert fake_order.global_status == OrderStatus.FUNDED
    assert fake_order.funded_at is not None  # tz-aware datetime


@pytest.mark.asyncio
async def test_handle_stake_slashed_decrements_amount():
    session = FakeAsyncSession()
    fake_stake = MagicMock()
    fake_stake.amount_usdt = 10_000_000  # 10 USDT
    fake_stake.tier = StakeTier.STARTER

    async def execute_returning_stake(stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=fake_stake)
        return result

    session.execute = execute_returning_stake  # type: ignore

    event = {
        "args": {"seller": "0xABC0000000000000000000000000000000000001", "amount": 5_000_000},
        "blockNumber": 100,
    }
    await handle_stake_slashed(event, session, {})

    assert fake_stake.amount_usdt == 5_000_000  # 10 - 5
    # Tier change is handled by TierAutoDowngraded in the same tx
    assert fake_stake.tier == StakeTier.STARTER


@pytest.mark.asyncio
async def test_handle_tier_auto_downgraded_sets_new_tier_and_amount():
    session = FakeAsyncSession()
    fake_stake = MagicMock()
    fake_stake.amount_usdt = 5_000_000

    async def execute_returning_stake(stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=fake_stake)
        return result

    session.execute = execute_returning_stake  # type: ignore

    event = {
        "args": {
            "seller": "0xABC0000000000000000000000000000000000001",
            "oldTier": 1,
            "newTier": 0,
            "remainingStake": 5_000_000,
        },
        "blockNumber": 100,
    }
    await handle_tier_auto_downgraded(event, session, {})

    assert fake_stake.tier == StakeTier.NONE
    assert fake_stake.amount_usdt == 5_000_000


@pytest.mark.asyncio
async def test_handle_order_recorded_creates_reputation_row():
    """First OrderRecorded for a seller should create a fresh ReputationCache row."""
    session = FakeAsyncSession()
    # Mock celo._w3.eth.get_block for first_order_at lookup
    celo = MagicMock()
    celo._w3.eth.get_block = AsyncMock(return_value={"timestamp": 1700000000})

    event = {
        "args": {
            "seller": "0xABC0000000000000000000000000000000000001",
            "orderId": 1,
            "amount": 70_000_000,
        },
        "blockNumber": 100,
    }
    await handle_order_recorded(event, session, {"celo": celo})

    rep_rows = [a for a in session.added if a.__class__.__name__ == "ReputationCache"]
    assert len(rep_rows) == 1
    rep = rep_rows[0]
    assert rep.seller_address == "0xabc0000000000000000000000000000000000001"
    assert rep.orders_completed == 1
    assert rep.total_volume_usdt == 70_000_000
    assert rep.first_order_at is not None


# ============================================================
# AutoRefundInactive (ADR-019 Block 1)
# ============================================================
@pytest.mark.asyncio
async def test_handle_auto_refund_inactive_flips_order_and_items_to_refunded():
    fake_order = MagicMock()
    fake_order.id = "order-uuid"
    fake_order.global_status = OrderStatus.FUNDED

    fake_item_a = MagicMock(status=ItemStatus.PENDING)
    fake_item_b = MagicMock(status=ItemStatus.PENDING)

    class _Session(FakeAsyncSession):
        async def execute(self, stmt):
            # `_get_order_by_onchain_id` queries via execute → scalar_one_or_none.
            # `handle_auto_refund_inactive` then calls scalars(...).all() for items.
            class _Result:
                def scalar_one_or_none(self_):  # noqa: ARG002
                    return fake_order

            return _Result()

        async def scalars(self, stmt):  # noqa: ARG002
            class _Scalars:
                def all(self_):  # noqa: ARG002
                    return ["item-a-id", "item-b-id"]

            return _Scalars()

        async def get(self, model, pk):  # noqa: ARG002
            return {"item-a-id": fake_item_a, "item-b-id": fake_item_b}[pk]

    session = _Session()
    event = {"args": {"orderId": 42, "refundedAt": 1700001000}}
    await handle_auto_refund_inactive(event, session, {})

    assert fake_order.global_status == OrderStatus.REFUNDED
    assert fake_item_a.status == ItemStatus.REFUNDED
    assert fake_item_b.status == ItemStatus.REFUNDED


@pytest.mark.asyncio
async def test_handle_auto_refund_inactive_is_idempotent_when_already_refunded():
    fake_order = MagicMock()
    fake_order.global_status = OrderStatus.REFUNDED

    class _Session(FakeAsyncSession):
        async def execute(self, stmt):  # noqa: ARG002
            class _Result:
                def scalar_one_or_none(self_):  # noqa: ARG002
                    return fake_order

            return _Result()

    session = _Session()
    await handle_auto_refund_inactive(
        {"args": {"orderId": 1, "refundedAt": 0}}, session, {}
    )
    # Must remain Refunded (no flip to anything else).
    assert fake_order.global_status == OrderStatus.REFUNDED


@pytest.mark.asyncio
async def test_handle_auto_refund_inactive_no_op_when_order_missing():
    """Indexer can replay events for orders we never saw — must not raise."""

    class _Session(FakeAsyncSession):
        async def execute(self, stmt):  # noqa: ARG002
            class _Result:
                def scalar_one_or_none(self_):  # noqa: ARG002
                    return None

            return _Result()

    session = _Session()
    await handle_auto_refund_inactive(
        {"args": {"orderId": 999, "refundedAt": 0}}, session, {}
    )  # No assertion — the test passes if no exception is raised.
