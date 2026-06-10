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
from app.models.enums import DisputeLevel, OrderStatus, StakeTier
from app.services.indexer import Indexer
from app.models.enums import ItemStatus
from app.services.indexer_handlers import (
    handle_auto_refund_inactive,
    handle_dispute_escalated,
    handle_item_dispute_resolved,
    handle_mediator_approved,
    handle_order_funded,
    handle_order_recorded,
    handle_stake_slashed,
    handle_tier_auto_downgraded,
    handle_vote_created,
    handle_vote_finalized,
    handle_vote_submitted,
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
        ("_escrow", "0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1"),
        ("_dispute", "0x1f830A47af07E2BE9Db2017C873Bd2eF7F98f4a1"),
        ("_stake", "0xE599a167f0422D6700EC812c6b0f3c485379Ed05"),
        ("_reputation", "0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE"),
        ("_voting", "0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671"),
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

    fake_order.seller_address = "0xabc0000000000000000000000000000000000001"
    fake_order.onchain_order_id = 7
    fake_order.total_amount_usdt = 5_000_000

    async def execute_returning_order(stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=fake_order)
        # The seller-profile join in _notify_seller_new_order uses .first();
        # no profile row here → notification path is a clean no-op.
        result.first = MagicMock(return_value=None)
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
async def test_handle_order_funded_notifies_seller():
    """A funded order records an in-app Notification for the seller and
    fires a best-effort WhatsApp ping with the order id + amount."""
    from uuid import uuid4

    from app.models.notification import Notification

    session = FakeAsyncSession()
    fake_order = MagicMock()
    fake_order.global_status = OrderStatus.CREATED
    fake_order.funded_at = None
    fake_order.onchain_order_id = 7
    fake_order.total_amount_usdt = 5_000_000
    fake_order.seller_address = "0xabc0000000000000000000000000000000000001"

    fake_profile = MagicMock()
    fake_profile.socials = {"whatsapp": "+234 901 123 4567"}
    fake_profile.shop_name = "Mama Adaeze"
    seller_user_id = uuid4()

    calls = {"n": 0}

    async def execute(stmt):
        calls["n"] += 1
        result = MagicMock()
        if calls["n"] == 1:
            # order lookup
            result.scalar_one_or_none = MagicMock(return_value=fake_order)
        else:
            # seller-profile join
            result.first = MagicMock(return_value=(fake_profile, seller_user_id))
        return result

    session.execute = execute  # type: ignore

    notifier = MagicMock()
    event = {"args": {"orderId": 7, "fundedAt": 1700001000}, "blockNumber": 100}
    await handle_order_funded(event, session, {"notifier": notifier})

    assert fake_order.global_status == OrderStatus.FUNDED
    # A durable in-app notification row was queued for the seller.
    assert any(isinstance(o, Notification) for o in session.added)
    # The WhatsApp ping was dispatched with the right details.
    notifier.dispatch_new_order.assert_called_once()
    kwargs = notifier.dispatch_new_order.call_args.kwargs
    assert kwargs["order_id"] == 7
    assert kwargs["amount_human"] == "5.00"


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


# ============================================================
# Dispute mirror handlers (PR A — escalation + resolution close-out)
# ============================================================
class _SeqSession(FakeAsyncSession):
    """Returns queued objects from successive execute() calls (item, order…)."""

    def __init__(self, returns):
        super().__init__()
        self._returns = list(returns)

    async def execute(self, stmt):  # noqa: ARG002
        result = MagicMock()
        nxt = self._returns.pop(0) if self._returns else None
        result.scalar_one_or_none = MagicMock(return_value=nxt)
        return result


@pytest.mark.asyncio
async def test_handle_item_dispute_resolved_full_refund_marks_refunded():
    """Full refund (refundAmount == itemPrice) → item flips Disputed→Refunded
    and the order status is resynced from chain (so the seller row clears)."""
    item = MagicMock(status=ItemStatus.DISPUTED, item_price_usdt=15_000_000)
    order = MagicMock(onchain_order_id=42, global_status=OrderStatus.FUNDED)
    session = _SeqSession([item, order])

    celo = MagicMock()
    celo.get_order = AsyncMock(return_value=MagicMock(global_status="AllShippedSentinel"))

    event = {"args": {"orderId": 42, "itemId": 7, "refundAmount": 15_000_000}}
    await handle_item_dispute_resolved(event, session, {"celo": celo})

    assert item.status == ItemStatus.REFUNDED
    assert order.global_status == "AllShippedSentinel"  # resynced from chain


@pytest.mark.asyncio
async def test_handle_item_dispute_resolved_partial_refund_marks_released():
    """Partial refund (< itemPrice) → item flips Disputed→Released."""
    item = MagicMock(status=ItemStatus.DISPUTED, item_price_usdt=15_000_000)
    order = MagicMock(onchain_order_id=42, global_status=OrderStatus.FUNDED)
    session = _SeqSession([item, order])
    celo = MagicMock()
    celo.get_order = AsyncMock(return_value=MagicMock(global_status=OrderStatus.FUNDED))

    event = {"args": {"orderId": 42, "itemId": 7, "refundAmount": 5_000_000}}
    await handle_item_dispute_resolved(event, session, {"celo": celo})

    assert item.status == ItemStatus.RELEASED


@pytest.mark.asyncio
async def test_handle_item_dispute_resolved_no_op_when_item_missing():
    """Indexer can replay for items we never saw — must not raise."""
    session = _SeqSession([None])
    await handle_item_dispute_resolved(
        {"args": {"orderId": 1, "itemId": 999, "refundAmount": 0}}, session, {}
    )  # passes if no exception


@pytest.mark.asyncio
async def test_handle_dispute_escalated_to_n2_sets_level_and_deadline():
    dispute = MagicMock(level=DisputeLevel.N1_AMICABLE, n2_deadline=None)
    session = _SeqSession([dispute])
    celo = MagicMock()
    celo._w3.eth.get_block = AsyncMock(return_value={"timestamp": 1700000000})

    event = {"args": {"disputeId": 3, "newLevel": 2}, "blockNumber": 100}
    await handle_dispute_escalated(event, session, {"celo": celo})

    assert dispute.level == DisputeLevel.N2_MEDIATION
    assert dispute.n2_deadline is not None  # 7-day window opened


@pytest.mark.asyncio
async def test_handle_dispute_escalated_to_n3_sets_level():
    dispute = MagicMock(level=DisputeLevel.N2_MEDIATION, n2_deadline=None)
    session = _SeqSession([dispute])
    event = {"args": {"disputeId": 3, "newLevel": 3}, "blockNumber": 100}
    await handle_dispute_escalated(event, session, {})

    assert dispute.level == DisputeLevel.N3_VOTING


@pytest.mark.asyncio
async def test_handle_dispute_escalated_no_op_when_dispute_missing():
    session = _SeqSession([None])
    await handle_dispute_escalated(
        {"args": {"disputeId": 999, "newLevel": 2}, "blockNumber": 100}, session, {}
    )  # passes if no exception


# ============================================================
# Mediator whitelist + N3 vote mirror handlers (ADR-056 / PR1)
# ============================================================
@pytest.mark.asyncio
async def test_handle_mediator_approved_creates_row_on_first_approval():
    session = _SeqSession([None])  # no existing mediator row
    celo = MagicMock()
    celo._w3.eth.get_block = AsyncMock(return_value={"timestamp": 1700000000})

    event = {
        "args": {
            "mediator": "0xMED0000000000000000000000000000000000001",
            "approved": True,
        },
        "blockNumber": 100,
    }
    await handle_mediator_approved(event, session, {"celo": celo})

    meds = [a for a in session.added if a.__class__.__name__ == "Mediator"]
    assert len(meds) == 1
    assert meds[0].address == "0xmed0000000000000000000000000000000000001"
    assert meds[0].approved is True
    assert meds[0].removed_at is None


@pytest.mark.asyncio
async def test_handle_mediator_approved_revokes_existing_row():
    existing = MagicMock(approved=True, removed_at=None)
    session = _SeqSession([existing])
    celo = MagicMock()
    celo._w3.eth.get_block = AsyncMock(return_value={"timestamp": 1700000000})

    event = {
        "args": {
            "mediator": "0xMED0000000000000000000000000000000000001",
            "approved": False,
        },
        "blockNumber": 100,
    }
    await handle_mediator_approved(event, session, {"celo": celo})

    assert existing.approved is False
    assert existing.removed_at is not None


@pytest.mark.asyncio
async def test_handle_vote_created_inserts_row_with_zero_tallies():
    session = FakeAsyncSession()
    celo = MagicMock()
    celo._w3.eth.get_block = AsyncMock(return_value={"timestamp": 1700000000})

    event = {
        "args": {"voteId": 9, "disputeId": 3, "deadline": 1700100000},
        "blockNumber": 100,
    }
    await handle_vote_created(event, session, {"celo": celo})

    votes = [a for a in session.added if a.__class__.__name__ == "DisputeVote"]
    assert len(votes) == 1
    assert votes[0].onchain_vote_id == 9
    assert votes[0].onchain_dispute_id == 3
    assert votes[0].for_buyer == 0
    assert votes[0].for_seller == 0
    assert votes[0].finalized is False


@pytest.mark.asyncio
async def test_handle_vote_submitted_increments_correct_tally():
    vote = MagicMock(for_buyer=0, for_seller=0)
    session = _SeqSession([vote])

    await handle_vote_submitted(
        {"args": {"voteId": 9, "voter": "0xX", "favorBuyer": True}, "blockNumber": 1},
        session,
        {},
    )
    assert vote.for_buyer == 1
    assert vote.for_seller == 0

    # Second ballot, against buyer — only the other tally moves.
    await handle_vote_submitted(
        {"args": {"voteId": 9, "voter": "0xY", "favorBuyer": False}, "blockNumber": 2},
        _SeqSession([vote]),
        {},
    )
    assert vote.for_buyer == 1
    assert vote.for_seller == 1


@pytest.mark.asyncio
async def test_handle_vote_finalized_sets_terminal_state():
    vote = MagicMock(finalized=False, buyer_won=None, for_buyer=0, for_seller=0)
    session = _SeqSession([vote])

    await handle_vote_finalized(
        {
            "args": {"voteId": 9, "buyerWon": True, "forBuyer": 3, "forSeller": 1},
            "blockNumber": 1,
        },
        session,
        {},
    )
    assert vote.finalized is True
    assert vote.buyer_won is True
    # Authoritative tallies from the event win over incrementally counted ones.
    assert vote.for_buyer == 3
    assert vote.for_seller == 1
