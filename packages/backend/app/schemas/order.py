from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class OrderCreate(BaseModel):
    seller_address: str
    product_id: UUID | None = None
    amount_usdt: Decimal
    is_cross_border: bool = False
    delivery_address: str | None = None


class OrderRead(BaseModel):
    id: UUID
    onchain_order_id: int | None = None
    buyer_address: str
    seller_address: str
    product_id: UUID | None = None
    amount_usdt: Decimal
    commission_usdt: Decimal
    status: str
    is_cross_border: bool
    milestones_total: int
    milestones_released: int
    tracking_number: str | None = None
    tx_hash: str | None = None
    created_at: datetime
    shipped_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Checkout flow (Block 7) ----------------------------------------


class OrderInitiateRequest(BaseModel):
    product_id: UUID


class OrderInitiateProduct(BaseModel):
    id: UUID
    title: str
    image_url: str | None = None
    slug: str


class OrderInitiateSeller(BaseModel):
    shop_handle: str
    shop_name: str
    address: str
    country: str | None = None


class OrderInitiateContracts(BaseModel):
    escrow: str
    usdt: str


class OrderInitiateResponse(BaseModel):
    product: OrderInitiateProduct
    seller: OrderInitiateSeller
    amount_raw: str  # bigint as string, 6 decimals
    is_cross_border: bool
    auto_release_days_estimate: int
    contracts: OrderInitiateContracts


class OrderConfirmRequest(BaseModel):
    product_id: UUID
    onchain_order_id: int
    tx_hash_create: str
    tx_hash_fund: str
    is_cross_border: bool
    amount_raw: str  # bigint as string


class OrderConfirmResponse(BaseModel):
    id: UUID
    status: str
    onchain_order_id: int
