"""V2 Order model — Sprint J5 Block 2.

Mirrors EtaloEscrow.sol Order struct (ADR-015) with off-chain
metadata (delivery address, tracking, product references) layered
on top. The indexer is the canonical writer; HTTP routes only edit
the off-chain metadata fields.

USDT amounts are stored as BIGINT representing the smallest unit
(6 decimals). Conversion helpers expose human-readable Decimal.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Index,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import OrderStatus, ORDER_STATUS_ENUM_NAME

if TYPE_CHECKING:
    from app.models.order_item import OrderItem
    from app.models.shipment_group import ShipmentGroup
    from app.models.user import User


# 1 USDT = 1_000_000 raw (6 decimals)
USDT_DECIMALS = 6
USDT_SCALE = Decimal(10) ** USDT_DECIMALS


class Order(Base):
    """V2 order — one buyer, one seller, 1-50 items grouped in 0-N shipment groups."""

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    onchain_order_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False
    )

    buyer_address: Mapped[str] = mapped_column(String(42), nullable=False)
    seller_address: Mapped[str] = mapped_column(String(42), nullable=False)

    total_amount_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_commission_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False)

    is_cross_border: Mapped[bool] = mapped_column(Boolean, nullable=False)
    global_status: Mapped[OrderStatus] = mapped_column(
        SAEnum(
            OrderStatus,
            name=ORDER_STATUS_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=OrderStatus.CREATED,
    )
    item_count: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    funded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at_chain: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at_db: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # --- Off-chain metadata (writable by HTTP, never by indexer) ---
    delivery_address: Mapped[str | None] = mapped_column(Text)
    tracking_number: Mapped[str | None] = mapped_column(String(100))
    product_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    notes: Mapped[str | None] = mapped_column(Text)

    # --- Relationships ---
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.item_index",
    )
    shipment_groups: Mapped[list["ShipmentGroup"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="ShipmentGroup.onchain_group_id",
    )

    # Viewonly join Order.seller_address → User.wallet_address (no FK on
    # purpose: orders are written by the indexer from on-chain events and
    # may exist before the seller has onboarded an off-chain User row).
    # ADR-043 / J11.5 Block 1 — exposes seller_handle without raw 0x in UI
    # (CLAUDE.md rule 5). Routes returning OrderResponse must eager-load
    # this chain : selectinload(Order.seller).selectinload(User.seller_profile).
    seller: Mapped["User | None"] = relationship(
        "User",
        primaryjoin="foreign(Order.seller_address) == User.wallet_address",
        viewonly=True,
        uselist=False,
        lazy="raise",
    )

    __table_args__ = (
        CheckConstraint(
            "buyer_address ~ '^0x[0-9a-f]{40}$'", name="orders_buyer_address_lowercase_hex"
        ),
        CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'", name="orders_seller_address_lowercase_hex"
        ),
        CheckConstraint("item_count BETWEEN 1 AND 50", name="orders_item_count_range"),
        Index("ix_orders_buyer_address", "buyer_address"),
        Index("ix_orders_seller_address", "seller_address"),
        Index("ix_orders_global_status", "global_status"),
        Index("ix_orders_created_at_chain", "created_at_chain"),
    )

    # --- Helpers ---
    @property
    def total_amount_human(self) -> Decimal:
        """USDT amount in human-readable Decimal."""
        return Decimal(self.total_amount_usdt) / USDT_SCALE

    @property
    def total_commission_human(self) -> Decimal:
        return Decimal(self.total_commission_usdt) / USDT_SCALE

    @property
    def seller_handle(self) -> str | None:
        """Shop handle of the seller, derived via Order.seller_address →
        User.wallet_address → SellerProfile.shop_handle. Returns None if
        the seller has not onboarded a SellerProfile yet. Requires the
        `seller` + `seller_profile` chain to be eager-loaded ; lazy="raise"
        on the seller relationship enforces this at query time.
        """
        if self.seller is None or self.seller.seller_profile is None:
            return None
        return self.seller.seller_profile.shop_handle
