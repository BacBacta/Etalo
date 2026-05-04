from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class TimelinePoint(BaseModel):
    date: date
    revenue_usdt: Decimal


class RevenueBlock(BaseModel):
    h24: Decimal
    d7: Decimal
    d30: Decimal
    timeline_7d: list[TimelinePoint]


class EscrowBlock(BaseModel):
    in_escrow: Decimal
    released: Decimal


class ReputationBlock(BaseModel):
    # J10-V5 Phase 5 Angle C sub-block C.1 — badge tightened from plain
    # `str` (with enum hint in comment only) to a Pydantic Literal that
    # emits OpenAPI enum metadata + validates at the response boundary.
    # "top_seller" was dropped per ADR-041 (Top Seller program deferred
    # V1.1 ; analytics router never set this value at runtime, so safe
    # drop without a data migration).
    score: int
    badge: Literal["new_seller", "active", "suspended"]
    auto_release_days: int


class TopProductEntry(BaseModel):
    product_id: str
    title: str
    revenue_usdt: Decimal
    image_ipfs_hash: str | None = None


class AnalyticsSummary(BaseModel):
    revenue: RevenueBlock
    active_orders: int
    escrow: EscrowBlock
    reputation: ReputationBlock
    top_products: list[TopProductEntry]
