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
from app.models.dispute_vote import DisputeVote
from app.models.mediator import Mediator
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


async def _sync_order_global_status(
    order: Order, services: dict[str, Any]
) -> None:
    """Re-read the order's globalStatus from chain and update the DB
    mirror if it changed.

    The contract owns the FUNDED → PARTIALLY_SHIPPED / ALL_SHIPPED /
    PARTIALLY_DELIVERED transitions internally (no dedicated event
    fires when only the order status changes). Without this resync the
    DB stays in FUNDED until the OrderCompleted event lands, which
    breaks the dashboard rollups + the buyer/seller card chips.

    Single chain read per state-transitioning event ; acceptable
    overhead given indexer pacing.
    """
    chain_order = await services["celo"].get_order(order.onchain_order_id)
    if chain_order is None:
        return
    if chain_order.global_status != order.global_status:
        order.global_status = chain_order.global_status


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

    # For intra orders the contract sets finalReleaseAfter = shippedAt +
    # 3d at ship time (cross-border sets it later at markGroupArrived).
    # The ShipmentGroupCreated event doesn't carry it, so re-read from
    # chain — otherwise the mirror's final_release_after stays NULL and
    # both the auto-release keeper and the seller payout-ETA chip have
    # nothing to act on (intra is V1's only flow per ADR-041).
    chain_group = await services["celo"].get_shipment_group(group_id)
    if chain_group is not None and chain_group.final_release_after:
        group.final_release_after = _to_dt(chain_group.final_release_after)

    # Attach items to the group + transition to Shipped
    for iid in item_ids:
        item = await _get_item_by_onchain_id(db, iid)
        if item is not None:
            item.shipment_group_id = group.id
            item.status = ItemStatus.SHIPPED

    # Re-read order.globalStatus from chain so the DB mirror reflects
    # the contract's PartiallyShipped/AllShipped transition. Without
    # this the order stayed in Funded even after every item shipped
    # (J12 mainnet smoke bug, order #1).
    await _sync_order_global_status(order, services)


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

    # Order may transition from AllShipped → PartiallyDelivered.
    order = await _get_order_by_onchain_id(db, args["orderId"])
    if order is not None:
        await _sync_order_global_status(order, services)


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


