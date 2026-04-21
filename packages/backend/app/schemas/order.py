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
