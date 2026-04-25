"""V2 OrderItem model — Sprint J5 Block 2.

Mirrors EtaloEscrow.sol Item struct (ADR-015 item-level granularity).
Each Item belongs to one Order and at most one ShipmentGroup.
Disputes are scoped to items, not orders, so per-item status tracking
matters.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ItemStatus, ITEM_STATUS_ENUM_NAME
from app.models.order import USDT_SCALE

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.shipment_group import ShipmentGroup


class OrderItem(Base):
    """One item within a V2 Order. Maps to EtaloEscrow.Item struct."""

    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    onchain_item_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_index: Mapped[int] = mapped_column(
        SmallInteger, nullable=False
    )  # 0-based position within order

    item_price_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False)
    item_commission_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False)

    status: Mapped[ItemStatus] = mapped_column(
        SAEnum(
            ItemStatus,
            name=ITEM_STATUS_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ItemStatus.PENDING,
    )

    shipment_group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shipment_groups.id", ondelete="SET NULL"),
    )

    # Cumulative net amount released to seller for this item (per ADR-018
    # progressive release). Stored in USDT smallest unit.
    released_amount_usdt: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )

    # --- Relationships ---
    order: Mapped["Order"] = relationship(back_populates="items")
    shipment_group: Mapped["ShipmentGroup | None"] = relationship(
        back_populates="items"
    )

    __table_args__ = (
        UniqueConstraint("order_id", "item_index", name="uq_order_items_order_index"),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_shipment_group_id", "shipment_group_id"),
        Index("ix_order_items_status", "status"),
    )

    # --- Helpers ---
    @property
    def item_price_human(self) -> Decimal:
        return Decimal(self.item_price_usdt) / USDT_SCALE

    @property
    def item_commission_human(self) -> Decimal:
        return Decimal(self.item_commission_usdt) / USDT_SCALE

    @property
    def released_amount_human(self) -> Decimal:
        return Decimal(self.released_amount_usdt) / USDT_SCALE
