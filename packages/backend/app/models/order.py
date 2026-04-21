import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    onchain_order_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    buyer_address: Mapped[str] = mapped_column(String(42), nullable=False)
    seller_address: Mapped[str] = mapped_column(String(42), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    amount_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    commission_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    # created, funded, shipped, delivered, completed, disputed, refunded, cancelled
    is_cross_border: Mapped[bool] = mapped_column(Boolean, default=False)
    milestones_total: Mapped[int] = mapped_column(default=1)
    milestones_released: Mapped[int] = mapped_column(default=0)
    delivery_address: Mapped[str | None] = mapped_column(Text)
    tracking_number: Mapped[str | None] = mapped_column(String(100))
    tx_hash: Mapped[str | None] = mapped_column(String(66))  # creation tx
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_orders_status", "status"),
        Index("ix_orders_buyer", "buyer_address"),
        Index("ix_orders_seller", "seller_address"),
    )
