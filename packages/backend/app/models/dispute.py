"""V2 Dispute model — Sprint J5 Block 3.

Mirrors EtaloDispute.Dispute struct + ADR-022 three-level chain
(N1 amicable → N2 mediation → N3 community vote). Each dispute is
scoped to a single OrderItem (ADR-015 sibling isolation).

Off-chain: photo_ipfs_hashes and conversation are JSONB blobs that
the buyer / seller / mediator can append to via HTTP routes; never
written by the indexer.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import DisputeLevel, DISPUTE_LEVEL_ENUM_NAME
from app.models.order import USDT_SCALE

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.order_item import OrderItem


class Dispute(Base):
    """One dispute on one item. Maps to EtaloDispute.Dispute struct."""

    __tablename__ = "disputes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    onchain_dispute_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
    )

    buyer_address: Mapped[str] = mapped_column(String(42), nullable=False)
    seller_address: Mapped[str] = mapped_column(String(42), nullable=False)

    level: Mapped[DisputeLevel] = mapped_column(
        SAEnum(
            DisputeLevel,
            name=DISPUTE_LEVEL_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=DisputeLevel.N1_AMICABLE,
    )

    # Set by Dispute.assignN2Mediator (admin tx) — null until N2 active
    n2_mediator_address: Mapped[str | None] = mapped_column(String(42))

    # Resolution outcome (set when level transitions to Resolved)
    refund_amount_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    slash_amount_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    favor_buyer: Mapped[bool | None] = mapped_column(Boolean)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Buyer's stated reason (UTF-8 from openDispute calldata)
    reason: Mapped[str | None] = mapped_column(Text)

    # Timestamps
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    n1_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    n2_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # N1 bilateral proposals (set on each resolveN1Amicable call;
    # match triggers _applyResolution)
    buyer_proposal_amount_usdt: Mapped[int | None] = mapped_column(BigInteger)
    seller_proposal_amount_usdt: Mapped[int | None] = mapped_column(BigInteger)

    # N3 vote linkage — populated when escalateToVoting fires
    vote_id: Mapped[int | None] = mapped_column(BigInteger)

    # Off-chain metadata (JSONB)
    photo_ipfs_hashes: Mapped[list[str] | None] = mapped_column(JSONB)
    conversation: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    # --- Relationships ---
    order: Mapped["Order"] = relationship()
    order_item: Mapped["OrderItem"] = relationship()

    __table_args__ = (
        CheckConstraint(
            "buyer_address ~ '^0x[0-9a-f]{40}$'", name="disputes_buyer_address_lowercase_hex"
        ),
        CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'", name="disputes_seller_address_lowercase_hex"
        ),
        CheckConstraint(
            "n2_mediator_address IS NULL OR n2_mediator_address ~ '^0x[0-9a-f]{40}$'",
            name="disputes_n2_mediator_address_lowercase_hex",
        ),
        Index("ix_disputes_order_id", "order_id"),
        Index("ix_disputes_order_item_id", "order_item_id"),
        Index("ix_disputes_level", "level"),
        Index("ix_disputes_resolved", "resolved"),
    )

    # --- Helpers ---
    @property
    def refund_amount_human(self) -> Decimal:
        return Decimal(self.refund_amount_usdt) / USDT_SCALE

    @property
    def slash_amount_human(self) -> Decimal:
        return Decimal(self.slash_amount_usdt) / USDT_SCALE
