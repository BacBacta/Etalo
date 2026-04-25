"""V2 Seller profile schema — Sprint J5 Block 6.

Combines on-chain stake state + reputation cache into a single
response. `source` flags whether the data came from the indexer
(authoritative DB row) or a fallback RPC read (when no DB row exists
yet, common shortly after a fresh deploy).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.enums import SellerStatus, StakeTier

USDT_SCALE = Decimal(10) ** 6


class StakeBlock(BaseModel):
    """Per-seller stake state for the seller-profile response."""
    model_config = ConfigDict(from_attributes=True)

    tier: StakeTier
    amount_usdt: int
    active_sales: int
    freeze_count: int

    @computed_field
    @property
    def amount_human(self) -> Decimal:
        return Decimal(self.amount_usdt) / USDT_SCALE


class ReputationBlock(BaseModel):
    """Per-seller reputation snapshot."""
    model_config = ConfigDict(from_attributes=True)

    orders_completed: int
    orders_disputed: int
    disputes_lost: int
    total_volume_usdt: int
    score: int
    is_top_seller: bool
    status: SellerStatus
    last_sanction_at: datetime | None
    first_order_at: datetime | None

    @computed_field
    @property
    def total_volume_human(self) -> Decimal:
        return Decimal(self.total_volume_usdt) / USDT_SCALE


class SellerProfileResponse(BaseModel):
    """Seller profile = stake + reputation + recent counts.

    `source` is "indexer" when both stake and reputation rows came
    from the DB, "rpc_fallback" when at least one was loaded
    on-demand via CeloService.
    """
    seller_address: str
    stake: StakeBlock
    reputation: ReputationBlock
    recent_orders_count: int
    source: Literal["indexer", "rpc_fallback"]
