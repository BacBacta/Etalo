"""Delivery address book — Sprint J11.7 Block 1 (ADR-044).

Buyer-side address book. One User (buyer) → many DeliveryAddress rows.
Address becomes immutable on `fundOrder` via the `delivery_address_snapshot`
JSONB column on Order — preserves the address used for the order even
if the buyer later edits or deletes the row from their book.

Country uses ISO 3166-1 alpha-3 codes (NGA/GHA/KEN) per ADR-045 V1
3-country scope; CheckConstraint enforces the enum at DB level.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class DeliveryAddress(Base):
    __tablename__ = "delivery_addresses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    country: Mapped[str] = mapped_column(String(3), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    address_line: Mapped[str] = mapped_column(Text, nullable=False)
    landmark: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="delivery_addresses")

    __table_args__ = (
        CheckConstraint(
            "country IN ('NGA', 'GHA', 'KEN')",
            name="delivery_addresses_country_iso_alpha3",
        ),
        Index("ix_delivery_addresses_user_default", "user_id", "is_default"),
    )
