from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.enums import Country
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


# Allowed country filter values : the 3 V1 markets per ADR-041, OR
# the literal "all" sentinel to bypass the filter explicitly. The
# corresponding alpha-3 codes used in DB are NGA / GHA / KEN.
_VALID_COUNTRY_FILTER = {c.value for c in Country} | {"all"}

# Allowed sort values. "newest" sorts by Product.created_at desc.
# "popular" fallbacks to newest in V1 — denormalized completed_orders
# count is V1.5+ scope (no cached field exists yet ; running a JOIN
# COUNT on every marketplace request would not scale).
_VALID_SORT = {"newest", "popular"}


@router.get("/products", response_model=MarketplaceListResponse)
async def list_marketplace_products(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    after: str | None = Query(
        None,
        description="ISO datetime cursor — returns items strictly older than this.",
    ),
    limit: int = Query(20, ge=1, le=50),
    country: str | None = Query(
        None,
        description="ISO 3166-1 alpha-3 country filter (NGA, GHA, KEN, or 'all'). When omitted or 'all', returns sellers from every V1 market.",
    ),
    sort: str = Query(
        "newest",
        description="Sort order : 'newest' (created_at desc) or 'popular' (V1 fallback to newest until denormalized score ships in V1.5+).",
    ),
    q: str | None = Query(
        None,
        max_length=100,
        description="Optional case-insensitive substring search over Product.title. Empty / None disables search.",
    ),
) -> MarketplaceListResponse:
    """
    Public marketplace listing across all sellers.

    Sort: created_at DESC. Cursor-based pagination via `?after=<iso_dt>`.
    Excludes Product.status != 'active'. Excludes products without at
    least one image (V1 quality bar — a "No image" placeholder card
    erodes buyer trust ; the seller dashboard surfaces these as draft-
    visual rows with an upload nudge instead). Optional country filter
    scopes to a single V1 launch market (ADR-045). Optional `q` does
    case-insensitive ILIKE over title — V1 search is title-only ;
    description / category fts is V1.5+ scope. (V1.5: also exclude
    suspended sellers once SellerProfile.status enum exists — same TODO
    as cart token endpoint.)
    """
    if country is not None and country not in _VALID_COUNTRY_FILTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid country filter. Must be one of {sorted(_VALID_COUNTRY_FILTER)}.",
        )
    if sort not in _VALID_SORT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort. Must be one of {sorted(_VALID_SORT)}.",
        )

    stmt = (
        select(Product, SellerProfile, User)
        .join(SellerProfile, Product.seller_id == SellerProfile.id)
        .join(User, SellerProfile.user_id == User.id)
        .where(Product.status == "active")
        # V1 quality bar — public marketplace excludes products with no
        # primary image. The IS NOT NULL guard handles legacy NULL rows ;
        # the array length check rules out an empty `{}`-shaped array
        # (DB allowed but UX-equivalent to NULL).
        .where(Product.image_ipfs_hashes.is_not(None))
        .where(func.cardinality(Product.image_ipfs_hashes) >= 1)
        .order_by(Product.created_at.desc())
        .limit(limit + 1)  # +1 to detect has_more without a count query
    )

    if country is not None and country != "all":
        stmt = stmt.where(User.country == country)

    if q:
        # Strip + collapse whitespace ; if nothing's left, treat as
        # absent to avoid an ILIKE '%%' that scans the world.
        normalized_q = " ".join(q.split())
        if normalized_q:
            stmt = stmt.where(Product.title.ilike(f"%{normalized_q}%"))

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
