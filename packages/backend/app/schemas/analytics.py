from datetime import date
from decimal import Decimal

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
    score: int
    badge: str  # "new_seller" | "top_seller" | "active" | "suspended"
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
