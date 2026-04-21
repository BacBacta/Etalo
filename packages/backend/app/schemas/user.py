from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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
