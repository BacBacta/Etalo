"""V2 ReputationCache model — Sprint J5 Block 3.

Mirrors EtaloReputation.SellerReputation struct (9 fields). One row
per seller. The indexer updates this table on OrderRecorded and
DisputeRecorded events from EtaloReputation (Block 5). ADR-030's
sole-authority rule means these events have exactly one origin per
type — no risk of duplicate updates.

`first_order_at` is required for the ADR-020 Tier 2 eligibility
check (60 days seniority + ≥ 10 completed orders).

`score` defaults to 50 to mirror the V1 backend convention; the
indexer's first sync replaces it with the on-chain value.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import SellerStatus, SELLER_STATUS_ENUM_NAME
from app.models.order import USDT_SCALE


class ReputationCache(Base):
    """Per-seller reputation snapshot, indexed from EtaloReputation events."""

    __tablename__ = "reputation_cache"

    seller_address: Mapped[str] = mapped_column(String(42), primary_key=True)

    orders_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orders_disputed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disputes_lost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    total_volume_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    is_top_seller: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    status: Mapped[SellerStatus] = mapped_column(
        SAEnum(
            SellerStatus,
            name=SELLER_STATUS_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=SellerStatus.ACTIVE,
    )

    last_sanction_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_order_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'",
            name="reputation_cache_seller_address_lowercase_hex",
        ),
        CheckConstraint("orders_completed >= 0", name="reputation_cache_orders_completed_non_negative"),
        CheckConstraint("orders_disputed >= 0", name="reputation_cache_orders_disputed_non_negative"),
        CheckConstraint("disputes_lost >= 0", name="reputation_cache_disputes_lost_non_negative"),
        CheckConstraint("total_volume_usdt >= 0", name="reputation_cache_total_volume_non_negative"),
        Index("ix_reputation_cache_is_top_seller", "is_top_seller"),
        Index("ix_reputation_cache_status", "status"),
        Index("ix_reputation_cache_score", "score"),  # ranking queries
    )

    # --- Helpers ---
    @property
    def total_volume_human(self) -> Decimal:
        return Decimal(self.total_volume_usdt) / USDT_SCALE
