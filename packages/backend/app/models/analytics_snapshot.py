import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seller_address: Mapped[str] = mapped_column(String(42), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    orders_total: Mapped[int] = mapped_column(Integer, default=0)
    orders_completed: Mapped[int] = mapped_column(Integer, default=0)
    orders_disputed: Mapped[int] = mapped_column(Integer, default=0)
    revenue_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0)
    commission_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0)
    avg_delivery_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_analytics_seller_date", "seller_address", "snapshot_date", unique=True),
    )
