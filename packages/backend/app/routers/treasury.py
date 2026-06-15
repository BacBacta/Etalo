"""Treasury revenue endpoints (ADR-059 follow-up).

Owner-only revenue traceability: a detailed CSV export + a JSON recap
of the three revenue sources (commission / credits / boutique creation
fee). Gated on an allowlist of wallet addresses (the Safe + its owners,
`settings.treasury_admin_set`) via the V1 X-Wallet-Address posture
(ADR-046 / ADR-036 — no new EIP-191 per ADR-034).

Read-only over the indexer mirrors; never writes on-chain-derived state
(invariant #14).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_db
from app.dependencies.wallet_auth import get_current_wallet
from app.services.revenue import build_revenue_rows

router = APIRouter(prefix="/treasury", tags=["treasury"])


def require_treasury_admin(
    wallet: Annotated[str, Depends(get_current_wallet)],
) -> str:
    """Allow only treasury-admin wallets (Safe + owners). 403 otherwise."""
    if wallet.lower() not in settings.treasury_admin_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorised for treasury reports.",
        )
    return wallet


def _fmt(amount) -> str:
    from app.services.revenue import _fmt as fmt  # reuse the formatter

    return fmt(amount)


@router.get("/revenue/summary")
async def revenue_summary(
    _admin: Annotated[str, Depends(require_treasury_admin)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> dict:
    """JSON recap — per-source counts + totals for the treasury dashboard tiles."""
    _, totals = await build_revenue_rows(db, date_from=date_from, date_to=date_to)
    return {
        "from": date_from.isoformat() if date_from else None,
        "to": date_to.isoformat() if date_to else None,
        "sources": {
            source: {
                "count": data["count"],
                "total_usdt": _fmt(data["total_usdt"]),
            }
            for source, data in totals.items()
        },
    }


@router.get("/revenue.csv")
async def revenue_csv(
    _admin: Annotated[str, Depends(require_treasury_admin)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> Response:
    """Detailed CSV: one row per revenue event + a trailing recap block.

    Columns: date, source, amount_usdt, reference, counterparty.
    `reference` is the on-chain tx_hash (credits / creation fee) or the
    order ref (commission) for reconciliation against the Safe's inflows.
    """
    rows, totals = await build_revenue_rows(
        db, date_from=date_from, date_to=date_to
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "source", "amount_usdt", "reference", "counterparty"])
    for r in rows:
        writer.writerow(
            [
                r.date.astimezone(timezone.utc).isoformat(),
                r.source,
                _fmt(r.amount_usdt),
                r.reference,
                r.counterparty,
            ]
        )

    # Recap block (blank line separator so spreadsheets keep it readable).
    writer.writerow([])
    writer.writerow(["summary_source", "count", "total_usdt"])
    for source in ("commission", "credits", "creation_fee", "total"):
        data = totals[source]
        writer.writerow([source, data["count"], _fmt(data["total_usdt"])])

    today = datetime.now(timezone.utc).date().isoformat()
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="etalo-revenue-{today}.csv"'
        },
    )
