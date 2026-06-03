from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models.enums import Country, ProductCategory
from app.models.product import Product
from app.models.reputation_cache import ReputationCache
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.schemas.marketplace import (
    MarketplaceListResponse,
    MarketplacePagination,
    MarketplaceProductItem,
    MarketplaceSection,
    MarketplaceSectionsResponse,
)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


from app.services.ipfs import build_ipfs_url_or_none as _ipfs_url


def _base_active_product_select():
    """Shared base query : active, image-bearing products joined to their
    seller + the read-only reputation mirror (LEFT JOIN, V2 invariant #14
    preserved). Callers append ordering / filters / limits."""
    return (
        select(Product, SellerProfile, User, ReputationCache)
        .join(SellerProfile, Product.seller_id == SellerProfile.id)
        .join(User, SellerProfile.user_id == User.id)
        .outerjoin(
            ReputationCache,
            ReputationCache.seller_address == User.wallet_address,
        )
        .where(Product.status == "active")
        .where(Product.image_ipfs_hashes.is_not(None))
        .where(func.cardinality(Product.image_ipfs_hashes) >= 1)
    )


def _row_to_item(p: Product, sp: SellerProfile, u: User, rep) -> MarketplaceProductItem:
    """Map a (Product, SellerProfile, User, ReputationCache|None) row to the
    public item shape. `rep` is None for sellers without a reputation row."""
    return MarketplaceProductItem(
        id=p.id,
        slug=p.slug,
        title=p.title,
        price_usdt=p.price_usdt,
        primary_image_url=(
            _ipfs_url(p.image_ipfs_hashes[0]) if p.image_ipfs_hashes else None
        ),
        seller_handle=sp.shop_handle.lower(),
        seller_shop_name=sp.shop_name,
        seller_country=u.country,
        created_at=p.created_at,
        seller_orders_completed=(rep.orders_completed if rep else 0),
        seller_is_top_seller=(rep.is_top_seller if rep else False),
    )


# Allowed country filter values : the 3 V1 markets per ADR-041, OR
# the literal "all" sentinel to bypass the filter explicitly. The
# corresponding alpha-3 codes used in DB are NGA / GHA / KEN.
_VALID_COUNTRY_FILTER = {c.value for c in Country} | {"all"}

# Allowed category filter values : the 5 V1 marketplace categories +
# "all" sentinel. Mirrors `ProductCategory` enum so the buyer-facing
# chips and the seller-facing form share one source of truth.
_VALID_CATEGORY_FILTER = {c.value for c in ProductCategory} | {"all"}

# Allowed sort values. "newest" sorts by Product.created_at desc.
# "popular" fallbacks to newest in V1 — denormalized completed_orders
# count is V1.5+ scope (no cached field exists yet ; running a JOIN
# COUNT on every marketplace request would not scale).
# `price_asc` / `price_desc` operate on Product.price_usdt directly ;
# the cursor pagination still uses created_at internally so the cursor
# token semantics stay stable across sort changes (a fresh sort
# selection effectively resets pagination).
_VALID_SORT = {"newest", "popular", "price_asc", "price_desc"}


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
        description="Sort order : 'newest' / 'popular' / 'price_asc' / 'price_desc'. 'popular' falls back to newest V1.",
    ),
    q: str | None = Query(
        None,
        max_length=100,
        description="Optional case-insensitive substring search over Product.title. Empty / None disables search.",
    ),
    category: str | None = Query(
        None,
        description="Category filter (fashion / beauty / food / home / other / 'all'). When omitted or 'all', returns every category.",
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
    if category is not None and category not in _VALID_CATEGORY_FILTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category filter. Must be one of {sorted(_VALID_CATEGORY_FILTER)}.",
        )
    if sort not in _VALID_SORT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort. Must be one of {sorted(_VALID_SORT)}.",
        )

    # Sort selection — defaults to created_at desc ("newest"). For the
    # price sorts we add a stable created_at tiebreaker so two products
    # at the exact same price don't shuffle between renders.
    if sort == "price_asc":
        order_by_clauses = (
            Product.price_usdt.asc(),
            Product.created_at.desc(),
        )
    elif sort == "price_desc":
        order_by_clauses = (
            Product.price_usdt.desc(),
            Product.created_at.desc(),
        )
    else:
        # "newest" + "popular" both fall back to created_at desc V1.
        order_by_clauses = (Product.created_at.desc(),)

    # Read-only reputation LEFT JOIN + active/image quality bar live in
    # the shared base select ; we add sort + the +1 over-fetch (detects
    # has_more without a COUNT query) here.
    stmt = (
        _base_active_product_select()
        .order_by(*order_by_clauses)
        .limit(limit + 1)
    )

    if country is not None and country != "all":
        stmt = stmt.where(User.country == country)

    if category is not None and category != "all":
        stmt = stmt.where(Product.category == category)

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

    products_payload = [_row_to_item(p, sp, u, rep) for p, sp, u, rep in page_rows]

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


