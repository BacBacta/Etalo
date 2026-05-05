"""Aggregated dashboard data for the seller-side analytics surface
(/seller/dashboard Overview tab — Block 5 sub-block 5.4 onward).

Sub-block 5.2a (J10-V5 Phase 4 Block 5) refactored every SQL query in
this module from the V1 Order schema to V2 (Sprint J5 Block 2). The V1
field names referenced here originally — `amount_usdt`, `status` (str),
`product_id`, `created_at` — were renamed/restructured during the V2
migration but the analytics router was never updated, so the endpoint
500'd on any seller with at least one order. Each refactored query
carries an inline `# V2 schema:` comment for traceability.

Phase 5 Angle C (sub-blocks C.1 + C.2) closed the deferred ADR-041 sweep
PR :
- `badge` field tightened from `str` to `Literal["new_seller", "active",
  "suspended"]` in app/schemas/analytics.py (sub-block C.1) ; "top_seller"
  dropped per ADR-041 V1.1 deferral. Runtime hard-code `badge="new_seller"`
  preserved (Reputation contract indexer wiring is V2.x).
- `auto_release_days` lifted from literal to `settings.auto_release_days`
  (sub-block C.2) ; default stays 3 (ADR-041 V1 intra-Africa) but V2 can
  override per market segment via env without code change.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.enums import OrderStatus
from app.models.order import USDT_SCALE, Order
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


# V2 OrderStatus mapping (mirrors EtaloEscrow.sol uint8 0..8 — see
# app/models/enums.py). The V1 router targeted lowercase string status
# values that no longer exist; V2 enum values are PascalCase via the
# `(str, Enum)` mixin.
#
# REVENUE_STATUSES — order is fully completed; revenue is finally
# attributable to the seller. V2 has only one finalized state
# (COMPLETED); the V1 set {"delivered", "completed"} collapsed to a
# single value because "Delivered" is no longer a top-level Order
# status (item-level only via ItemStatus.DELIVERED).
REVENUE_STATUSES = {OrderStatus.COMPLETED}

# ESCROW_STATUSES — money is sitting in EtaloEscrow but not yet
# released to the seller. CREATED is excluded (no funds in escrow yet,
# only an order envelope); REFUNDED/CANCELLED/DISPUTED are excluded
# (funds are no longer escrowed for the seller).
ESCROW_STATUSES = {
    OrderStatus.FUNDED,
    OrderStatus.PARTIALLY_SHIPPED,
    OrderStatus.ALL_SHIPPED,
    OrderStatus.PARTIALLY_DELIVERED,
}

# ACTIVE_STATUSES — orders that need seller attention (ship, follow up
# on delivery, etc.). Same set as ESCROW_STATUSES in V2: any order with
# escrowed funds requires attention until COMPLETED or REFUNDED.
ACTIVE_STATUSES = ESCROW_STATUSES


def _raw_to_human(raw: int | Decimal | None) -> Decimal:
    """Convert a BigInteger raw USDT sum (6 decimals) to a human Decimal.
    `func.coalesce(..., 0)` returns 0 (Python int) when the aggregate
    has no rows; SQL SUM otherwise returns a Decimal. Normalise both to
    Decimal so the response always serialises as a JSON string.
    """
    return Decimal(raw or 0) / USDT_SCALE


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
    raw = (
        db.query(func.coalesce(func.sum(Order.total_amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            # V2 schema: `status` (str) → `global_status` (OrderStatus enum).
            Order.global_status.in_(REVENUE_STATUSES),
            # V2 schema: `created_at` → `created_at_chain` (on-chain event
            # timestamp; durable across re-indexes).
            Order.created_at_chain >= since,
        )
        .scalar()
    )
    # V2 schema: amounts stored as raw 6-decimal BigInteger; divide by
    # USDT_SCALE for the human Decimal the schema exposes.
    return _raw_to_human(raw)


def _timeline_7d(db: Session, wallet: str) -> list[TimelinePoint]:
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=6 - i) for i in range(7)]

    rows = (
        db.query(
            # V2 schema: group by chain-event date for stable cross-reindex
            # bucketing.
            func.date(Order.created_at_chain).label("d"),
            func.coalesce(func.sum(Order.total_amount_usdt), 0).label("rev"),
        )
        .filter(
            Order.seller_address == wallet,
            Order.global_status.in_(REVENUE_STATUSES),
            Order.created_at_chain
            >= datetime.now(timezone.utc) - timedelta(days=7),
        )
        .group_by(func.date(Order.created_at_chain))
        .all()
    )
    by_date: dict[date, Decimal] = {r.d: _raw_to_human(r.rev) for r in rows}

    return [
        TimelinePoint(date=d, revenue_usdt=by_date.get(d, Decimal("0")))
        for d in days
    ]


def _top_products(db: Session, wallet: str) -> list[TopProductEntry]:
    """Top 3 products by completed-order revenue.

    V2 schema: `Order.product_id` (single FK) was replaced by
    `Order.product_ids: list[uuid.UUID] | None` (off-chain JSONB-style
    array; one Order can reference 0..N products). Per-item revenue
    attribution would require an OrderItem.product_id FK that V2 does
    not yet model, so this query attributes each Order's full revenue
    to its FIRST product (PostgreSQL 1-indexed `product_ids[1]`). For
    typical single-product carts that's accurate; for multi-product
    carts it concentrates revenue on the leading product, which is the
    least-bad approximation until OrderItem gets a product FK (V2.x).
    """
    # PostgreSQL array indexing is 1-based. SQLAlchemy `arr[1]` returns
    # NULL for NULL or empty arrays, so the filter below keeps the
    # query defensive.
    first_product = Order.product_ids[1].label("pid")

    rows = (
        db.query(
            first_product,
            func.coalesce(func.sum(Order.total_amount_usdt), 0).label("rev"),
        )
        .filter(
            Order.seller_address == wallet,
            Order.global_status.in_(REVENUE_STATUSES),
            Order.product_ids.isnot(None),
            first_product.isnot(None),
        )
        .group_by(first_product)
        .order_by(func.sum(Order.total_amount_usdt).desc())
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
                revenue_usdt=_raw_to_human(row.rev),
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
                score=0,
                badge="new_seller",
                auto_release_days=settings.auto_release_days,
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
            Order.global_status.in_(ACTIVE_STATUSES),
        )
        .scalar()
    ) or 0

    in_escrow = _raw_to_human(
        db.query(func.coalesce(func.sum(Order.total_amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            Order.global_status.in_(ESCROW_STATUSES),
        )
        .scalar()
    )
    released = _raw_to_human(
        db.query(func.coalesce(func.sum(Order.total_amount_usdt), 0))
        .filter(
            Order.seller_address == wallet,
            # V2 schema: `status == "completed"` (lowercase str) →
            # `global_status == OrderStatus.COMPLETED` (PascalCase enum).
            Order.global_status == OrderStatus.COMPLETED,
        )
        .scalar()
    )

    # Reputation indexing lands when the on-chain Reputation contract
    # is wired (V2.x). `auto_release_days` reads from
    # `settings.auto_release_days` (default 3 days, ADR-041 V1 intra-
    # Africa) — env override per market segment ready for V2.
    reputation = ReputationBlock(
        score=0,
        badge="new_seller",
        auto_release_days=settings.auto_release_days,
    )

    return AnalyticsSummary(
        revenue=revenue,
        active_orders=active_orders,
        escrow=EscrowBlock(in_escrow=in_escrow, released=released),
        reputation=reputation,
        top_products=_top_products(db, wallet),
    )
