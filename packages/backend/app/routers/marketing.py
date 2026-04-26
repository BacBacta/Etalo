"""Sprint J7 Block 3 — POST /api/v1/marketing/generate-image.

Auth: X-Wallet-Address header (per ADR-036, until JWT lands).
Authorization: the product must belong to the authenticated seller —
404 otherwise (we don't disclose existence of other sellers' products).

Block 4 added the Claude API caption integration.
Block 6 wires the off-chain credits ledger:
  1. Lazy-grant welcome bonus + monthly free before any check.
  2. Pre-flight balance check → 402 if zero. We probe BEFORE the
     ~5s render so the seller doesn't pay latency for a refusal.
  3. After a successful render, persist a MarketingImage row and
     consume 1 credit linked to it (consume_credits commits both).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.dependencies.seller_auth import require_seller_auth
from app.models.marketing_image import MarketingImage
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.marketing import (
    GenerateCaptionRequest,
    GenerateCaptionResponse,
    GenerateImageRequest,
    GenerateImageResponse,
)
from app.services import credit_service
from app.services.asset_generator import generate_marketing_image
from app.services.caption_generator import (
    CaptionGenerationError,
    generate_caption,
)
from app.services.credit_service import InsufficientCreditsError

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

    # Pre-flight credits gate — grant lazy bonuses, then refuse early
    # if the seller still can't afford 1 credit. Avoids burning ~5s
    # of render time on a request that will fail anyway.
    await credit_service.grant_welcome_bonus_if_first(seller.id, db)
    await credit_service.ensure_monthly_free_granted(seller.id, db)
    balance = await credit_service.get_balance(seller.id, db)
    if balance < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Insufficient credits. Purchase more credits via "
                "EtaloCredits.purchaseCredits, or wait for next month's "
                "free pack."
            ),
        )

    result = await generate_marketing_image(
        product_id=payload.product_id,
        template=payload.template,
        caption_lang=payload.caption_lang,
        db=db,
    )

    # Persist the marketing image row, then consume 1 credit linked to
    # its id. consume_credits commits — both rows land together.
    image = MarketingImage(
        seller_id=seller.id,
        product_id=payload.product_id,
        template=payload.template,
        caption_lang=payload.caption_lang,
        ipfs_hash=result["ipfs_hash"],
        image_url=result["image_url"],
        caption=result["caption"],
    )
    db.add(image)
    await db.flush()  # populate image.id without committing

    try:
        await credit_service.consume_credits(
            seller_id=seller.id, db=db, amount=1, image_id=image.id
        )
    except InsufficientCreditsError as exc:
        # Race: balance fell to 0 between the pre-flight and now (e.g.
        # parallel concurrent requests). Roll back the image row so we
        # don't leave a generated-but-unpaid record.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(exc),
        ) from exc

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