# Curated discovery rails (editorial merchandising). Window + sizes are
# deliberately small : a thin-data launch should still show full rails.
_NEW_WINDOW_DAYS = 7
_SECTION_LIMIT = 12


@router.get("/sections", response_model=MarketplaceSectionsResponse)
async def list_marketplace_sections(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    country: str | None = Query(
        None,
        description="ISO 3166-1 alpha-3 country filter (NGA, GHA, KEN, or 'all'). Scopes every rail to one V1 market.",
    ),
) -> MarketplaceSectionsResponse:
    """Curated editorial rails for the unfiltered discovery view.

    V1 rails (honest, real-data only) :
    - `new` — products pinned in the last 7 days, newest first.
    - `top_rated` — products from sellers with a completed-order track
      record, ranked by reputation score, deduped to one product per
      seller so the rail showcases *different* trusted boutiques.

    Empty rails are omitted so a thin-data launch never renders a bare
    heading over an empty carousel. Same active + image quality bar as
    the main listing ; optional country filter scopes all rails.
    """
    if country is not None and country not in _VALID_COUNTRY_FILTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid country filter. Must be one of {sorted(_VALID_COUNTRY_FILTER)}.",
        )

    def scoped():
        s = _base_active_product_select()
        if country is not None and country != "all":
            s = s.where(User.country == country)
        return s

    sections: list[MarketplaceSection] = []

    # Rail 1 — New this week.
    cutoff = datetime.now(timezone.utc) - timedelta(days=_NEW_WINDOW_DAYS)
    new_rows = (
        await db.execute(
            scoped()
            .where(Product.created_at >= cutoff)
            .order_by(Product.created_at.desc())
            .limit(_SECTION_LIMIT)
        )
    ).all()
    if new_rows:
        sections.append(
            MarketplaceSection(
                key="new",
                title="New this week",
                products=[_row_to_item(p, sp, u, rep) for p, sp, u, rep in new_rows],
            )
        )

    # Rail 2 — Top-rated boutiques. Filtering on the outer-joined
    # reputation columns (orders_completed > 0) naturally drops sellers
    # with no reputation row (NULL > 0 → excluded). Over-fetch ×3 so the
    # one-product-per-seller dedupe can still fill the rail.
    top_rows = (
        await db.execute(
            scoped()
            .where(ReputationCache.orders_completed > 0)
            .order_by(
                ReputationCache.score.desc(),
                ReputationCache.orders_completed.desc(),
                Product.created_at.desc(),
            )
            .limit(_SECTION_LIMIT * 3)
        )
    ).all()
    seen_sellers: set = set()
    top_items: list[MarketplaceProductItem] = []
    for p, sp, u, rep in top_rows:
        if sp.id in seen_sellers:
            continue
        seen_sellers.add(sp.id)
        top_items.append(_row_to_item(p, sp, u, rep))
        if len(top_items) >= _SECTION_LIMIT:
            break
    if top_items:
        sections.append(
            MarketplaceSection(
                key="top_rated",
                title="Top-rated boutiques",
                products=top_items,
            )
        )

    response.headers["Cache-Control"] = (
        "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
    )
    return MarketplaceSectionsResponse(sections=sections)