async def handle_early_release_requested(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """EarlyReleaseRequested(orderId, groupId, deliveryProofHash, shortenedReleaseAfter).

    ADR-057 — the seller submitted proof of delivery to accelerate the
    auto-release window. The event carries everything we need :
      - shortenedReleaseAfter → the new (never later) final_release_after,
        which the auto-release keeper + seller payout-ETA chip both read.
      - deliveryProofHash → stored as dispute evidence ; bytes32(0) when
        the seller requested early release without attaching an artifact.
    """
    args = event["args"]
    group_id = args["groupId"]
    proof = bytes(args["deliveryProofHash"])
    shortened = args["shortenedReleaseAfter"]

    group = await _get_group_by_onchain_id(db, group_id)
    if group is None:
        return
    group.final_release_after = _to_dt(shortened)
    group.early_release_requested = True
    # Only persist a real artifact — bytes32(0) means "no proof attached".
    if int.from_bytes(proof, "big") != 0:
        group.delivery_proof_hash = proof


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

    # Order may transition AllShipped/PartiallyDelivered → Completed
    # if this was the last item, but the contract's OrderCompleted
    # event handler already covers that final hop. Sync anyway in case
    # PartiallyDelivered isn't reached via GroupArrived first (e.g.
    # the contract releases without an arrival proof).
    order = await _get_order_by_onchain_id(db, args["orderId"])
    if order is not None:
        await _sync_order_global_status(order, services)


async def handle_order_completed(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """OrderCompleted(orderId)."""
    order_id = event["args"]["orderId"]
    order = await _get_order_by_onchain_id(db, order_id)
    if order is None:
        return
    order.global_status = OrderStatus.COMPLETED


async def handle_auto_refund_inactive(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """AutoRefundInactive(orderId, refundedAt).

    Emitted when `EtaloEscrow.triggerAutoRefundIfInactive(orderId)`
    succeeds (ADR-019 7-day intra / 14-day cross-border seller-inactivity
    window). Flips the order + every item to Refunded so the seller
    dashboard stops surfacing it and the buyer's `/orders/[id]` reflects
    the on-chain truth. Idempotent : if the order is already Refunded
    (re-org replay), no-op.
    """
    order_id = event["args"]["orderId"]
    order = await _get_order_by_onchain_id(db, order_id)
    if order is None:
        return
    if order.global_status == OrderStatus.REFUNDED:
        return
    order.global_status = OrderStatus.REFUNDED

    # Mirror item-level refund so per-item queries stay consistent. The
    # contract refunds the entire order's totalAmount, so every non-
    # terminal item flips. Items already Released / Disputed / Refunded
    # would have prevented the on-chain call from succeeding (see ADR-031
    # + AUTO_REFUND requires Funded order status), so a blanket pass is
    # safe.
    item_ids = await db.scalars(
        select(OrderItem.id).where(OrderItem.order_id == order.id)
    )
    for item_id in item_ids.all():
        item = await db.get(OrderItem, item_id)
        if item is None:
            continue
        item.status = ItemStatus.REFUNDED


async def handle_item_disputed(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """ItemDisputed(orderId, itemId) — emitted by Escrow.markItemDisputed."""
    item_id = event["args"]["itemId"]
    item = await _get_item_by_onchain_id(db, item_id)
    if item is not None:
        item.status = ItemStatus.DISPUTED


async def handle_item_dispute_resolved(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """ItemDisputeResolved(orderId, itemId, refundAmount) — emitted by
    Escrow.resolveItemDispute when a dispute settles via any tier (N1/N2/N3).

    Mirrors the on-chain item transition: Refunded iff the full item price
    was refunded, otherwise Released (EtaloEscrow.resolveItemDispute:
    "Refunded iff refundAmount == itemPrice"). Without this the item stays
    Disputed in the mirror forever — the seller row keeps its rose border +
    Dispute badge and useOrderHasDispute never clears after resolution.
    """
    args = event["args"]
    item_id = args["itemId"]
    refund_amount = args["refundAmount"]

    item = await _get_item_by_onchain_id(db, item_id)
    if item is None:
        return
    if refund_amount == item.item_price_usdt:
        item.status = ItemStatus.REFUNDED
    else:
        item.status = ItemStatus.RELEASED

    # resolveItemDispute recomputes order.globalStatus on-chain and emits
    # OrderCompleted only on the terminal hop (handled separately). Resync
    # from chain so non-terminal transitions (e.g. back to AllShipped) are
    # mirrored too.
    order = await _get_order_by_onchain_id(db, args["orderId"])
    if order is not None:
        await _sync_order_global_status(order, services)


# ============================================================
# Dispute handlers (4)
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


async def handle_dispute_escalated(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """DisputeEscalated(disputeId, newLevel) — N1→N2 (mediation) or
    N2→N3 (voting).

    Without this handler the mirror stays frozen at N1 forever: the UI
    keeps showing the N1 amicable card and never reflects that the case
    advanced to a mediator / community vote.
    """
    args = event["args"]
    dispute_id = args["disputeId"]
    new_level = args["newLevel"]  # uint8 — 2 = N2, 3 = N3

    result = await db.execute(
        select(Dispute).where(Dispute.onchain_dispute_id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if dispute is None:
        return

    # DisputeLevel is ordered None=0, N1=1, N2=2, N3=3, Resolved=4 — the
    # uint8 maps directly (same convention as handle_dispute_opened).
    dispute.level = list(DisputeLevel)[new_level]

    # N2 opens a 7-day mediation window (EtaloDispute.N2_DURATION).
    if dispute.level == DisputeLevel.N2_MEDIATION:
        block_ts = (
            await services["celo"]._w3.eth.get_block(event["blockNumber"])
        )["timestamp"]
        dispute.n2_deadline = _to_dt(block_ts + 7 * 24 * 3600)


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
# Mediator whitelist + N3 vote handlers (ADR-056)
# ============================================================
async def handle_mediator_approved(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """MediatorApproved(mediator, approved) — Safe toggles the N2/N3
    mediator whitelist. Mirrors EtaloDispute.isMediatorApproved."""
    args = event["args"]
    address = _to_lower(args["mediator"])
    approved = args["approved"]
    block_ts = (
        await services["celo"]._w3.eth.get_block(event["blockNumber"])
    )["timestamp"]
    ts = _to_dt(block_ts)

    result = await db.execute(select(Mediator).where(Mediator.address == address))
    med = result.scalar_one_or_none()
    if med is None:
        med = Mediator(address=address, approved=approved, approved_at=ts)
        db.add(med)
    else:
        med.approved = approved
        if approved:
            med.approved_at = ts
    med.removed_at = None if approved else ts


async def handle_vote_created(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """VoteCreated(voteId, disputeId, deadline) — N3 community vote opened."""
    args = event["args"]
    block_ts = (
        await services["celo"]._w3.eth.get_block(event["blockNumber"])
    )["timestamp"]
    db.add(
        DisputeVote(
            onchain_vote_id=args["voteId"],
            onchain_dispute_id=args["disputeId"],
            deadline=_to_dt(args["deadline"]),
            for_buyer=0,
            for_seller=0,
            finalized=False,
            created_at=_to_dt(block_ts),
        )
    )


async def handle_vote_submitted(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """VoteSubmitted(voteId, voter, favorBuyer) — increment the tally.

    Safe to increment unconditionally: the dispatcher skips already-
    processed (tx_hash, log_index) events, so each ballot lands once.
    """
    args = event["args"]
    result = await db.execute(
        select(DisputeVote).where(DisputeVote.onchain_vote_id == args["voteId"])
    )
    vote = result.scalar_one_or_none()
    if vote is None:
        return
    if args["favorBuyer"]:
        vote.for_buyer += 1
    else:
        vote.for_seller += 1


async def handle_vote_finalized(
    event: Any, db: AsyncSession, services: dict[str, Any]
) -> None:
    """VoteFinalized(voteId, buyerWon, forBuyer, forSeller) — terminal
    tallies from the event win over the incrementally-counted ones."""
    args = event["args"]
    result = await db.execute(
        select(DisputeVote).where(DisputeVote.onchain_vote_id == args["voteId"])
    )
    vote = result.scalar_one_or_none()
    if vote is None:
        return
    vote.finalized = True
    vote.buyer_won = args["buyerWon"]
    vote.for_buyer = args["forBuyer"]
    vote.for_seller = args["forSeller"]


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
    ("EtaloEscrow", "EarlyReleaseRequested"): handle_early_release_requested,
    ("EtaloEscrow", "PartialReleaseTriggered"): handle_partial_release_triggered,
    ("EtaloEscrow", "ItemReleased"): handle_item_released,
    ("EtaloEscrow", "OrderCompleted"): handle_order_completed,
    ("EtaloEscrow", "AutoRefundInactive"): handle_auto_refund_inactive,
    ("EtaloEscrow", "ItemDisputed"): handle_item_disputed,
    ("EtaloEscrow", "ItemDisputeResolved"): handle_item_dispute_resolved,
    ("EtaloDispute", "DisputeOpened"): handle_dispute_opened,
    ("EtaloDispute", "DisputeEscalated"): handle_dispute_escalated,
    ("EtaloDispute", "MediatorAssigned"): handle_mediator_assigned,
    ("EtaloDispute", "MediatorApproved"): handle_mediator_approved,
    ("EtaloDispute", "DisputeResolved"): handle_dispute_resolved,
    ("EtaloVoting", "VoteCreated"): handle_vote_created,
    ("EtaloVoting", "VoteSubmitted"): handle_vote_submitted,
    ("EtaloVoting", "VoteFinalized"): handle_vote_finalized,
    ("EtaloStake", "StakeDeposited"): handle_stake_deposited,
    ("EtaloStake", "StakeSlashed"): handle_stake_slashed,
    ("EtaloStake", "TierAutoDowngraded"): handle_tier_auto_downgraded,
    ("EtaloReputation", "OrderRecorded"): handle_order_recorded,
    ("EtaloCredits", "CreditsPurchased"): handle_credits_purchased,
}
