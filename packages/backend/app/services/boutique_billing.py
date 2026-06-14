"""Boutique creation-fee gating (ADR-059).

The on-chain `EtaloBoutiqueBilling.payCreationFee()` payment is mirrored
into `boutique_billing` by the indexer. This module is the off-chain
policy layer that decides whether a wallet may open a boutique:

- The Proof-of-Ship free window is a single config date,
  `FEES_ENFORCED_FROM`. While `now < FEES_ENFORCED_FROM`, creation is
  free and the contract is never called. An empty/unset value means
  "fees not yet enforced" (free indefinitely) — the safe default so we
  never charge by accident before Mike sets the launch date.
- Once enforced, a wallet must have a `boutique_billing` row with
  `creation_paid_at` set (mirrored from CreationFeePaid) to pass the
  onboarding gate.

Kept deliberately tiny and dependency-light so both the sync onboarding
route (Session) and tests can call it. There is NO maintenance/
subscription logic — ADR-059 dropped the monthly fee.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.boutique_billing import BoutiqueBilling

# Surfaced to the client so the UI can show the exact amount without
# hardcoding it in two places. Mirrors the contract's CREATION_FEE.
CREATION_FEE_USDT = "1"


def fees_enforced(now: datetime | None = None) -> bool:
    """True when the boutique creation fee is in effect (the Proof-of-Ship
    free window has elapsed). Empty config → not enforced (free)."""
    raw = (settings.fees_enforced_from or "").strip()
    if not raw:
        return False
    enforced_from = datetime.fromisoformat(raw)
    if enforced_from.tzinfo is None:
        enforced_from = enforced_from.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    return now >= enforced_from


def has_paid_creation_fee(db: Session, wallet: str) -> bool:
    """Whether `wallet` has an on-chain creation-fee payment on record."""
    row = (
        db.query(BoutiqueBilling)
        .filter(BoutiqueBilling.wallet_address == wallet.lower())
        .one_or_none()
    )
    return row is not None and row.creation_paid_at is not None


def require_creation_fee_paid(db: Session, wallet: str) -> None:
    """Onboarding gate. No-op during the free window; otherwise raises
    402 `creation_fee_required` when the wallet has not paid. The client
    reads the code + fee and routes the seller to the on-chain payment
    before retrying."""
    if not fees_enforced():
        return
    if has_paid_creation_fee(db, wallet):
        return
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "creation_fee_required",
            "fee_usdt": CREATION_FEE_USDT,
            "message": (
                "A one-time boutique creation fee is required. Pay it on-chain, "
                "then retry."
            ),
        },
    )
