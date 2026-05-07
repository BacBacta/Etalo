from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    """ADR-036 self-service create. Slug is owner-chosen and immutable
    once set (changing it would break SEO / share links).

    Title min_length is 3 chars : single-letter / two-letter titles
    ("E", "Ggh") tested in the device-screenshot pass leave the
    marketplace card with no scannable signal. 3 chars is enough to
    constitute a real word ; the validator runs server-side as the
    source of truth + frontend mirrors it for instant feedback.
    """

    title: str = Field(min_length=3, max_length=200)
    slug: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    description: str | None = Field(default=None, max_length=2000)
    price_usdt: Decimal = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    status: str = Field(default="draft", pattern=r"^(active|draft|paused)$")
    image_ipfs_hashes: list[str] = Field(default_factory=list, max_length=8)
    category: str | None = Field(default=None, max_length=50)


class ProductUpdate(BaseModel):
    """ADR-036 self-service update. Slug is intentionally NOT updatable."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    price_usdt: Decimal | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    status: str | None = Field(
        default=None, pattern=r"^(active|draft|paused)$"
    )
    image_ipfs_hashes: list[str] | None = Field(default=None, max_length=8)
    category: str | None = Field(default=None, max_length=50)


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


class ProductDetail(BaseModel):
    """Full product response shape for owner-side CRUD endpoints
    (POST/PUT/DELETE /products). Distinct from ProductRead which omits
    slug; this shape keeps slug for owner UI."""

    id: UUID
    seller_id: UUID
    title: str
    slug: str
    description: str | None = None
    price_usdt: Decimal
    stock: int
    status: str
    image_ipfs_hashes: list[str] | None = None
    category: str | None = None
    created_at: datetime
    updated_at: datetime

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


class ProductPublicListItem(BaseModel):
    """
    Compact product card for the boutique grid. No description, single
    primary image — full details live behind /[handle]/[slug].
    """

    id: UUID
    title: str
    slug: str
    price_usdt: Decimal
    stock: int
    primary_image_url: str | None = None


class BoutiquePagination(BaseModel):
    page: int
    page_size: int
    total: int
    has_more: bool


class BoutiquePublic(BaseModel):
    """Boutique listing payload for /[handle] SSR page."""

    seller: ProductPublicSeller
    products: list[ProductPublicListItem]
    pagination: BoutiquePagination
