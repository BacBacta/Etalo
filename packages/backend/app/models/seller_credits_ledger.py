"""SellerCreditsLedger — Sprint J7 Block 6.

Off-chain credits ledger per ADR-037 hybrid system. Balance is the
signed sum of credits_delta over all rows for a given seller_id.

Sources (string enum, kept loose to allow V1.5+ extensions without
migration):
- "purchase"          credits_delta=+N, tx_hash set, image_id null.
                      Mirrored from EtaloCredits.CreditsPurchased event
                      by the indexer.
- "welcome_bonus"     credits_delta=+10, tx_hash null, image_id null.
                      Granted lazily on the first credits-aware action
                      a seller takes (balance read or generate-image).
- "monthly_free"      credits_delta=+5, tx_hash null, image_id null.
                      Granted lazily, at most once per calendar month.
- "image_consumption" credits_delta=-1, tx_hash null, image_id set.
                      Written when /marketing/generate-image succeeds.

Idempotency for indexed events: the (tx_hash, source) UniqueConstraint
catches duplicate inserts (defense-in-depth — the indexer dispatcher
already gates on (tx_hash, log_index) before invoking handlers).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.marketing_image import MarketingImage
    from app.models.seller_profile import SellerProfile


CREDITS_LEDGER_SOURCES = (
    "purchase",
    "welcome_bonus",
    "monthly_free",
    "image_consumption",
)


class SellerCreditsLedger(Base):
    __tablename__ = "seller_credits_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seller_profiles.id"), nullable=False
    )
    credits_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    image_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketing_images.id"), nullable=True
    )
    tx_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    seller: Mapped["SellerProfile"] = relationship(back_populates="credits_ledger")
    image: Mapped["MarketingImage | None"] = relationship()

    __table_args__ = (
        UniqueConstraint("tx_hash", "source", name="uq_credits_tx_source"),
        CheckConstraint(
            "source IN ('purchase','welcome_bonus','monthly_free','image_consumption')",
            name="ck_credits_source_valid",
        ),
        Index("ix_credits_seller_id", "seller_id"),
        Index("ix_credits_created_at", "created_at"),
        Index("ix_credits_seller_source_created", "seller_id", "source", "created_at"),
    )
