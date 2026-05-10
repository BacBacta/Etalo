"""V2 Orders router — Sprint J5 Block 6 + J11.7 Block 7 (ADR-044).

GET endpoints read from the indexer-populated DB. POST /metadata
writes off-chain fields (delivery, tracking, notes) — gated by
EIP-191 signature where the recovered address must be the buyer or
seller of the order.

J11.7 Block 7 adds PATCH /by-onchain-id/{id}/delivery-address — the
buyer's structured delivery address gets snapshotted into the order
post-fund. Uses X-Wallet-Address header (ADR-036 dev pattern, no new
EIP-191 per ADR-034 / CLAUDE.md rule 14).
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import verify_signature
from app.database import get_async_db
from app.models.delivery_address import DeliveryAddress
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.user import User
from app.schemas.order import (
    OrderItemResponse,
    OrderListResponse,
    OrderMetadataUpdate,
    OrderResponse,
    ShipmentGroupResponse,
)


router = APIRouter(prefix="/orders", tags=["orders"])


class DeliveryAddressSnapshotRequest(BaseModel):
    """Body for PATCH .../delivery-address — references an entry in the
    buyer's address book (DeliveryAddress.id). Backend looks up the row,
    builds the snapshot JSON, and writes it to orders.delivery_address_snapshot.

    Deprecated by ADR-050 inline checkout pivot — kept for backwards
    compat with sessions that still have the J11.7 picker UI in cache.
    New checkouts go through `DeliveryAddressInlineRequest` below.
    """

    address_id: uuid.UUID


class DeliveryAddressInlineRequest(BaseModel):
    """Body for PATCH .../delivery-address-inline — full snapshot
    submitted at checkout, no address-book row created (ADR-050).

    All required fields validate non-empty after trim. Country must be
    in the V1 intra-Africa set {NGA, GHA, KEN} (ADR-041 / ADR-045).
    `recipient_name` and `area` are NEW vs J11.7 — they fix the courier-
    refused-package gap and add the African neighborhood/estate level
    that's more useful than a street number in informal areas.
    """

    recipient_name: str = Field(..., min_length=2, max_length=100)
    phone_number: str = Field(..., min_length=5, max_length=20)
    country: str = Field(..., min_length=3, max_length=3)
    region: str = Field(..., min_length=1, max_length=100)
    city: str = Field(..., min_length=1, max_length=100)
    area: str = Field(..., min_length=1, max_length=100)
    address_line: str = Field(..., min_length=3, max_length=500)
    landmark: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("country")
    @classmethod
    def _country_v1_scope(cls, v: str) -> str:
        v = v.upper()
        if v not in {"NGA", "GHA", "KEN"}:
            raise ValueError(
                "country must be one of NGA, GHA, KEN (V1 intra-Africa scope)"
            )
        return v

    @field_validator(
        "recipient_name",
        "phone_number",
        "region",
        "city",
        "area",
        "address_line",
    )
    @classmethod
    def _strip_required(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty or whitespace-only")
        return stripped

    @field_validator("landmark", "notes")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None


def _normalize(addr: str | None) -> str | None:
    return addr.lower() if addr else None


# Eager-load chain mandatory for serializing OrderResponse — the
# `seller_handle` property on Order accesses Order.seller (lazy="raise")
# and User.seller_profile (default lazy="select", raises MissingGreenlet
# in async if not loaded). ADR-043 / J11.5 Block 1.
_ORDER_LOAD_OPTIONS = (
    selectinload(Order.items),
    selectinload(Order.shipment_groups),
    selectinload(Order.seller).selectinload(User.seller_profile),
)


def _enforce_caller_privacy(order: Order, caller: str | None) -> None:
    """ADR-043 casual-privacy filter — J11.5 Block 2.

    If `caller` is provided, returns 404 (NOT 403) when it does not
    match the order buyer or seller. 404 is intentional : the
    response shape must not leak whether `order_id` exists for orders
    the caller doesn't own (otherwise an attacker can enumerate
    order ids by 403/404 split).

    `caller` is optional — V1 keeps the endpoint readable without the
    filter for backwards compat with existing consumers (e.g. seller
    dashboard). Buyer interface (J11.5 Block 4) will pass caller
    systematically.

    This is "casual privacy" : it does not protect against on-chain
    enumeration via EtaloEscrow events, only against API-level
    fishing. Real session auth is V1.5+ scope (FU-J11-005).
    """
    if caller is None:
        return
    caller_norm = caller.lower()
    if caller_norm != order.buyer_address and caller_norm != order.seller_address:
        raise HTTPException(status_code=404, detail="Order not found")


@router.get("", response_model=OrderListResponse)
async def list_orders(
    buyer: str | None = Query(None, description="Filter by buyer address (any case)"),
    seller: str | None = Query(None, description="Filter by seller address (any case)"),
    order_status: OrderStatus | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
) -> OrderListResponse:
    stmt = select(Order).options(*_ORDER_LOAD_OPTIONS)
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
    caller: str | None = Query(
        None,
        description=(
            "Optional caller address for ADR-043 casual-privacy filter. "
            "If provided and not buyer/seller, returns 404 (no enumeration leak)."
        ),
    ),
    db: AsyncSession = Depends(get_async_db),
) -> OrderResponse:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(*_ORDER_LOAD_OPTIONS)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    _enforce_caller_privacy(order, caller)
    return OrderResponse.model_validate(order)


@router.get("/by-onchain-id/{onchain_order_id}", response_model=OrderResponse)
async def get_order_by_onchain_id(
    onchain_order_id: int,
    caller: str | None = Query(
        None,
        description=(
            "Optional caller address for ADR-043 casual-privacy filter. "
            "If provided and not buyer/seller, returns 404 (no enumeration leak)."
        ),
    ),
    db: AsyncSession = Depends(get_async_db),
) -> OrderResponse:
    result = await db.execute(
        select(Order)
        .where(Order.onchain_order_id == onchain_order_id)
        .options(*_ORDER_LOAD_OPTIONS)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    _enforce_caller_privacy(order, caller)
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
        .options(*_ORDER_LOAD_OPTIONS)
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


@router.patch(
    "/by-onchain-id/{onchain_order_id}/delivery-address",
    response_model=OrderResponse,
)
async def set_order_delivery_snapshot(
    onchain_order_id: int,
    body: DeliveryAddressSnapshotRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    x_wallet_address: Annotated[
        str | None, Header(alias="X-Wallet-Address")
    ] = None,
) -> OrderResponse:
    """Snapshot a buyer's address book entry into the order — Sprint
    J11.7 Block 7 (ADR-044).

    Auth : X-Wallet-Address must equal the order's buyer_address. The
    referenced DeliveryAddress.id must belong to the same buyer (no
    spoofing another buyer's address into your order).

    Idempotent across overwrites : multiple PATCH calls update the
    snapshot. Frontend retries on 404 (indexer race window — Order row
    not yet written when the buyer's wallet completes fund tx).
    """
    if not x_wallet_address:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Wallet-Address header required.",
        )
    caller = x_wallet_address.lower()

    # Find the on-chain order (404 if indexer hasn't written it yet —
    # frontend retries with backoff).
    order = (
        await db.execute(
            select(Order)
            .where(Order.onchain_order_id == onchain_order_id)
            .options(*_ORDER_LOAD_OPTIONS)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if caller != order.buyer_address:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer can set the delivery address snapshot.",
        )

    # Resolve the address book row + ensure it belongs to the buyer.
    addr = (
        await db.execute(
            select(DeliveryAddress).where(DeliveryAddress.id == body.address_id)
        )
    ).scalar_one_or_none()
    if addr is None or addr.is_deleted:
        raise HTTPException(status_code=404, detail="Address not found")

    # The address belongs to a User row identified by user_id ; we map
    # that User back to a wallet to compare with the order's buyer.
    addr_owner = (
        await db.execute(select(User).where(User.id == addr.user_id))
    ).scalar_one_or_none()
    if addr_owner is None or addr_owner.wallet_address != caller:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Address does not belong to the caller.",
        )

    # Snapshot the address into the order. Immutable once the buyer is
    # past fund — but the column itself is overwriteable for V1.7 retry
    # tolerance ; future hardening can lock once non-null + funded.
    order.delivery_address_snapshot = {
        "phone_number": addr.phone_number,
        "country": addr.country,
        "city": addr.city,
        "region": addr.region,
        "address_line": addr.address_line,
        "landmark": addr.landmark,
        "notes": addr.notes,
    }

    await db.commit()
    await db.refresh(order, attribute_names=["items", "shipment_groups"])
    return OrderResponse.model_validate(order)


@router.patch(
    "/by-onchain-id/{onchain_order_id}/delivery-address-inline",
    response_model=OrderResponse,
)
async def set_order_delivery_snapshot_inline(
    onchain_order_id: int,
    body: DeliveryAddressInlineRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    x_wallet_address: Annotated[
        str | None, Header(alias="X-Wallet-Address")
    ] = None,
) -> OrderResponse:
    """ADR-050 — inline delivery-address snapshot at checkout. The
    buyer typed the address directly in the checkout form (no address-
    book row created) ; backend writes the validated JSON straight to
    `orders.delivery_address_snapshot`.

    Differs from `set_order_delivery_snapshot` (above) in TWO ways :
    1. Body is the full address JSON, not an `address_id` reference.
    2. No DeliveryAddress row is created or read. The snapshot is the
       only persistence — buyer types fresh each checkout (or pre-fills
       from frontend sessionStorage).

    Auth : same as the address-book variant — X-Wallet-Address must
    equal the order's buyer_address.

    Idempotent across overwrites : the frontend may retry the call on
    indexer race or network flake (same pattern as J11.7).
    """
    if not x_wallet_address:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Wallet-Address header required.",
        )
    caller = x_wallet_address.lower()

    order = (
        await db.execute(
            select(Order)
            .where(Order.onchain_order_id == onchain_order_id)
            .options(*_ORDER_LOAD_OPTIONS)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if caller != order.buyer_address:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer can set the delivery address snapshot.",
        )

    order.delivery_address_snapshot = {
        "recipient_name": body.recipient_name,
        "phone_number": body.phone_number,
        "country": body.country,
        "region": body.region,
        "city": body.city,
        "area": body.area,
        "address_line": body.address_line,
        "landmark": body.landmark,
        "notes": body.notes,
    }

    await db.commit()
    await db.refresh(order, attribute_names=["items", "shipment_groups"])
    return OrderResponse.model_validate(order)
