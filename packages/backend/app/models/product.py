import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seller_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seller_profiles.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    price_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    stock: Mapped[int] = mapped_column(SmallInteger, default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft, active, paused, deleted
    metadata_ipfs_hash: Mapped[str | None] = mapped_column(String(100))
    image_ipfs_hashes: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)))
    category: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    seller: Mapped["SellerProfile"] = relationship(back_populates="products")
    marketing_images: Mapped[list["MarketingImage"]] = relationship(
        back_populates="product"
    )

    __table_args__ = (
        Index("ix_products_status", "status"),
        UniqueConstraint("seller_id", "slug", name="uq_products_seller_slug"),
    )


from app.models.seller_profile import SellerProfile  # noqa: E402, F811
from app.models.marketing_image import MarketingImage  # noqa: E402, F811
