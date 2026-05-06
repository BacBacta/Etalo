"""V2 Order API schemas — Sprint J5 Block 6.

Pydantic models for request/response over HTTP. Distinct from
`app/schemas/onchain.py` (which mirrors Solidity structs). These
flatten DB rows + on-chain enrichment into stable client-facing
shapes.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.enums import ItemStatus, OrderStatus, ShipmentStatus

USDT_SCALE = Decimal(10) ** 6


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    onchain_item_id: int
    item_index: int
    item_price_usdt: int
    item_commission_usdt: int
    status: ItemStatus
    shipment_group_id: uuid.UUID | None
    released_amount_usdt: int

    @computed_field
    @property
    def item_price_human(self) -> Decimal:
        return Decimal(self.item_price_usdt) / USDT_SCALE


class ShipmentGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    onchain_group_id: int
    status: ShipmentStatus
    proof_hash: bytes | None
    arrival_proof_hash: bytes | None
    release_stage: int
    shipped_at: datetime | None
    arrived_at: datetime | None
    majority_release_at: datetime | None
    final_release_after: datetime | None


class OrderResponse(BaseModel):
    """Full order with embedded items + groups."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    onchain_order_id: int
    buyer_address: str
    seller_address: str
    seller_handle: str | None = None
    total_amount_usdt: int
    total_commission_usdt: int
    is_cross_border: bool
    global_status: OrderStatus
    item_count: int
    funded_at: datetime | None
    created_at_chain: datetime
    created_at_db: datetime
    delivery_address: str | None
    tracking_number: str | None
    product_ids: list[uuid.UUID] | None
    notes: str | None
    items: list[OrderItemResponse] = Field(default_factory=list)
    shipment_groups: list[ShipmentGroupResponse] = Field(default_factory=list)

    @computed_field
    @property
    def total_amount_human(self) -> Decimal:
        return Decimal(self.total_amount_usdt) / USDT_SCALE

    @computed_field
    @property
    def total_commission_human(self) -> Decimal:
        return Decimal(self.total_commission_usdt) / USDT_SCALE


class OrderListResponse(BaseModel):
    """Paginated order list."""
    items: list[OrderResponse]
    count: int
    limit: int
    offset: int


class OrderMetadataUpdate(BaseModel):
    """Off-chain metadata update by buyer or seller. Partial — only
    non-None fields are written."""
    delivery_address: str | None = None
    tracking_number: str | None = None
    product_ids: list[uuid.UUID] | None = None
    notes: str | None = None
