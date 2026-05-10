from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from uuid import UUID

from app.database import get_async_db, get_db
from app.dependencies.seller_auth import require_seller_auth
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.product import (
    BoutiquePagination,
    BoutiquePublic,
    ProductCreate,
    ProductDetail,
    ProductPublic,
    ProductPublicListItem,
    ProductPublicSeller,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["products"])


from app.services.ipfs import build_ipfs_url_or_none as _ipfs_url


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


# ============================================================
# Owner-side CRUD (ADR-036) — Sprint J6 Block 8 Étape 8.1
# ============================================================
@router.post(
    "",
    response_model=ProductDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    payload: ProductCreate,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> ProductDetail:
    """Create a product owned by the authenticated seller.

    Slug uniqueness is enforced per-seller (the existing UNIQUE constraint
    on `(seller_id, slug)` would also raise IntegrityError, but this
    handler returns 409 with a clean message).
    """
    existing = (
        await db.execute(
            select(Product).where(
                Product.seller_id == seller.id,
                Product.slug == payload.slug,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product slug already exists for this seller",
        )

    product = Product(
        seller_id=seller.id,
        title=payload.title,
        slug=payload.slug,
        description=payload.description,
        price_usdt=payload.price_usdt,
        stock=payload.stock,
        status=payload.status,
        image_ipfs_hashes=payload.image_ipfs_hashes or None,
        category=payload.category,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return ProductDetail.model_validate(product)


@router.put("/{product_id}", response_model=ProductDetail)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> ProductDetail:
    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    if product.seller_id != seller.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this product",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)
    await db.commit()
    await db.refresh(product)
    return ProductDetail.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> Response:
    product = (
        await db.execute(select(Product).where(Product.id == product_id))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    if product.seller_id != seller.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this product",
        )

    # Soft delete: status='deleted'. Preserves audit trail + indexer
    # references that may still point to this row from past orders.
    product.status = "deleted"
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================
# ADR-049 — Photo enhancement (V1 pivot)
# ============================================================

from datetime import datetime, timezone

from app.services import credit_service
from app.services.asset_generator import (
    enhance_product_photo,
    enhance_product_photo_variants,
)
from app.services.credit_service import InsufficientCreditsError
from app.services.ipfs import build_ipfs_url, ipfs_service


@router.post("/{product_id}/enhance-photo")
async def enhance_photo_endpoint(
    product_id: UUID,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict:
    """ADR-049 V1 — Atomically enhance the product's hero photo: check
    credits → birefnet bg-remove → composite white square 2048×2048 →
    pin to IPFS → consume 1 credit → update product → return.

    Idempotent on (product_id, source_image_ipfs_hash) — re-clicking
    against the same source returns the existing enhanced URL without
    charging another credit. Re-uploading a different source counts
    as a new enhancement.

    402 Payment Required if balance < 1 credit.
    404 if product not found / not owned by the authenticated seller.
    """
    product = await db.scalar(
        select(Product).where(
            Product.id == product_id,
            Product.seller_id == seller.id,
            Product.status != "deleted",
        )
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by you",
        )
    if not product.image_ipfs_hashes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product has no photo to enhance — upload one first",
        )

    source_hash = product.image_ipfs_hashes[0]

    # Idempotency : if the current hero photo was already enhanced from
    # this exact source, return without charging again. The seller already
    # paid for this work.
    if product.enhanced_at is not None:
        return {
            "enhanced_image_ipfs_hash": source_hash,
            "enhanced_image_url": build_ipfs_url(source_hash),
            "credits_consumed": 0,
            "credits_remaining": await credit_service.get_balance(
                seller.id, db
            ),
            "already_enhanced": True,
        }

    # Pre-flight credits gate — refuse early so the seller doesn't pay
    # ~10s of render time on a request that will fail anyway. Welcome
    # bonus is granted lazily here too if first action.
    await credit_service.grant_welcome_bonus_if_first(seller.id, db)
    balance = await credit_service.get_balance(seller.id, db)
    if balance < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Insufficient credits. Purchase more credits via "
                "EtaloCredits.purchaseCredits to enhance product photos."
            ),
        )

    source_url = build_ipfs_url(source_hash)
    enhanced_bytes = await enhance_product_photo(
        source_url, category=product.category
    )

    filename = f"enhanced_{product.id}_{source_hash[:8]}.png"
    enhanced_hash = await ipfs_service.upload_image(enhanced_bytes, filename)

    try:
        new_balance = await credit_service.consume_credits(
            seller_id=seller.id, db=db, amount=1, image_id=None
        )
    except InsufficientCreditsError:
        # Race : balance fell to 0 between pre-flight and now. Not
        # charging the seller is the right call ; they get the
        # enhanced photo for free this time but we won't update the
        # product so a re-click will retry the credit check cleanly.
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits — please buy more credits.",
        )

    # Replace the hero photo with the enhanced one. The original isn't
    # kept — sellers consistently want the polished output, and Pinata
    # never deletes the original (still resolvable via its hash).
    product.image_ipfs_hashes = [enhanced_hash, *product.image_ipfs_hashes[1:]]
    product.enhanced_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "enhanced_image_ipfs_hash": enhanced_hash,
        "enhanced_image_url": build_ipfs_url(enhanced_hash),
        "credits_consumed": 1,
        "credits_remaining": new_balance,
        "already_enhanced": False,
    }


