"""ShortLink — trackable URL shortener for marketing-image captions.

Each generated marketing image embeds a short link (etalo.app/r/{code})
that redirects to the public boutique product page. Tracks click count
so sellers can see which posts converted, and so we can measure
asset-generator ROI in aggregate.

Codes are 8-char URL-safe alphanumeric — collision-resistant up to ~62^8
(~218 trillion) keys, plenty for V1 scale (max 50k packs/month at
saturation).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ShortLink(Base):
    __tablename__ = "short_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False, index=True
    )
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_short_links_code", "code"),
    )
