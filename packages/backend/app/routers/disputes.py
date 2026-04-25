"""V2 Disputes router — Sprint J5 Block 6.

GET endpoints for dispute state. POST endpoints append off-chain
evidence (photos, conversation messages) — gated by EIP-191
signature; caller must be buyer or seller of the dispute.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_signature
from app.database import get_async_db
from app.models.dispute import Dispute
from app.models.order_item import OrderItem
from app.schemas.dispute import (
    DisputeMessageCreate,
    DisputePhotoCreate,
    DisputeResponse,
)


router = APIRouter(prefix="/disputes", tags=["disputes"])


@router.get("/{dispute_id}", response_model=DisputeResponse)
async def get_dispute(
    dispute_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> DisputeResponse:
    result = await db.execute(select(Dispute).where(Dispute.id == dispute_id))
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return DisputeResponse.model_validate(dispute)


@router.get("/by-onchain-id/{onchain_dispute_id}", response_model=DisputeResponse)
async def get_dispute_by_onchain_id(
    onchain_dispute_id: int,
    db: AsyncSession = Depends(get_async_db),
) -> DisputeResponse:
    result = await db.execute(
        select(Dispute).where(Dispute.onchain_dispute_id == onchain_dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return DisputeResponse.model_validate(dispute)


@router.get("/by-item", response_model=DisputeResponse)
async def get_dispute_by_item(
    order_id: uuid.UUID = Query(...),
    item_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_async_db),
) -> DisputeResponse:
    result = await db.execute(
        select(Dispute).where(
            (Dispute.order_id == order_id) & (Dispute.order_item_id == item_id)
        )
    )
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found for this item")
    return DisputeResponse.model_validate(dispute)


async def _load_dispute_for_writer(
    db: AsyncSession, dispute_id: uuid.UUID, caller: str
) -> Dispute:
    """Load dispute + check that `caller` is the buyer or seller."""
    result = await db.execute(select(Dispute).where(Dispute.id == dispute_id))
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if caller != dispute.buyer_address and caller != dispute.seller_address:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only buyer or seller can append to dispute metadata",
        )
    return dispute


@router.post("/{dispute_id}/photos", response_model=DisputeResponse)
async def add_dispute_photo(
    dispute_id: uuid.UUID,
    body: DisputePhotoCreate,
    db: AsyncSession = Depends(get_async_db),
    caller: str = Depends(verify_signature),
) -> DisputeResponse:
    dispute = await _load_dispute_for_writer(db, dispute_id, caller)
    photos = list(dispute.photo_ipfs_hashes or [])
    if body.ipfs_hash not in photos:
        photos.append(body.ipfs_hash)
        dispute.photo_ipfs_hashes = photos
    await db.commit()
    await db.refresh(dispute)
    return DisputeResponse.model_validate(dispute)


@router.post("/{dispute_id}/messages", response_model=DisputeResponse)
async def add_dispute_message(
    dispute_id: uuid.UUID,
    body: DisputeMessageCreate,
    db: AsyncSession = Depends(get_async_db),
    caller: str = Depends(verify_signature),
) -> DisputeResponse:
    dispute = await _load_dispute_for_writer(db, dispute_id, caller)
    convo = list(dispute.conversation or [])
    convo.append(
        {
            "address": caller,
            "message": body.message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    dispute.conversation = convo
    await db.commit()
    await db.refresh(dispute)
    return DisputeResponse.model_validate(dispute)
