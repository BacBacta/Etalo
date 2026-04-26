"""Sprint J7 Block 3 — POST /api/v1/marketing/generate-image.

Auth: X-Wallet-Address header (per ADR-036, until JWT lands).
Authorization: the product must belong to the authenticated seller —
404 otherwise (we don't disclose existence of other sellers' products).

Block 4 will replace the caption stub with a real Claude API call.
Block 6 will wire the EtaloCredits balance check + ledger consumption
ahead of generation.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.dependencies.seller_auth import require_seller_auth
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.marketing import (
    GenerateCaptionRequest,
    GenerateCaptionResponse,
    GenerateImageRequest,
    GenerateImageResponse,
)
from app.services.asset_generator import generate_marketing_image
from app.services.caption_generator import (
    CaptionGenerationError,
    generate_caption,
)

router = APIRouter(prefix="/marketing", tags=["marketing"])


@router.post("/generate-image", response_model=GenerateImageResponse)
async def generate_image_endpoint(
    payload: GenerateImageRequest,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> GenerateImageResponse:
    product = await db.scalar(
        select(Product).where(
            Product.id == payload.product_id,
            Product.seller_id == seller.id,
        )
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by you",
        )
    if product.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Cannot generate image for a deleted product",
        )

    result = await generate_marketing_image(
        product_id=payload.product_id,
        template=payload.template,
        caption_lang=payload.caption_lang,
        db=db,
    )
    return GenerateImageResponse(**result)


@router.post("/generate-caption", response_model=GenerateCaptionResponse)
async def generate_caption_endpoint(
    payload: GenerateCaptionRequest,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> GenerateCaptionResponse:
    """Regenerate just the caption for a product (no image, no IPFS pin).

    Use case: seller wants a different caption for an already-generated
    image, or wants to preview tone before committing a credit (Block 6
    will gate this on EtaloCredits balance).
    """
    product = await db.scalar(
        select(Product)
        .where(
            Product.id == payload.product_id,
            Product.seller_id == seller.id,
        )
        .options(selectinload(Product.seller).selectinload(SellerProfile.user))
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by you",
        )

    try:
        caption = await generate_caption(
            title=product.title,
            price_usdt=f"{product.price_usdt:.2f}",
            description=product.description,
            seller_handle=product.seller.shop_handle.lower(),
            country=product.seller.user.country or "AFR",
            lang=payload.lang,
        )
    except CaptionGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Caption service temporarily unavailable: {exc}",
        ) from exc

    return GenerateCaptionResponse(caption=caption, lang=payload.lang)
