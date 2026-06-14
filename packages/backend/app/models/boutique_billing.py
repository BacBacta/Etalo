"""BoutiqueBilling — ADR-059 on-chain mirror.

One row per wallet that has paid the one-time boutique creation fee
(1 USDT) via the EtaloBoutiqueBilling contract. The indexer is the SOLE
writer (CLAUDE.md invariant #14) — it upserts this row from the
`CreationFeePaid(seller, timestamp)` event. Route handlers only READ it
(the onboarding gate checks `creation_paid_at` before creating a
SellerProfile once `FEES_ENFORCED_FROM` has passed).

There is no maintenance/subscription column — ADR-059 dropped the
monthly fee. This table tracks a single one-shot fact per wallet.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BoutiqueBilling(Base):
    __tablename__ = "boutique_billing"

    # Lowercased Celo wallet address (no checksum) — matches the
    # convention used across the mirror tables (handlers call _to_lower).
    wallet_address: Mapped[str] = mapped_column(String(42), primary_key=True)

    # Set when the indexer sees CreationFeePaid for this wallet. NULL
    # means "no creation fee on record" → onboarding is gated once fees
    # are enforced.
    creation_paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Tx hash of the on-chain payment (audit / support trail).
    creation_tx_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
