from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class CartItemRequest(BaseModel):
    product_id: UUID
    qty: int = Field(gt=0, le=999)


class CartTokenRequest(BaseModel):
    items: list[CartItemRequest] = Field(min_length=1, max_length=50)


class ResolvedCartItem(BaseModel):
    product_id: UUID
    product_slug: str
    title: str
    price_usdt: Decimal
    qty: int
    image_url: str | None = None


class ResolvedCartSellerGroup(BaseModel):
    seller_handle: str
    seller_shop_name: str
    # Raw 0x address — needed by the Mini App for `createOrderWithItems`
    # args. CLAUDE.md rule 5 forbids RENDERING raw addresses; passing them
    # through to wagmi/viem call args is the legitimate use.
    seller_address: str
    items: list[ResolvedCartItem]
    subtotal_usdt: Decimal
    is_cross_border: bool


class ResolvedCart(BaseModel):
    groups: list[ResolvedCartSellerGroup]
    total_usdt: Decimal
    issued_at: datetime
    expires_at: datetime


class CartTokenResponse(BaseModel):
    token: str
    expires_at: datetime


class CartValidationItemError(BaseModel):
    product_id: UUID
    reason: str  # "not_found" | "inactive" | "qty_exceeds_stock"
    available_qty: int | None = None