from pydantic import BaseModel, Field


class EnhanceImageRequest(BaseModel):
    image_ipfs_hash: str = Field(..., min_length=10, max_length=100)
    # ADR-049 Block A — category drives the per-preset backdrop +
    # saturation + sharpening + margin. Optional : if absent or unknown,
    # the backend falls back to the "other" preset (cream cream backdrop
    # + neutral settings). Frontend ProductFormDialog passes the form's
    # category state when calling enhanceImage().
    category: str | None = Field(default=None, max_length=50)


@router.post("/enhance-image")
async def enhance_image_endpoint(
    payload: EnhanceImageRequest,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict:
    """ADR-049 V1 — Standalone photo enhancement that doesn't require
    a product to exist yet (the create-product flow uploads the photo
    first, enhances it, then submits the form). Atomically check
    credits → birefnet bg-remove → composite white square 2048×2048 →
    pin to IPFS → consume 1 credit → return.

    The seller-side state (which IPFS hash to save with the product)
    is the frontend's responsibility — it slots the returned enhanced
    hash into image_ipfs_hashes before calling createProduct /
    updateProduct. No backend product mutation here.

    402 Payment Required if balance < 1 credit. The frontend should
    surface a "Buy more credits" affordance and disable the button.
    """
    await credit_service.grant_welcome_bonus_if_first(seller.id, db)
    balance = await credit_service.get_balance(seller.id, db)
    if balance < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Insufficient credits. Purchase more credits via "
                "EtaloCredits.purchaseCredits to enhance product photos."
            ),
        )

    import httpx

    source_url = build_ipfs_url(payload.image_ipfs_hash)
    try:
        enhanced_bytes = await enhance_product_photo(
            source_url, category=payload.category
        )
    except httpx.HTTPStatusError as exc:
        # Bad IPFS hash, Pinata 4xx, or transient gateway issue. Don't
        # charge the seller for an unrenderable input — surface a clean
        # 400 so the frontend can ask for a re-upload.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Source image could not be fetched "
                f"(IPFS gateway returned {exc.response.status_code})."
            ),
        )

    filename = f"enhanced_{seller.id}_{payload.image_ipfs_hash[:8]}.png"
    enhanced_hash = await ipfs_service.upload_image(enhanced_bytes, filename)

    try:
        new_balance = await credit_service.consume_credits(
            seller_id=seller.id, db=db, amount=1, image_id=None
        )
    except InsufficientCreditsError:
        # Race : balance fell to 0 between pre-flight and consume.
        # The seller gets the enhanced photo for free this time —
        # next call will fail clean.
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits — please buy more credits.",
        )

    return {
        "enhanced_image_ipfs_hash": enhanced_hash,
        "enhanced_image_url": build_ipfs_url(enhanced_hash),
        "credits_consumed": 1,
        "credits_remaining": new_balance,
    }


# ============================================================
# ADR-049 Block C — Multi-variant generation
# ============================================================


class EnhanceImageVariantsRequest(BaseModel):
    image_ipfs_hash: str = Field(..., min_length=10, max_length=100)
    category: str | None = Field(default=None, max_length=50)


@router.post("/enhance-image-variants")
async def enhance_image_variants_endpoint(
    payload: EnhanceImageVariantsRequest,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict:
    """ADR-049 Block C — Generate 3 backdrop variants of the enhanced
    photo (Recommended / White bright / Neutral cool) so the seller
    can pick the aesthetic that fits best. Same atomic charge as
    `/enhance-image` (1 credit covers all 3 variants — Mike's call).

    The seller-side state (which IPFS hash to save with the product)
    is the frontend's responsibility — it slots the picked variant
    into image_ipfs_hashes before calling createProduct/updateProduct.

    402 Payment Required if balance < 1 credit.
    """
    await credit_service.grant_welcome_bonus_if_first(seller.id, db)
    balance = await credit_service.get_balance(seller.id, db)
    if balance < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Insufficient credits. Purchase more credits via "
                "EtaloCredits.purchaseCredits to enhance product photos."
            ),
        )

    import httpx

    source_url = build_ipfs_url(payload.image_ipfs_hash)
    try:
        variants, _ = await enhance_product_photo_variants(
            source_url, category=payload.category
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Source image could not be fetched "
                f"(IPFS gateway returned {exc.response.status_code})."
            ),
        )

    try:
        new_balance = await credit_service.consume_credits(
            seller_id=seller.id, db=db, amount=1, image_id=None
        )
    except InsufficientCreditsError:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits — please buy more credits.",
        )

    return {
        "variants": variants,
        "credits_consumed": 1,
        "credits_remaining": new_balance,
    }
