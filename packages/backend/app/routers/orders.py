"""V2 Orders router — Sprint J5 Block 6.

GET endpoints read from the indexer-populated DB. POST /metadata
writes off-chain fields (delivery, tracking, notes) — gated by
EIP-191 signature where the recovered address must be the buyer or
seller of the order.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import verify_signature
from app.database import get_async_db
from app.models.enums import OrderStatus
from app.models.order import Order
from app.schemas.order import (
    OrderItemResponse,
    OrderListResponse,
    OrderMetadataUpdate,
    OrderResponse,
    ShipmentGroupResponse,
)


router = APIRouter(prefix="/orders", tags=["orders"])


def _normalize(addr: str | None) -> str | None:
    return addr.lower() if addr else None


@router.get("", response_model=OrderListResponse)
async def list_orders(
    buyer: str | None = Query(None, description="Filter by buyer address (any case)"),
    seller: str | None = Query(None, description="Filter by seller address (any case)"),
    order_status: OrderStatus | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
) -> OrderListResponse:
    stmt = select(Order).options(
        selectinload(Order.items), selectinload(Order.shipment_groups)
    )
    if buyer:
        stmt = stmt.where(Order.buyer_address == _normalize(buyer))
    if seller:
        stmt = stmt.where(Order.seller_address == _normalize(seller))
    if order_status is not None:
        stmt = stmt.where(Order.global_status == order_status)
    stmt = stmt.order_by(Order.created_at_chain.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = list(result.scalars().unique().all())
    return OrderListResponse(
        items=[OrderResponse.model_validate(o) for o in rows],
        count=len(rows),
        limit=limit,
        offset=offset,
    )


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> OrderResponse:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.shipment_groups))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse.model_validate(order)


@router.get("/by-onchain-id/{onchain_order_id}", response_model=OrderResponse)
async def get_order_by_onchain_id(
    onchain_order_id: int,
    db: AsyncSession = Depends(get_async_db),
) -> OrderResponse:
    result = await db.execute(
        select(Order)
        .where(Order.onchain_order_id == onchain_order_id)
        .options(selectinload(Order.items), selectinload(Order.shipment_groups))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse.model_validate(order)


@router.get("/{order_id}/items", response_model=list[OrderItemResponse])
async def list_order_items(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> list[OrderItemResponse]:
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return [OrderItemResponse.model_validate(i) for i in order.items]


@router.get("/{order_id}/groups", response_model=list[ShipmentGroupResponse])
async def list_order_groups(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> list[ShipmentGroupResponse]:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.shipment_groups))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return [ShipmentGroupResponse.model_validate(g) for g in order.shipment_groups]


@router.post("/{order_id}/metadata", response_model=OrderResponse)
async def update_order_metadata(
    order_id: uuid.UUID,
    body: OrderMetadataUpdate,
    db: AsyncSession = Depends(get_async_db),
    caller: str = Depends(verify_signature),
) -> OrderResponse:
    """Update off-chain order metadata. Caller must be buyer or seller."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.shipment_groups))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if caller != order.buyer_address and caller != order.seller_address:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only buyer or seller can update order metadata",
        )

    # Partial update — only non-None fields are written.
    if body.delivery_address is not None:
        order.delivery_address = body.delivery_address
    if body.tracking_number is not None:
        order.tracking_number = body.tracking_number
    if body.product_ids is not None:
        order.product_ids = body.product_ids
    if body.notes is not None:
        order.notes = body.notes

    await db.commit()
    await db.refresh(order, attribute_names=["items", "shipment_groups"])
    return OrderResponse.model_validate(order)
