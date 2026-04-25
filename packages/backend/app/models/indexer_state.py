"""Indexer checkpoint — one row per contract tracking the last
processed block number. The indexer reads this on each cycle to
know where to resume from.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IndexerState(Base):
    __tablename__ = "indexer_state"

    contract_name: Mapped[str] = mapped_column(String(50), primary_key=True)
    last_processed_block: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
