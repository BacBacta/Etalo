"""V2 Disputes router — Sprint J5 Block 6.

GET endpoints for dispute state. The legacy EIP-191-gated POST
endpoints (photos + messages) were removed per ADR-034 (MiniPay
forbids signed-message auth). Their re-introduction is tracked
under the V2 dispute UI work — see ADR-043 buyer interface scope.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.dispute import Dispute
from app.models.order_item import OrderItem
from app.schemas.dispute import DisputeResponse


router = APIRouter(prefix="/disputes", tags=["disputes"])


# Specific paths declared BEFORE the generic /{dispute_id} so FastAPI
# does not interpret "by-item" / "by-onchain-id" as a UUID.
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


