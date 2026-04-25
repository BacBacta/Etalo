from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class MarketplaceProductItem(BaseModel):
    id: UUID
    slug: str
    title: str
    price_usdt: Decimal
    primary_image_url: str | None = None
    seller_handle: str
    seller_shop_name: str
    seller_country: str | None = None
    created_at: datetime


class MarketplacePagination(BaseModel):
    # ISO datetime of the last returned item's created_at, or None when
    # there are no more pages. Cursor consumers pass this back as ?after=.
    next_cursor: str | None = None
    has_more: bool


class MarketplaceListResponse(BaseModel):
    products: list[MarketplaceProductItem]
    pagination: MarketplacePagination
