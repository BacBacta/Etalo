from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import get_async_db, get_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.product import (
    BoutiquePagination,
    BoutiquePublic,
    ProductPublic,
    ProductPublicListItem,
    ProductPublicSeller,
)

router = APIRouter(prefix="/products", tags=["products"])


def _ipfs_url(ipfs_hash: str | None) -> str | None:
    if not ipfs_hash:
        return None
    return f"{settings.pinata_gateway_url.rstrip('/')}/{ipfs_hash}"


@router.get(
    "/public/{handle}/{slug}",
    response_model=ProductPublic,
    responses={
        404: {"description": "Handle or product not found"},
        410: {"description": "Product has been removed"},
    },
)
def get_public_product(
    handle: str,
    slug: str,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> ProductPublic:
    """
    Fetch a product by seller handle + slug for the public SSR page.

    This endpoint is unauthenticated on purpose — the whole point of
    the Next.js web package is a shareable URL any buyer can open
    without first being in MiniPay.
    """
    normalized = handle.lower().lstrip("@")
    seller = (
        db.query(SellerProfile)
        .filter(SellerProfile.shop_handle == normalized)
        .one_or_none()
    )
    if seller is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shop not found.",
        )

    product = (
        db.query(Product)
        .filter(Product.seller_id == seller.id, Product.slug == slug)
        .one_or_none()
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )
    if product.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Product has been removed.",
        )

    # Short-ish cache so viral shares don't hammer the DB. Next.js also
    # adds its own revalidate on top (see web/[handle]/[slug]/page.tsx).
    response.headers["Cache-Control"] = (
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    )

    image_hashes = product.image_ipfs_hashes or []
    return ProductPublic(
        id=product.id,
        title=product.title,
        slug=product.slug,
        description=product.description,
        price_usdt=product.price_usdt,
        stock=product.stock,
        status=product.status,
        image_urls=[
            url for h in image_hashes if (url := _ipfs_url(h)) is not None
        ],
        seller=ProductPublicSeller(
            shop_handle=seller.shop_handle,
            shop_name=seller.shop_name,
            logo_url=_ipfs_url(seller.logo_ipfs_hash),
            country=seller.user.country if seller.user else None,
        ),
    )


@router.get(
    "/public/{handle}",
    response_model=BoutiquePublic,
    responses={404: {"description": "Shop not found"}},
)
async def get_public_boutique(
    handle: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> BoutiquePublic:
    """
    Boutique listing for a single seller, used by the public Next.js SSR
    page at /{handle}. Lists active products only (filters out drafts,
    paused, deleted) ordered by recency, paginated.

    Like the single-product endpoint this is unauthenticated — the goal
    is a shareable URL any buyer can open without first being in MiniPay.
    """
    normalized = handle.lower().lstrip("@")

    seller = (
        await db.scalars(
            select(SellerProfile)
            .where(SellerProfile.shop_handle == normalized)
            .options(selectinload(SellerProfile.user))
        )
    ).one_or_none()
    if seller is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shop not found.",
        )

    # TODO V1.5: 410 Gone for suspended/banned sellers (requires
    # SellerProfile.status enum: active/suspended/banned, not in V1).

    base_filter = (Product.seller_id == seller.id, Product.status == "active")

    total = await db.scalar(
        select(func.count(Product.id)).where(*base_filter)
    ) or 0

    offset = (page - 1) * page_size
    products = (
        await db.scalars(
            select(Product)
            .where(*base_filter)
            .order_by(Product.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    products_payload = [
        ProductPublicListItem(
            id=p.id,
            title=p.title,
            slug=p.slug,
            price_usdt=p.price_usdt,
            stock=p.stock,
            primary_image_url=(
                _ipfs_url(p.image_ipfs_hashes[0])
                if p.image_ipfs_hashes
                else None
            ),
        )
        for p in products
    ]

    # Same cache profile as the single-product endpoint — viral shares
    # land on Next.js + CDN before reaching the origin.
    # TODO V1.5: rate limit via slowapi+Redis to deter scraping.
    response.headers["Cache-Control"] = (
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    )

    return BoutiquePublic(
        seller=ProductPublicSeller(
            shop_handle=seller.shop_handle,
            shop_name=seller.shop_name,
            logo_url=_ipfs_url(seller.logo_ipfs_hash),
            country=seller.user.country if seller.user else None,
        ),
        products=products_payload,
        pagination=BoutiquePagination(
            page=page,
            page_size=page_size,
            total=total,
            has_more=offset + len(products_payload) < total,
        ),
    )
