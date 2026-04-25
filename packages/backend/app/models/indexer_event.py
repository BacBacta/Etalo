"""Indexer idempotency log — one row per processed event.

UNIQUE (tx_hash, log_index) prevents double-processing on:
- reorg-driven re-reads (last 3 blocks polled twice on subsequent cycles)
- indexer restart that re-fetches blocks bracketing last_processed_block

The handler dispatcher checks for existing rows BEFORE applying
state changes; if found, the event is skipped.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


from app.database import Base


class IndexerEvent(Base):
    __tablename__ = "indexer_events_processed"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tx_hash: Mapped[str] = mapped_column(String(66), nullable=False)
    log_index: Mapped[int] = mapped_column(Integer, nullable=False)
    contract_name: Mapped[str] = mapped_column(String(50), nullable=False)
    event_name: Mapped[str] = mapped_column(String(50), nullable=False)
    block_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        # Composite unique constraint = our idempotency guard.
        # Each (tx, log_index) pair is unique on-chain, so this also
        # serves as the natural key.
        Index(
            "uq_indexer_events_tx_log",
            "tx_hash",
            "log_index",
            unique=True,
        ),
        Index("ix_indexer_events_block_number", "block_number"),
        CheckConstraint(
            "tx_hash ~ '^0x[0-9a-f]{64}$'", name="indexer_events_tx_hash_lowercase_hex"
        ),
    )
