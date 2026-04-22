from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.seller import SellerProfilePublic


class OnboardingProfileInput(BaseModel):
    shop_handle: str = Field(min_length=3, max_length=30)
    shop_name: str = Field(min_length=1, max_length=100)
    country: str = Field(min_length=2, max_length=3)
    language: str = Field(default="en", max_length=5)
    logo_ipfs_hash: str | None = None
    description: str | None = Field(default=None, max_length=500)

    @field_validator("shop_handle")
    @classmethod
    def lowercase_handle(cls, v: str) -> str:
        return v.lower().lstrip("@")


class OnboardingProductInput(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    # price_usdt is sent as a decimal string like "12.5"; we re-parse
    # with Decimal to keep the 6-decimals precision intact.
    price_usdt: Decimal = Field(gt=Decimal("0"))
    stock: int = Field(ge=1, le=10_000)
    photo_ipfs_hashes: list[str] = Field(min_length=1, max_length=5)


class OnboardingCompleteRequest(BaseModel):
    profile: OnboardingProfileInput
    first_product: OnboardingProductInput


class OnboardingCompleteProduct(BaseModel):
    id: UUID
    title: str
    price_usdt: Decimal
    stock: int
    status: str

    model_config = {"from_attributes": True}


class OnboardingCompleteResponse(BaseModel):
    profile: SellerProfilePublic
    first_product: OnboardingCompleteProduct
