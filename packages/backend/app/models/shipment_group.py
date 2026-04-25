"""V2 ShipmentGroup model — Sprint J5 Block 2.

Mirrors EtaloEscrow.sol ShipmentGroup struct. A group bundles 1-N
items shipped under a single proof-of-shipment, progressing through
Pending → Shipped → Arrived → Delivered. Cross-border releases (per
ADR-018) attach to the group: 20% on Shipped, 70% at majority release
72h post-Arrived, 10% on confirm or 5d after majority.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    LargeBinary,
    SmallInteger,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ShipmentStatus, SHIPMENT_STATUS_ENUM_NAME

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.order_item import OrderItem


class ShipmentGroup(Base):
    """A V2 shipment group within an Order. Maps to EtaloEscrow.ShipmentGroup struct."""

    __tablename__ = "shipment_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    onchain_group_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[ShipmentStatus] = mapped_column(
        SAEnum(
            ShipmentStatus,
            name=SHIPMENT_STATUS_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=ShipmentStatus.PENDING,
    )

    # Proof hashes are bytes32 on-chain — store as raw bytes (32-byte length
    # enforced at indexer write time, not at the column level).
    proof_hash: Mapped[bytes | None] = mapped_column(LargeBinary)
    arrival_proof_hash: Mapped[bytes | None] = mapped_column(LargeBinary)

    # 0=pending, 1=20%-shipped released, 2=arrived/majority queued,
    # 3=final released. Mirrors EtaloEscrow.ShipmentGroup.releaseStage.
    release_stage: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    majority_release_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    final_release_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    order: Mapped["Order"] = relationship(back_populates="shipment_groups")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="shipment_group",
        order_by="OrderItem.item_index",
    )

    __table_args__ = (
        Index("ix_shipment_groups_order_id", "order_id"),
        Index("ix_shipment_groups_status", "status"),
    )
