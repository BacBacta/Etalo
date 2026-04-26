"""MarketingImage model — Sprint J7 Block 6.

One row per generated marketing image. Persisted by the
/marketing/generate-image endpoint after a successful render+pin and
before the credit consumption ledger entry. Linked from
SellerCreditsLedger.image_id (1:1 for image_consumption rows).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.seller_profile import SellerProfile


class MarketingImage(Base):
    __tablename__ = "marketing_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seller_profiles.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    template: Mapped[str] = mapped_column(String(20), nullable=False)
    caption_lang: Mapped[str] = mapped_column(String(2), nullable=False)
    ipfs_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    image_url: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    seller: Mapped["SellerProfile"] = relationship(back_populates="marketing_images")
    product: Mapped["Product"] = relationship(back_populates="marketing_images")

    __table_args__ = (
        Index("ix_marketing_images_seller_id", "seller_id"),
        Index("ix_marketing_images_product_id", "product_id"),
        Index("ix_marketing_images_created_at", "created_at"),
    )
