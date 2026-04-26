from datetime import datetime

from pydantic import BaseModel


class SitemapSeller(BaseModel):
    handle: str  # SellerProfile.shop_handle (already lowercased on insert)
    updated_at: datetime


class SitemapProduct(BaseModel):
    handle: str  # seller's shop_handle
    slug: str
    updated_at: datetime


class SitemapData(BaseModel):
    sellers: list[SitemapSeller]
    products: list[SitemapProduct]
