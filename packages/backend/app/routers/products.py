from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.product import ProductPublic, ProductPublicSeller

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
