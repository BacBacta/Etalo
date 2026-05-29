"""Mediator + N3 vote API schemas — ADR-056."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.dispute import DisputeResponse


class MediatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    address: str
    approved: bool
    approved_at: datetime
    removed_at: datetime | None


class DisputeVoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    onchain_vote_id: int
    onchain_dispute_id: int
    deadline: datetime
    for_buyer: int
    for_seller: int
    finalized: bool
    buyer_won: bool | None
    created_at: datetime


class MediatorQueueResponse(BaseModel):
    """What a mediator wallet has to act on: N2 disputes assigned to them
    + open N3 votes they can weigh in on (precise eligibility enforced
    on-chain by submitVote)."""

    assigned_n2: list[DisputeResponse]
    open_votes: list[DisputeVoteResponse]
