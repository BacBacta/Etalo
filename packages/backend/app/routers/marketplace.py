from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.schemas.marketplace import (
    MarketplaceListResponse,
    MarketplacePagination,
    MarketplaceProductItem,
)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


from app.services.ipfs import build_ipfs_url_or_none as _ipfs_url


@router.get("/products", response_model=MarketplaceListResponse)
async def list_marketplace_products(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    after: str | None = Query(
        None,
        description="ISO datetime cursor — returns items strictly older than this.",
    ),
    limit: int = Query(20, ge=1, le=50),
) -> MarketplaceListResponse:
    """
    Public marketplace listing across all sellers.

    Sort: created_at DESC. Cursor-based pagination via `?after=<iso_dt>`.
    Excludes Product.status != 'active'. (V1.5: also exclude suspended
    sellers once SellerProfile.status enum exists — same TODO as cart
    token endpoint.)
    """
    stmt = (
        select(Product, SellerProfile, User)
        .join(SellerProfile, Product.seller_id == SellerProfile.id)
        .join(User, SellerProfile.user_id == User.id)
        .where(Product.status == "active")
        .order_by(Product.created_at.desc())
        .limit(limit + 1)  # +1 to detect has_more without a count query
    )

    if after:
        # FastAPI's query parser decodes raw `+` as space (form-urlencoded
        # behavior). ISO datetimes contain `+HH:MM` for tz offsets — if a
        # client passed an unencoded cursor, we need to put the `+` back.
        normalized = after.replace(" ", "+").replace("Z", "+00:00")
        try:
            cursor_dt = datetime.fromisoformat(normalized)
            stmt = stmt.where(Product.created_at < cursor_dt)
        except ValueError:
            # Malformed cursor — fall back to first page silently. This
            # avoids surfacing a 400 to a UI that may have stored a bad
            # cursor in URL state.
            pass

    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    products_payload = [
        MarketplaceProductItem(
            id=p.id,
            slug=p.slug,
            title=p.title,
            price_usdt=p.price_usdt,
            primary_image_url=(
                _ipfs_url(p.image_ipfs_hashes[0])
                if p.image_ipfs_hashes
                else None
            ),
            seller_handle=sp.shop_handle.lower(),
            seller_shop_name=sp.shop_name,
            seller_country=u.country,
            created_at=p.created_at,
        )
        for p, sp, u in page_rows
    ]

    next_cursor: str | None = None
    if has_more and page_rows:
        last_product = page_rows[-1][0]
        next_cursor = last_product.created_at.isoformat()

    response.headers["Cache-Control"] = (
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    )

    return MarketplaceListResponse(
        products=products_payload,
        pagination=MarketplacePagination(
            next_cursor=next_cursor,
            has_more=has_more,
        ),
    )
