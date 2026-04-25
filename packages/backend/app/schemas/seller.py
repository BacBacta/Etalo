from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SellerProfilePublic(BaseModel):
    """
    Public view of a seller profile returned to the Mini App.

    Never include raw wallet addresses or internal IDs that aren't safe
    to render. `logo_ipfs_hash` is kept so the client can build the
    gateway URL itself (the IPFS gateway is public).
    """

    id: UUID
    shop_handle: str
    shop_name: str
    description: str | None = None
    logo_ipfs_hash: str | None = None
    banner_ipfs_hash: str | None = None
    socials: dict | None = None
    categories: list[str] | None = None
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
    NOT updatable (would break /[handle] URLs / boutique pages)."""

    shop_name: str | None = None
    description: str | None = None
    logo_ipfs_hash: str | None = None
    banner_ipfs_hash: str | None = None
    socials: dict | None = None
    categories: list[str] | None = None


class SellerOrderItem(BaseModel):
    """Minimal order summary returned by GET /sellers/{address}/orders."""

    id: UUID
    onchain_order_id: int
    buyer_address: str
    total_amount_usdt: int
    is_cross_border: bool
    global_status: str
    item_count: int
    created_at_chain: datetime
    funded_at: datetime | None = None

    model_config = {"from_attributes": True}


class SellerOrdersPage(BaseModel):
    orders: list[SellerOrderItem]
    pagination: dict
