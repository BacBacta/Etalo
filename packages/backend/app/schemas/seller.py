from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class SellerOrderItemSummary(BaseModel):
    """Per-SKU summary for the seller dashboard order row.

    Aggregates duplicate `Order.product_ids[i]` entries into a single
    `(title, qty)` row + the first product image so the seller sees
    what to ship without opening a detail page. When `product_ids` is
    null or stale (product deleted), `title` falls back to "Article"
    and `image_ipfs_hash` is null — the row still surfaces the qty so
    the seller is never blind on item_count.
    """

    title: str
    qty: int
    image_ipfs_hash: str | None = None


class SellerProfilePublic(BaseModel):
    """
    Public view of a seller profile returned to the Mini App.

    Never include raw wallet addresses or internal IDs that aren't safe
    to render. `logo_ipfs_hash` is kept so the client can build the
    gateway URL itself (the IPFS gateway is public).

    `country` is hydrated from the joined User row (denormalization
    avoided per Block 0 recon — User.country is the single source of
    truth, accessed via SellerProfile.user.country).
    """

    id: UUID
    shop_handle: str
    shop_name: str
    description: str | None = None
    logo_ipfs_hash: str | None = None
    banner_ipfs_hash: str | None = None
    socials: dict | None = None
    categories: list[str] | None = None
    country: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SellersMeResponse(BaseModel):
    """
    Response shape for GET /api/v1/sellers/me.

    `profile` is null when the caller has no seller profile yet — the
    frontend treats that as "route to onboarding". We intentionally do
    not return 404 for this case (see docs/DECISIONS.md).
    """

    profile: SellerProfilePublic | None


class HandleAvailabilityResponse(BaseModel):
    handle: str
    available: bool
    reason: str | None = None  # "format" | "taken" | None


class SellerProfileUpdate(BaseModel):
    """ADR-036 self-service profile update. shop_handle is intentionally
    NOT updatable (would break /[handle] URLs / boutique pages).

    `country` writes to the joined User row, not SellerProfile (the
    column lives on User per Block 0 recon). Validation against the
    V1 enum {NGA, GHA, KEN} is enforced at the route handler + DB
    CheckConstraint level.
    """

    shop_name: str | None = None
    description: str | None = None
    logo_ipfs_hash: str | None = None
    banner_ipfs_hash: str | None = None
    socials: dict | None = None
    categories: list[str] | None = None
    country: str | None = None


class SellerOrderItem(BaseModel):
    """Order summary returned by GET /sellers/{address}/orders.

    Two field groups added in fix/seller-orders-delivery-info :
    - `delivery_address_snapshot` — surface shipping context (where to
      ship + buyer phone deeplink) directly on the order list.
    - `line_items` — per-SKU breakdown {title, qty, image_ipfs_hash} so
      the seller sees what to pull from shelves without an extra click.
      Aggregated server-side from `Order.product_ids` joined to
      `products`, qty derived from id-occurrence count. Falls back to
      a single neutral row when `product_ids` is null (legacy orders).
      Named `line_items` (not `items`) to avoid the Pydantic
      `from_attributes` auto-pickup of the SQLAlchemy `Order.items`
      relationship (lazy load → MissingGreenlet at validate time).
    """

    id: UUID
    onchain_order_id: int
    buyer_address: str
    total_amount_usdt: int
    is_cross_border: bool
    global_status: str
    item_count: int
    created_at_chain: datetime
    funded_at: datetime | None = None
    delivery_address_snapshot: dict | None = None
    line_items: list[SellerOrderItemSummary] = []

    model_config = {"from_attributes": True}


class SellerOrdersPage(BaseModel):
    orders: list[SellerOrderItem]
    pagination: dict


class MyProductsListItem(BaseModel):
    """Owner-side product summary — exposes ALL statuses (incl. draft +
    paused) so the seller dashboard can surface non-public rows."""

    id: UUID
    title: str
    slug: str
    description: str | None = None
    price_usdt: Decimal
    stock: int
    status: str
    image_ipfs_hashes: list[str] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MyProductsListResponse(BaseModel):
    products: list[MyProductsListItem]
    total: int
