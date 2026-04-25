"""Pydantic models for V2 contract reads.

Each schema mirrors the underlying Solidity struct or getter return
value verbatim. Addresses are lowercased on output for consistency
with the DB layer (CHECK constraints in models). USDT amounts stay
in the smallest unit (BIGINT, 6 decimals) — `*_human` computed
fields expose Decimal for display.

Indexer and HTTP routes both consume these schemas. Service layer
returns these; endpoints translate to API schemas as needed.
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.enums import (
    DisputeLevel,
    ItemStatus,
    OrderStatus,
    SellerStatus,
    ShipmentStatus,
    StakeTier,
)

# 1 USDT = 1_000_000 raw (6 decimals)
USDT_SCALE = Decimal(10) ** 6


class OrderOnChain(BaseModel):
    """Mirrors EtaloEscrow.Order struct (11 fields)."""
    model_config = ConfigDict(frozen=True)

    order_id: int
    buyer: str  # lowercased
    seller: str  # lowercased
    total_amount: int
    total_commission: int
    created_at: int  # block timestamp seconds
    funded_at: int  # 0 if not yet funded
    is_cross_border: bool
    global_status: OrderStatus
    item_count: int
    shipment_group_count: int

    @computed_field
    @property
    def total_amount_human(self) -> Decimal:
        return Decimal(self.total_amount) / USDT_SCALE

    @computed_field
    @property
    def total_commission_human(self) -> Decimal:
        return Decimal(self.total_commission) / USDT_SCALE


class ItemOnChain(BaseModel):
    """Mirrors EtaloEscrow.Item struct (7 fields)."""
    model_config = ConfigDict(frozen=True)

    item_id: int
    order_id: int
    item_price: int
    item_commission: int
    shipment_group_id: int  # 0 if not yet assigned
    released_amount: int
    status: ItemStatus

    @computed_field
    @property
    def item_price_human(self) -> Decimal:
        return Decimal(self.item_price) / USDT_SCALE


class ShipmentGroupOnChain(BaseModel):
    """Mirrors EtaloEscrow.ShipmentGroup struct (11 fields)."""
    model_config = ConfigDict(frozen=True)

    group_id: int
    order_id: int
    item_ids: list[int]
    shipment_proof_hash: bytes  # 32-byte
    arrival_proof_hash: bytes  # 32-byte
    shipped_at: int
    arrived_at: int
    majority_release_at: int
    final_release_after: int
    status: ShipmentStatus
    release_stage: int  # 0..3


class DisputeOnChain(BaseModel):
    """Result of EtaloDispute.getDispute(disputeId).

    NB: getDispute is a thin lookup returning only 4 fields. Full
    dispute history (refundAmount, slashAmount, n2Mediator, etc.)
    is reconstructed by the indexer from DisputeOpened, DisputeEscalated,
    DisputeResolved, and MediatorAssigned events.
    """
    model_config = ConfigDict(frozen=True)

    order_id: int
    item_id: int
    level: DisputeLevel
    resolved: bool


class N1ProposalOnChain(BaseModel):
    """Result of EtaloDispute.getN1Proposal(disputeId)."""
    model_config = ConfigDict(frozen=True)

    buyer_amount: int
    seller_amount: int
    buyer_proposed: bool
    seller_proposed: bool


class StakeOnChain(BaseModel):
    """Per-seller stake snapshot (composed from getStake + getTier + getActiveSales)."""
    model_config = ConfigDict(frozen=True)

    seller: str  # lowercased
    amount: int  # USDT smallest unit
    tier: StakeTier
    active_sales: int

    @computed_field
    @property
    def amount_human(self) -> Decimal:
        return Decimal(self.amount) / USDT_SCALE


class WithdrawalStateOnChain(BaseModel):
    """Result of EtaloStake.getWithdrawal(seller) — 6-tuple."""
    model_config = ConfigDict(frozen=True)

    amount: int
    target_tier: StakeTier
    unlock_at: int
    frozen_remaining: int  # seconds
    active: bool
    freeze_count: int


class ReputationOnChain(BaseModel):
    """Mirrors EtaloReputation.SellerReputation struct (9 fields)."""
    model_config = ConfigDict(frozen=True)

    seller: str  # lowercased
    orders_completed: int
    orders_disputed: int
    disputes_lost: int
    total_volume: int
    score: int
    is_top_seller: bool
    status: SellerStatus
    last_sanction_at: int  # 0 if never sanctioned
    first_order_at: int  # 0 if never ordered

    @computed_field
    @property
    def total_volume_human(self) -> Decimal:
        return Decimal(self.total_volume) / USDT_SCALE
