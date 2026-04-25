from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.sitemap import SitemapData, SitemapProduct, SitemapSeller

router = APIRouter(prefix="/sitemap", tags=["sitemap"])


@router.get("/data", response_model=SitemapData)
async def get_sitemap_data(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> SitemapData:
    """
    Lightweight sitemap data: all seller handles + active product slugs
    with updated_at for lastmod. Consumed by Next.js app/sitemap.ts.

    Cache: 1 hour client + CDN side. Re-runs at most once per hour
    even under viral share load.

    TODO V1.5: filter by SellerProfile.status='active' once status enum
    exists. Currently includes every seller with a shop_handle (no NULL
    handle exists in V1 — column is NOT NULL).
    """
    sellers_rows = (
        await db.execute(
            select(SellerProfile.shop_handle, SellerProfile.updated_at)
        )
    ).all()
    sellers = [
        SitemapSeller(handle=h, updated_at=u) for h, u in sellers_rows
    ]

    products_rows = (
        await db.execute(
            select(
                SellerProfile.shop_handle,
                Product.slug,
                Product.updated_at,
            )
            .join(Product, Product.seller_id == SellerProfile.id)
            .where(Product.status == "active")
        )
    ).all()
    products = [
        SitemapProduct(handle=h, slug=s, updated_at=u)
        for h, s, u in products_rows
    ]

    response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=3600"

    return SitemapData(sellers=sellers, products=products)
