"""V2 Dispute vote (N3) — ADR-056.

Mirrors EtaloVoting's per-dispute community vote. One row per on-chain
voteId. The indexer is the sole writer (VoteCreated / VoteSubmitted /
VoteFinalized). Drives the N3 voting console + the buyer/seller N3 status
surface.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DisputeVote(Base):
    """One N3 community vote on one dispute. PK on the on-chain voteId."""

    __tablename__ = "dispute_votes"

    onchain_vote_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    onchain_dispute_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    for_buyer: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    for_seller: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    buyer_won: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        Index("ix_dispute_votes_onchain_dispute_id", "onchain_dispute_id"),
    )
