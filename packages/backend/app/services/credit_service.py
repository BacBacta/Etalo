"""Credit service — Sprint J7 Block 6.

Off-chain ledger operations for the hybrid credits system (ADR-037).
Balance is computed as SUM(credits_delta) over all rows for a given
seller. The ledger is the source of truth; on-chain CreditsPurchased
events are mirrored into it by the indexer.

The service performs its own commits — call sites must use a fresh
session (e.g. via the get_async_db FastAPI dependency) and not pass a
session that owns a wider transaction. The lazy-grant helpers
(welcome / monthly_free) are idempotent and safe to invoke on every
balance read.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seller_credits_ledger import SellerCreditsLedger

logger = logging.getLogger(__name__)

WELCOME_BONUS_CREDITS = 10
MONTHLY_FREE_CREDITS = 5


class InsufficientCreditsError(Exception):
    """Raised when consume_credits is called with balance < amount."""

    def __init__(self, needed: int, available: int) -> None:
        self.needed = needed
        self.available = available
        super().__init__(
            f"Insufficient credits: need {needed}, have {available}"
        )


async def get_balance(seller_id: UUID, db: AsyncSession) -> int:
    """Sum of credits_delta for the seller. Returns 0 if no rows."""
    result = await db.scalar(
        select(func.coalesce(func.sum(SellerCreditsLedger.credits_delta), 0)).where(
            SellerCreditsLedger.seller_id == seller_id
        )
    )
    return int(result or 0)


async def grant_welcome_bonus_if_first(
    seller_id: UUID, db: AsyncSession
) -> int:
    """Grant the WELCOME_BONUS_CREDITS-credit bonus once, on the seller's
    first credits-aware action. Returns the number of credits granted
    (WELCOME_BONUS_CREDITS or 0). Idempotent: relies on "no ledger row
    yet" as the trigger, so repeated calls after any other entry exists
    are no-ops.
    """
    existing = await db.scalar(
        select(SellerCreditsLedger.id)
        .where(SellerCreditsLedger.seller_id == seller_id)
        .limit(1)
    )
    if existing is not None:
        return 0

    db.add(
        SellerCreditsLedger(
            seller_id=seller_id,
            credits_delta=WELCOME_BONUS_CREDITS,
            source="welcome_bonus",
        )
    )
    await db.commit()
    return WELCOME_BONUS_CREDITS


async def ensure_monthly_free_granted(
    seller_id: UUID, db: AsyncSession
) -> int:
    """Grant the MONTHLY_FREE_CREDITS-credit free pack at most once per
    calendar UTC month. Returns the number of credits granted
    (MONTHLY_FREE_CREDITS or 0)."""
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    existing = await db.scalar(
        select(SellerCreditsLedger.id)
        .where(
            SellerCreditsLedger.seller_id == seller_id,
            SellerCreditsLedger.source == "monthly_free",
            SellerCreditsLedger.created_at >= month_start,
        )
        .limit(1)
    )
    if existing is not None:
        return 0

    db.add(
        SellerCreditsLedger(
            seller_id=seller_id,
            credits_delta=MONTHLY_FREE_CREDITS,
            source="monthly_free",
        )
    )
    await db.commit()
    return MONTHLY_FREE_CREDITS


async def consume_credits(
    seller_id: UUID,
    db: AsyncSession,
    *,
    amount: int = 1,
    image_id: UUID | None = None,
) -> int:
    """Atomically: ensure the monthly free is granted, check balance,
    write a negative ledger entry. Returns the new balance.

    Raises InsufficientCreditsError if the post-grant balance is below
    `amount` (the entry is NOT written in that case).
    """
    if amount < 1:
        raise ValueError("amount must be >= 1")

    await ensure_monthly_free_granted(seller_id, db)

    balance = await get_balance(seller_id, db)
    if balance < amount:
        raise InsufficientCreditsError(needed=amount, available=balance)

    db.add(
        SellerCreditsLedger(
            seller_id=seller_id,
            credits_delta=-amount,
            source="image_consumption",
            image_id=image_id,
        )
    )
    await db.commit()
    return balance - amount
