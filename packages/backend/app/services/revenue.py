"""Treasury revenue report (ADR-059 follow-up).

Aggregates Etalo's three revenue sources from the off-chain mirrors the
indexer already maintains — so even though all three land in the same
Safe on-chain (ADR-024 V1), each is independently traceable:

- commission  : 1.8% on completed orders (`orders`, aligned with /stats —
                realized when the order completes).
- credits     : credit purchases (`seller_credits_ledger`, source=purchase),
                0.15 USDT/credit, with the on-chain tx_hash.
- creation_fee: one-time boutique creation fee (`boutique_billing`),
                1 USDT, with the on-chain tx_hash.

Returns line-item rows (for the detailed CSV) + per-source totals (recap).
Read-only; never writes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.boutique_billing import BoutiqueBilling
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.seller_credits_ledger import SellerCreditsLedger
from app.models.seller_profile import SellerProfile
from app.models.user import User

USDT_SCALE = Decimal(1_000_000)
USDT_PER_CREDIT_RAW = 150_000  # 0.15 USDT (mirrors EtaloCredits.USDT_PER_CREDIT)

# Revenue source labels (CSV `source` column values).
SOURCE_COMMISSION = "commission"
SOURCE_CREDITS = "credits"
SOURCE_CREATION_FEE = "creation_fee"


@dataclass
class RevenueRow:
    date: datetime
    source: str
    amount_usdt: Decimal
    reference: str  # tx_hash or onchain order ref — for on-chain reconciliation
    counterparty: str  # payer wallet (buyer / seller)


def _fmt(amount: Decimal) -> str:
    """USDT amount as a plain decimal string, up to 6 dp, no trailing zeros."""
    return format(amount.quantize(Decimal("0.000001")).normalize(), "f")


async def build_revenue_rows(
    db: AsyncSession,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[RevenueRow], dict[str, dict[str, object]]]:
    """Returns (rows sorted by date, totals-per-source).

    totals: {source: {"count": int, "total_usdt": Decimal}} + a "total" key.
    """
    rows: list[RevenueRow] = []

    # ── 1. Commission — completed orders ───────────────────────
    stmt = select(Order).where(Order.global_status == OrderStatus.COMPLETED)
    for order in (await db.scalars(stmt)).all():
        when = order.funded_at or order.created_at_chain
        if date_from and when < date_from:
            continue
        if date_to and when > date_to:
            continue
        rows.append(
            RevenueRow(
                date=when,
                source=SOURCE_COMMISSION,
                amount_usdt=Decimal(order.total_commission_usdt) / USDT_SCALE,
                reference=f"order#{order.onchain_order_id}",
                counterparty=order.buyer_address,
            )
        )

    # ── 2. Credits — purchases ─────────────────────────────────
    credits_stmt = (
        select(
            SellerCreditsLedger.credits_delta,
            SellerCreditsLedger.tx_hash,
            SellerCreditsLedger.created_at,
            User.wallet_address,
        )
        .join(SellerProfile, SellerCreditsLedger.seller_id == SellerProfile.id)
        .join(User, SellerProfile.user_id == User.id)
        .where(SellerCreditsLedger.source == "purchase")
    )
    for credits_delta, tx_hash, created_at, wallet in (
        await db.execute(credits_stmt)
    ).all():
        if date_from and created_at < date_from:
            continue
        if date_to and created_at > date_to:
            continue
        amount = Decimal(int(credits_delta) * USDT_PER_CREDIT_RAW) / USDT_SCALE
        rows.append(
            RevenueRow(
                date=created_at,
                source=SOURCE_CREDITS,
                amount_usdt=amount,
                reference=tx_hash or "",
                counterparty=wallet,
            )
        )

    # ── 3. Boutique creation fee ───────────────────────────────
    fee_stmt = select(BoutiqueBilling).where(
        BoutiqueBilling.creation_paid_at.is_not(None)
    )
    for row in (await db.scalars(fee_stmt)).all():
        when = row.creation_paid_at
        if date_from and when < date_from:
            continue
        if date_to and when > date_to:
            continue
        rows.append(
            RevenueRow(
                date=when,
                source=SOURCE_CREATION_FEE,
                amount_usdt=Decimal(1),  # CREATION_FEE = 1 USDT
                reference=row.creation_tx_hash or "",
                counterparty=row.wallet_address,
            )
        )

    rows.sort(key=lambda r: r.date)

    # ── Totals per source + grand total ────────────────────────
    totals: dict[str, dict[str, object]] = {}
    for source in (SOURCE_COMMISSION, SOURCE_CREDITS, SOURCE_CREATION_FEE):
        src_rows = [r for r in rows if r.source == source]
        totals[source] = {
            "count": len(src_rows),
            "total_usdt": sum((r.amount_usdt for r in src_rows), Decimal(0)),
        }
    totals["total"] = {
        "count": len(rows),
        "total_usdt": sum((r.amount_usdt for r in rows), Decimal(0)),
    }
    return rows, totals
