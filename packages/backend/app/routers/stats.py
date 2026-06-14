"""Public platform stats — on-chain metrics for the MiniPay listing
requirement (§8 Analytics & Operational Visibility).

Everything here is derived from the indexer's order mirror (the V2
indexer is the sole writer — invariant #14), so the numbers are the
on-chain truth without any extra instrumentation. Usage metrics
(DAU/MAU/retention) need client analytics and are tracked separately.

Public + read-only — no wallet auth (the figures are aggregate and
non-sensitive; no addresses are exposed).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.enums import OrderStatus
from app.models.order import Order
from app.schemas.stats import PlatformStats

router = APIRouter(prefix="/stats", tags=["stats"])


def _human(raw: int | Decimal | None) -> Decimal:
    return (Decimal(int(raw or 0)) / Decimal(1_000_000)).quantize(Decimal("0.01"))


@router.get("", response_model=PlatformStats)
def get_platform_stats(db: Annotated[Session, Depends(get_db)]) -> PlatformStats:
    def count(*where) -> int:
        stmt = select(func.count(Order.id))
        for w in where:
            stmt = stmt.where(w)
        return db.scalar(stmt) or 0

    def usdt_sum(*where) -> int:
        stmt = select(func.coalesce(func.sum(Order.total_amount_usdt), 0))
        for w in where:
            stmt = stmt.where(w)
        return db.scalar(stmt) or 0

    total = count()
    completed = count(Order.global_status == OrderStatus.COMPLETED)
    refunded = count(Order.global_status == OrderStatus.REFUNDED)
    disputed = count(Order.global_status == OrderStatus.DISPUTED)

    unique_buyers = (
        db.scalar(select(func.count(func.distinct(Order.buyer_address)))) or 0
    )
    unique_sellers = (
        db.scalar(select(func.count(func.distinct(Order.seller_address)))) or 0
    )

    gmv = usdt_sum(Order.global_status == OrderStatus.COMPLETED)
    commission_raw = (
        db.scalar(
            select(func.coalesce(func.sum(Order.total_commission_usdt), 0)).where(
                Order.global_status == OrderStatus.COMPLETED
            )
        )
        or 0
    )

    since = datetime.now(timezone.utc) - timedelta(days=30)
    orders_30d = count(Order.created_at_chain >= since)
    gmv_30d = usdt_sum(
        Order.created_at_chain >= since,
        Order.global_status == OrderStatus.COMPLETED,
    )

    dispute_rate = (
        (Decimal(disputed) / Decimal(total) * 100).quantize(Decimal("0.1"))
        if total > 0
        else Decimal("0.0")
    )

    return PlatformStats(
        total_orders=total,
        completed_orders=completed,
        refunded_orders=refunded,
        disputed_orders=disputed,
        unique_buyers=unique_buyers,
        unique_sellers=unique_sellers,
        gmv_usdt=_human(gmv),
        commission_usdt=_human(commission_raw),
        dispute_rate_pct=dispute_rate,
        orders_30d=orders_30d,
        gmv_30d_usdt=_human(gmv_30d),
    )
