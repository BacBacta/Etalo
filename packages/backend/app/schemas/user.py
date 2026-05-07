from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserRead(BaseModel):
    id: UUID
    wallet_address: str
    phone: str | None = None
    email: str | None = None
    country: str | None = None
    language: str = "en"
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    phone: str | None = None
    email: str | None = None
    country: str | None = None
    language: str | None = None


# --- Sprint J11.7 Block 5 — buyer-side User reads/writes ---


class UserMeResponse(BaseModel):
    """Read shape for GET /api/v1/users/me. Carries `has_seller_profile`
    so the frontend can decide whether to surface seller-side affordances
    without a second roundtrip."""

    id: UUID
    wallet_address: str
    country: str | None = None
    language: str = "en"
    has_seller_profile: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class UserMeWrapper(BaseModel):
    """Wrapper carrying nullable user — frontend treats null as 'first
    visit, no User row yet, prompt for country'."""

    user: UserMeResponse | None


class UserMeUpdate(BaseModel):
    """PUT /api/v1/users/me — partial update. Country validated against
    the V1 enum at the route handler."""

    country: str | None = Field(default=None, max_length=3)
    language: str | None = Field(default=None, max_length=5)


class SellerProfileRead(BaseModel):
    id: UUID
    shop_handle: str
    shop_name: str
    description: str | None = None
    logo_ipfs_hash: str | None = None
    banner_ipfs_hash: str | None = None
    socials: dict | None = None
    categories: list[str] | None = None

    model_config = {"from_attributes": True}


class SellerProfileCreate(BaseModel):
    shop_handle: str
    shop_name: str
    description: str | None = None
