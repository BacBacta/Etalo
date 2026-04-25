"""V2 Items router — Sprint J5 Block 6."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.order_item import OrderItem
from app.schemas.order import OrderItemResponse


router = APIRouter(prefix="/items", tags=["items"])


@router.get("/{item_id}", response_model=OrderItemResponse)
async def get_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> OrderItemResponse:
    result = await db.execute(select(OrderItem).where(OrderItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return OrderItemResponse.model_validate(item)


@router.get("/by-onchain-id/{onchain_item_id}", response_model=OrderItemResponse)
async def get_item_by_onchain_id(
    onchain_item_id: int,
    db: AsyncSession = Depends(get_async_db),
) -> OrderItemResponse:
    result = await db.execute(
        select(OrderItem).where(OrderItem.onchain_item_id == onchain_item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return OrderItemResponse.model_validate(item)
