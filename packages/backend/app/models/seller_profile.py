import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SellerProfile(Base):
    __tablename__ = "seller_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    shop_handle: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    shop_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    logo_ipfs_hash: Mapped[str | None] = mapped_column(String(100))
    banner_ipfs_hash: Mapped[str | None] = mapped_column(String(100))
    socials: Mapped[dict | None] = mapped_column(JSONB)  # {"instagram": "...", "whatsapp": "...", "tiktok": "..."}
    categories: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship(back_populates="seller_profile")
    products: Mapped[list["Product"]] = relationship(back_populates="seller")


from app.models.user import User  # noqa: E402, F811
from app.models.product import Product  # noqa: E402, F811
