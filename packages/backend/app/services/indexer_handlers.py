"""V2 event indexer — declarative handlers.

Each handler signature: `async def handle_X(event, db, services)`.
- `event`: web3.py decoded event (has .args, .blockNumber, .transactionHash, .logIndex)
- `db`: SQLAlchemy AsyncSession
- `services`: dict {"celo": CeloService, ...} for complementary reads

Handlers are STATELESS and idempotent — the dispatcher checks
indexer_events_processed before invoking, so handlers can assume
this event has not been processed yet.

Block 5 implements 15 core handlers. The remaining ~25 are tracked
in `scripts/INDEXER_HANDLERS_TODO.md` and will be added in Block 5b
or in-line with endpoint needs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dispute import Dispute
from app.models.enums import (
    DisputeLevel,
    ItemStatus,
    OrderStatus,
    ShipmentStatus,
    StakeTier,
)
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.reputation_cache import ReputationCache
from app.models.seller_credits_ledger import SellerCreditsLedger
from app.models.seller_profile import SellerProfile
from app.models.shipment_group import ShipmentGroup
from app.models.stake import Stake
from app.models.user import User


HandlerType = Callable[[Any, AsyncSession, dict[str, Any]], Awaitable[None]]


# ============================================================
# Helpers
# ============================================================
def _to_lower(addr: Any) -> str:
    return str(addr).lower()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dt(unix_ts: int) -> datetime:
    """Block timestamps come as Unix seconds; convert to tz-aware UTC."""
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc)


async def _get_or_create_stake(db: AsyncSession, seller: str) -> Stake:
    seller_lower = _to_lower(seller)
    result = await db.execute(select(Stake).where(Stake.seller_address == seller_lower))
    stake = result.scalar_one_or_none()
    if stake is None:
        stake = Stake(
            seller_address=seller_lower,
            tier=StakeTier.NONE,
            amount_usdt=0,
            active_sales=0,
            freeze_count=0,
            last_synced_at=_now(),
        )
        db.add(stake)
    return stake


async def _get_or_create_reputation(db: AsyncSession, seller: str) -> ReputationCache:
    seller_lower = _to_lower(seller)
    result = await db.execute(
        select(ReputationCache).where(ReputationCache.seller_address == seller_lower)
    )
    rep = result.scalar_one_or_none()
    if rep is None:
        # Explicit Python defaults — SQLAlchemy column defaults only apply on
        # SELECT, so newly-instantiated rows must seed counters here for
        # in-memory increments (rep.orders_completed += 1 etc).
        rep = ReputationCache(
            seller_address=seller_lower,
            orders_completed=0,
            orders_disputed=0,
            disputes_lost=0,
            total_volume_usdt=0,
            score=50,
            is_top_seller=False,
            last_synced_at=_now(),
        )
        db.add(rep)
    return rep


async def _get_order_by_onchain_id(db: AsyncSession, onchain_order_id: int) -> Order | None:
    result = await db.execute(
        select(Order).where(Order.onchain_order_id == onchain_order_id)
    )
    return result.scalar_one_or_none()


async def _get_item_by_onchain_id(db: AsyncSession, onchain_item_id: int) -> OrderItem | None:
    result = await db.execute(
        select(OrderItem).where(OrderItem.onchain_item_id == onchain_item_id)
    )
    return result.scalar_one_or_none()


async def _get_group_by_onchain_id(
    db: AsyncSession, onchain_group_id: int
) -> ShipmentGroup | None:
    result = await db.execute(
        select(ShipmentGroup).where(ShipmentGroup.onchain_group_id == onchain_group_id)
    )
    return result.scalar_one_or_none()


# ============================================================
# Escrow handlers (8)
# ============================================================
async def handle_order_created(event: Any, db: AsyncSession, services: dict[str, Any]) -> None:
    """OrderCreated(orderId, buyer, seller, totalAmount, isCrossBorder, itemCount).

    Pulls the rest from chain (commission, item ids, etc.) since the event is
    minimal. Inserts Order + N OrderItem rows.
    """
    args = event["args"]
    order_id = args["orderId"]
    celo = services["celo"]

    # Fetch full order + items from chain
    order_chain = await celo.get_order(order_id)
    item_ids = await celo.get_order_items(order_id)

    if order_chain is None:
        return  # Defensive — should not happen since we just saw the event

    block_ts = (await celo._w3.eth.get_block(event["blockNumber"]))["timestamp"]

    db.add(
        Order(
            onchain_order_id=order_id,
            buyer_address=order_chain.buyer,
            seller_address=order_chain.seller,
            total_amount_usdt=order_chain.total_amount,
            total_commission_usdt=order_chain.total_commission,
            is_cross_border=order_chain.is_cross_border,
            global_status=OrderStatus.CREATED,
            item_count=order_chain.item_count,
            funded_at=None,
            created_at_chain=_to_dt(block_ts),
        )
    )
    await db.flush()

    # Fetch items from chain and insert
    for idx, item_chain_id in enumerate(item_ids):
        item_chain = await celo.get_item(item_chain_id)
        if item_chain is None:
            continue
        order_db = await _get_order_by_onchain_id(db, order_id)
        db.add(
            OrderItem(
                onchain_item_id=item_chain.item_id,
                order_id=order_db.id,
                item_index=idx,
                item_price_usdt=item_chain.item_price,
                item_commission_usdt=item_chain.item_commission,
                status=ItemStatus.PENDING,
                released_amount_usdt=0,
            )
        )


async def handle_order_funded(event: Any, db: AsyncSession, services: dict[str, Any]) -> None:
    """OrderFunded(orderId, fundedAt)."""
    args = event["args"]
    order_id = args["orderId"]
    funded_at = args["fundedAt"]
    order = await _get_order_by_onchain_id(db, order_id)
    if order is None:
        return
    order.funded_at = _to_dt(funded_at)
    order.global_status = OrderStatus.FUNDED


async def handle_shipment_group_created(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """ShipmentGroupCreated(orderId, groupId, itemIds[], proofHash)."""
    args = event["args"]
    order_id = args["orderId"]
    group_id = args["groupId"]
    item_ids = args["itemIds"]
    proof_hash = args["proofHash"]

    order = await _get_order_by_onchain_id(db, order_id)
    if order is None:
        return

    block_ts = (await services["celo"]._w3.eth.get_block(event["blockNumber"]))["timestamp"]

    group = ShipmentGroup(
        onchain_group_id=group_id,
        order_id=order.id,
        status=ShipmentStatus.SHIPPED,
        proof_hash=bytes(proof_hash),
        release_stage=0,
        shipped_at=_to_dt(block_ts),
    )
    db.add(group)
    await db.flush()

    # Attach items to the group + transition to Shipped
    for iid in item_ids:
        item = await _get_item_by_onchain_id(db, iid)
        if item is not None:
            item.shipment_group_id = group.id
            item.status = ItemStatus.SHIPPED


async def handle_group_arrived(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """GroupArrived(orderId, groupId, arrivalProofHash, arrivedAt)."""
    args = event["args"]
    group_id = args["groupId"]
    arrival_hash = args["arrivalProofHash"]
    arrived_at = args["arrivedAt"]

    group = await _get_group_by_onchain_id(db, group_id)
    if group is None:
        return
    group.status = ShipmentStatus.ARRIVED
    group.arrival_proof_hash = bytes(arrival_hash)
    group.arrived_at = _to_dt(arrived_at)
    # Pull final timing from chain to know majorityReleaseAt + finalReleaseAfter
    chain_group = await services["celo"].get_shipment_group(group_id)
    if chain_group is not None:
        if chain_group.majority_release_at:
            group.majority_release_at = _to_dt(chain_group.majority_release_at)
        if chain_group.final_release_after:
            group.final_release_after = _to_dt(chain_group.final_release_after)

    # Items in the group transition to Arrived
    for item in group.items:
        if item.status == ItemStatus.SHIPPED:
            item.status = ItemStatus.ARRIVED


async def handle_partial_release_triggered(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """PartialReleaseTriggered(orderId, groupId, releaseStage, amount).

    Updates group.release_stage. The actual amount is reflected in
    ItemReleased events that fire alongside.
    """
    args = event["args"]
    group_id = args["groupId"]
    release_stage = args["releaseStage"]

    group = await _get_group_by_onchain_id(db, group_id)
    if group is None:
        return
    group.release_stage = release_stage


async def handle_item_released(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """ItemReleased(orderId, itemId, amount).

    `amount` is the cumulative net released to seller for this item
    (per ADR-018 partial releases also fire this with cumulative amounts
    — verify in V1.5 if any pivot needed).
    """
    args = event["args"]
    item_id = args["itemId"]
    amount = args["amount"]

    item = await _get_item_by_onchain_id(db, item_id)
    if item is None:
        return
    item.released_amount_usdt = amount
    # If the full item value (gross) was paid out, mark Released
    if amount >= item.item_price_usdt:
        item.status = ItemStatus.RELEASED


async def handle_order_completed(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """OrderCompleted(orderId)."""
    order_id = event["args"]["orderId"]
    order = await _get_order_by_onchain_id(db, order_id)
    if order is None:
        return
    order.global_status = OrderStatus.COMPLETED


async def handle_item_disputed(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """ItemDisputed(orderId, itemId) — emitted by Escrow.markItemDisputed."""
    item_id = event["args"]["itemId"]
    item = await _get_item_by_onchain_id(db, item_id)
    if item is not None:
        item.status = ItemStatus.DISPUTED


# ============================================================
# Dispute handlers (3)
# ============================================================
async def handle_dispute_opened(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """DisputeOpened(disputeId, orderId, itemId, buyer, reason).

    Reconstructs the Dispute row from event args + chain reads
    (since getDispute() is minimal).
    """
    args = event["args"]
    dispute_id = args["disputeId"]
    order_id = args["orderId"]
    item_id = args["itemId"]
    buyer = _to_lower(args["buyer"])
    reason = args["reason"]

    order = await _get_order_by_onchain_id(db, order_id)
    item = await _get_item_by_onchain_id(db, item_id)
    if order is None or item is None:
        return

    block_ts = (await services["celo"]._w3.eth.get_block(event["blockNumber"]))["timestamp"]
    opened_at = _to_dt(block_ts)
    n1_deadline = _to_dt(block_ts + 48 * 3600)  # ADR-022 N1 = 48h

    db.add(
        Dispute(
            onchain_dispute_id=dispute_id,
            order_id=order.id,
            order_item_id=item.id,
            buyer_address=buyer,
            seller_address=order.seller_address,
            level=DisputeLevel.N1_AMICABLE,
            refund_amount_usdt=0,
            slash_amount_usdt=0,
            resolved=False,
            reason=reason,
            opened_at=opened_at,
            n1_deadline=n1_deadline,
        )
    )


async def handle_mediator_assigned(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """MediatorAssigned(disputeId, mediator) — admin assigns N2 mediator."""
    dispute_id = event["args"]["disputeId"]
    mediator = _to_lower(event["args"]["mediator"])
    result = await db.execute(
        select(Dispute).where(Dispute.onchain_dispute_id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if dispute is not None:
        dispute.n2_mediator_address = mediator


async def handle_dispute_resolved(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """DisputeResolved(disputeId, favorBuyer, refundAmount, slashAmount)."""
    args = event["args"]
    dispute_id = args["disputeId"]
    favor_buyer = args["favorBuyer"]
    refund = args["refundAmount"]
    slash = args["slashAmount"]

    result = await db.execute(
        select(Dispute).where(Dispute.onchain_dispute_id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if dispute is None:
        return

    block_ts = (await services["celo"]._w3.eth.get_block(event["blockNumber"]))["timestamp"]
    dispute.resolved = True
    dispute.favor_buyer = favor_buyer
    dispute.refund_amount_usdt = refund
    dispute.slash_amount_usdt = slash
    dispute.level = DisputeLevel.RESOLVED
    dispute.resolved_at = _to_dt(block_ts)


# ============================================================
# Stake handlers (3)
# ============================================================
async def handle_stake_deposited(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """StakeDeposited(seller, amount, tier)."""
    args = event["args"]
    seller = _to_lower(args["seller"])
    amount = args["amount"]
    tier_idx = args["tier"]

    stake = await _get_or_create_stake(db, seller)
    stake.amount_usdt = amount
    stake.tier = list(StakeTier)[tier_idx]
    stake.last_synced_at = _now()


async def handle_stake_slashed(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """StakeSlashed(seller, amount, recipient, disputeId).

    Decrement stake.amount; tier change is handled separately by a
    TierAutoDowngraded event firing in the same tx.
    """
    args = event["args"]
    seller = _to_lower(args["seller"])
    slashed = args["amount"]

    stake = await _get_or_create_stake(db, seller)
    stake.amount_usdt = max(0, stake.amount_usdt - slashed)
    stake.last_synced_at = _now()


async def handle_tier_auto_downgraded(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """TierAutoDowngraded(seller, oldTier, newTier, remainingStake)."""
    args = event["args"]
    seller = _to_lower(args["seller"])
    new_tier = args["newTier"]
    remaining = args["remainingStake"]

    stake = await _get_or_create_stake(db, seller)
    stake.tier = list(StakeTier)[new_tier]
    stake.amount_usdt = remaining
    stake.last_synced_at = _now()


# ============================================================
# Reputation handlers (1)
# ============================================================
async def handle_order_recorded(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """OrderRecorded(seller, orderId, amount) — fired by Reputation
    on each successful item release. Updates orders_completed +
    total_volume_usdt counters.
    """
    args = event["args"]
    seller = _to_lower(args["seller"])
    amount = args["amount"]

    rep = await _get_or_create_reputation(db, seller)
    rep.orders_completed += 1
    rep.total_volume_usdt += amount
    rep.last_synced_at = _now()
    if rep.first_order_at is None:
        block_ts = (await services["celo"]._w3.eth.get_block(event["blockNumber"]))["timestamp"]
        rep.first_order_at = _to_dt(block_ts)


# ============================================================
# Credits handler (J7 Block 6 — 1)
# ============================================================
import logging

_credits_logger = logging.getLogger(__name__)


async def handle_credits_purchased(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """CreditsPurchased(buyer, creditAmount, usdtAmount, timestamp) —
    mirrors the on-chain purchase to the off-chain ledger so future
    /generate-image calls see the new balance.

    Idempotency is provided by the dispatcher via IndexerEvent
    (tx_hash, log_index); the SellerCreditsLedger UNIQUE
    (tx_hash, source) constraint is defense-in-depth.

    Behavior when the buyer wallet has no SellerProfile yet: log a
    warning and return without writing. V1.5+ may add a user-level
    credits balance for non-seller buyers; for now the policy is
    "credits are seller-scoped" (only sellers generate marketing).
    """
    args = event["args"]
    buyer = _to_lower(args["buyer"])
    credit_amount = int(args["creditAmount"])

    raw_tx_hash = event["transactionHash"]
    tx_hash = (
        raw_tx_hash.hex() if hasattr(raw_tx_hash, "hex") else str(raw_tx_hash)
    )
    if not tx_hash.startswith("0x"):
        tx_hash = "0x" + tx_hash
    tx_hash = tx_hash.lower()

    seller = (
        await db.execute(
            select(SellerProfile)
            .join(User, SellerProfile.user_id == User.id)
            .where(User.wallet_address == buyer)
        )
    ).scalar_one_or_none()

    if seller is None:
        _credits_logger.warning(
            "CreditsPurchased: no SellerProfile for buyer %s (tx %s) — skipping",
            buyer,
            tx_hash,
        )
        return

    db.add(
        SellerCreditsLedger(
            seller_id=seller.id,
            credits_delta=credit_amount,
            source="purchase",
            tx_hash=tx_hash,
        )
    )
    # No commit here — the indexer dispatcher commits at the end of
    # the chunk (along with the IndexerEvent idempotency row).


# ============================================================
# Registry — keyed by (contract_name, event_name)
# ============================================================
HANDLERS: dict[tuple[str, str], HandlerType] = {
    ("EtaloEscrow", "OrderCreated"): handle_order_created,
    ("EtaloEscrow", "OrderFunded"): handle_order_funded,
    ("EtaloEscrow", "ShipmentGroupCreated"): handle_shipment_group_created,
    ("EtaloEscrow", "GroupArrived"): handle_group_arrived,
    ("EtaloEscrow", "PartialReleaseTriggered"): handle_partial_release_triggered,
    ("EtaloEscrow", "ItemReleased"): handle_item_released,
    ("EtaloEscrow", "OrderCompleted"): handle_order_completed,
    ("EtaloEscrow", "ItemDisputed"): handle_item_disputed,
    ("EtaloDispute", "DisputeOpened"): handle_dispute_opened,
    ("EtaloDispute", "MediatorAssigned"): handle_mediator_assigned,
    ("EtaloDispute", "DisputeResolved"): handle_dispute_resolved,
    ("EtaloStake", "StakeDeposited"): handle_stake_deposited,
    ("EtaloStake", "StakeSlashed"): handle_stake_slashed,
    ("EtaloStake", "TierAutoDowngraded"): handle_tier_auto_downgraded,
    ("EtaloReputation", "OrderRecorded"): handle_order_recorded,
    ("EtaloCredits", "CreditsPurchased"): handle_credits_purchased,
}
