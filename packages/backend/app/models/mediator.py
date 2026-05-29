"""V2 Mediator whitelist — ADR-056.

Mirrors EtaloDispute `isMediatorApproved` / `_mediatorsList`. One row per
mediator address (PK = lowercased). The indexer is the sole writer
(MediatorApproved event). Drives the wallet-gated mediator console.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Mediator(Base):
    """Approved N2/N3 mediator. PK on lowercased address."""

    __tablename__ = "mediators"

    address: Mapped[str] = mapped_column(String(42), primary_key=True)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    approved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
