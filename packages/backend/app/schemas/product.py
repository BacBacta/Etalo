from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ProductCreate(BaseModel):
    title: str
    description: str | None = None
    price_usdt: Decimal
    stock: int = 0
    category: str | None = None


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    price_usdt: Decimal | None = None
    stock: int | None = None
    status: str | None = None
    category: str | None = None


class ProductRead(BaseModel):
    id: UUID
    seller_id: UUID
    title: str
    description: str | None = None
    price_usdt: Decimal
    stock: int
    status: str
    metadata_ipfs_hash: str | None = None
    image_ipfs_hashes: list[str] | None = None
    category: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductPublicSeller(BaseModel):
    shop_handle: str
    shop_name: str
    logo_url: str | None = None
    country: str | None = None


class ProductPublic(BaseModel):
    """
    Public view of a product, suitable for the SSR product page.
    Exposes pre-resolved gateway URLs (IPFS hashes stripped) and the
    minimum seller info needed to render the page.
    """

    id: UUID
    title: str
    slug: str
    description: str | None = None
    price_usdt: Decimal
    stock: int
    status: str
    image_urls: list[str]
    seller: ProductPublicSeller
