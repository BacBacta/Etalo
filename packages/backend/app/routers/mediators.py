"""Mediator (N2/N3) read endpoints — ADR-056.

Read-only views over the indexer-maintained mirror that back the
wallet-gated mediator console. All actions (resolveN2Mediation,
submitVote, finalizeVote) are on-chain txs from the mediator's wallet —
this router never mutates state.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.dispute import Dispute
from app.models.dispute_vote import DisputeVote
from app.models.enums import DisputeLevel
from app.models.mediator import Mediator
from app.schemas.dispute import DisputeResponse
from app.schemas.mediator import (
    DisputeVoteResponse,
    MediatorQueueResponse,
    MediatorResponse,
)


router = APIRouter(prefix="/mediators", tags=["mediators"])


@router.get("", response_model=list[MediatorResponse])
async def list_mediators(
    db: AsyncSession = Depends(get_async_db),
) -> list[MediatorResponse]:
    """Currently-approved mediator whitelist (mirrors isMediatorApproved)."""
    result = await db.execute(select(Mediator).where(Mediator.approved.is_(True)))
    return [MediatorResponse.model_validate(m) for m in result.scalars().all()]


@router.get("/{address}/queue", response_model=MediatorQueueResponse)
async def mediator_queue(
    address: str,
    db: AsyncSession = Depends(get_async_db),
) -> MediatorQueueResponse:
    """Work queue for a mediator wallet: open N2 disputes assigned to it +
    open N3 votes it can weigh in on."""
    addr = address.lower()

    n2_result = await db.execute(
        select(Dispute).where(
            (Dispute.n2_mediator_address == addr)
            & (Dispute.level == DisputeLevel.N2_MEDIATION)
            & (Dispute.resolved.is_(False))
        )
    )
    assigned_n2 = [DisputeResponse.model_validate(d) for d in n2_result.scalars().all()]

    # Open votes for disputes where this address was NOT the N2 mediator
    # (N3 voter list excludes the N2 mediator). submitVote enforces the
    # exact per-vote eligibility on-chain.
    votes_result = await db.execute(
        select(DisputeVote)
        .join(
            Dispute,
            Dispute.onchain_dispute_id == DisputeVote.onchain_dispute_id,
        )
        .where(
            (DisputeVote.finalized.is_(False))
            & (
                (Dispute.n2_mediator_address.is_(None))
                | (Dispute.n2_mediator_address != addr)
            )
        )
    )
    open_votes = [
        DisputeVoteResponse.model_validate(v) for v in votes_result.scalars().all()
    ]

    return MediatorQueueResponse(assigned_n2=assigned_n2, open_votes=open_votes)
