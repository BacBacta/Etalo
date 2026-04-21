import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DisputeMetadata(Base):
    __tablename__ = "dispute_metadata"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), unique=True, nullable=False)
    onchain_order_id: Mapped[int | None] = mapped_column()
    level: Mapped[str] = mapped_column(String(20), default="L1")  # L1, L2, L3
    issue_type: Mapped[str | None] = mapped_column(String(50))  # defective, not_received, not_as_described, fraud
    reason: Mapped[str | None] = mapped_column(Text)
    photo_ipfs_hashes: Mapped[list[str] | None] = mapped_column(JSONB)
    conversation: Mapped[dict | None] = mapped_column(JSONB)  # [{sender, message, timestamp}, ...]
    mediator_address: Mapped[str | None] = mapped_column(String(42))
    resolution: Mapped[str | None] = mapped_column(String(50))  # refund_full, refund_partial, seller_wins
    refund_amount_usdt: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
