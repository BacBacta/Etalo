from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order import Order
from app.models.product import Product
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.analytics import (
    AnalyticsSummary,
    EscrowBlock,
    ReputationBlock,
    RevenueBlock,
    TimelinePoint,
    TopProductEntry,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# Which order.status values map to which accounting bucket. Source of
# truth: Order model docstring (created, funded, shipped, delivered,
# completed, disputed, refunded, cancelled).
REVENUE_STATUSES = {"delivered", "completed"}
ESCROW_STATUSES = {"created", "funded", "shipped"}
ACTIVE_STATUSES = {"created", "funded", "shipped"}


def _zero_revenue_block() -> RevenueBlock:
    today = datetime.now(timezone.utc).date()
    return RevenueBlock(
        h24=Decimal("0"),
        d7=Decimal("0"),
        d30=Decimal("0"),
        timeline_7d=[
            TimelinePoint(
                date=today - timedelta(days=6 - i),
                revenue_usdt=Decimal("0"),
            )
            for i in range(7)
        ],
    )


def _sum_revenue_since(db: Session, wallet: str, since: datetime) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(Order.amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= since,
        )
        .scalar()
    )
    return Decimal(total or 0)


def _timeline_7d(db: Session, wallet: str) -> list[TimelinePoint]:
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=6 - i) for i in range(7)]

    rows = (
        db.query(
            func.date(Order.created_at).label("d"),
            func.coalesce(func.sum(Order.amount_usdt), 0).label("rev"),
        )
        .filter(
            Order.seller_address == wallet,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= datetime.now(timezone.utc) - timedelta(days=7),
        )
        .group_by(func.date(Order.created_at))
        .all()
    )
    by_date: dict[date, Decimal] = {r.d: Decimal(r.rev) for r in rows}

    return [
        TimelinePoint(date=d, revenue_usdt=by_date.get(d, Decimal("0")))
        for d in days
    ]


def _top_products(db: Session, wallet: str) -> list[TopProductEntry]:
    rows = (
        db.query(
            Order.product_id.label("pid"),
            func.coalesce(func.sum(Order.amount_usdt), 0).label("rev"),
        )
        .filter(
            Order.seller_address == wallet,
            Order.status.in_(REVENUE_STATUSES),
            Order.product_id.isnot(None),
        )
        .group_by(Order.product_id)
        .order_by(func.sum(Order.amount_usdt).desc())
        .limit(3)
        .all()
    )
    if not rows:
        return []

    product_ids = [r.pid for r in rows]
    by_id = {
        p.id: p
        for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
    }

    out: list[TopProductEntry] = []
    for row in rows:
        p = by_id.get(row.pid)
        if p is None:
            continue
        out.append(
            TopProductEntry(
                product_id=str(p.id),
                title=p.title,
                revenue_usdt=Decimal(row.rev),
                image_ipfs_hash=(
                    p.image_ipfs_hashes[0] if p.image_ipfs_hashes else None
                ),
            )
        )
    return out


@router.get("/summary", response_model=AnalyticsSummary)
def get_summary(
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalyticsSummary:
    """
    Aggregated dashboard data for the connected seller. All sums default
    to 0 on an empty orders table, so the frontend renders empty states
    without any backend-side conditional logic.
    """
    user = db.query(User).filter(User.wallet_address == wallet).one_or_none()
    now = datetime.now(timezone.utc)

    if user is None or user.seller_profile is None:
        return AnalyticsSummary(
            revenue=_zero_revenue_block(),
            active_orders=0,
            escrow=EscrowBlock(in_escrow=Decimal("0"), released=Decimal("0")),
            reputation=ReputationBlock(
                score=0, badge="new_seller", auto_release_days=3
            ),
            top_products=[],
        )

    revenue = RevenueBlock(
        h24=_sum_revenue_since(db, wallet, now - timedelta(days=1)),
        d7=_sum_revenue_since(db, wallet, now - timedelta(days=7)),
        d30=_sum_revenue_since(db, wallet, now - timedelta(days=30)),
        timeline_7d=_timeline_7d(db, wallet),
    )

    active_orders = (
        db.query(func.count(Order.id))
        .filter(
            Order.seller_address == wallet,
            Order.status.in_(ACTIVE_STATUSES),
        )
        .scalar()
    ) or 0

    in_escrow = Decimal(
        db.query(func.coalesce(func.sum(Order.amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            Order.status.in_(ESCROW_STATUSES),
        )
        .scalar()
        or 0
    )
    released = Decimal(
        db.query(func.coalesce(func.sum(Order.amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            Order.status == "completed",
        )
        .scalar()
        or 0
    )

    # Reputation and Top Seller logic lands when the on-chain Reputation
    # contract is indexed. Default values until then.
    reputation = ReputationBlock(
        score=0, badge="new_seller", auto_release_days=3
    )

    return AnalyticsSummary(
        revenue=revenue,
        active_orders=active_orders,
        escrow=EscrowBlock(in_escrow=in_escrow, released=released),
        reputation=reputation,
        top_products=_top_products(db, wallet),
    )
