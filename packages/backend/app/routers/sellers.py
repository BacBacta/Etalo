# SECURITY WARNING: Temporary auth via X-Wallet-Address header.
# Replace with JWT verification before any deployment.
# See docs/DECISIONS.md 2026-04-22 entry on X-Wallet-Address header.
#
# When settings.enforce_jwt_auth is True (production), the header is
# rejected and the endpoint returns 501 until JWT auth is wired.

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import get_async_db, get_db
from app.models.enums import Country, SellerStatus, StakeTier
from app.models.order import Order
from app.models.reputation_cache import ReputationCache
from app.models.seller_credits_ledger import SellerCreditsLedger
from app.models.seller_profile import SellerProfile
from app.models.stake import Stake
from app.models.user import User
from app.services import credit_service
from app.dependencies.seller_auth import require_seller_auth
from app.models.product import Product
from app.schemas.seller import (
    HandleAvailabilityResponse,
    MyProductsListItem,
    MyProductsListResponse,
    SellerOrderItem,
    SellerOrdersPage,
    SellerProfilePublic,
    SellerProfileUpdate,
    SellersMeResponse,
)
from app.schemas.seller_v2 import (
    ReputationBlock,
    SellerProfileResponse,
    StakeBlock,
)
from app.services.celo import CeloService

router = APIRouter(prefix="/sellers", tags=["sellers"])


def _get_celo_service(request: Request) -> CeloService:
    return request.app.state.celo_service


def get_current_wallet(
    x_wallet_address: Annotated[str | None, Header(alias="X-Wallet-Address")] = None,
) -> str:
    """
    Resolve the caller's wallet address.

    Development mode (settings.enforce_jwt_auth=False): trust the
    X-Wallet-Address header. This is explicitly insecure and documented
    in docs/DECISIONS.md. Do NOT ship with enforce_jwt_auth=False.

    Production mode (settings.enforce_jwt_auth=True): refuse the header
    and return 501 — JWT dependency is not yet wired.
    """
    if settings.enforce_jwt_auth:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="JWT auth not yet wired; contact backend team.",
        )
    if not x_wallet_address:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Wallet-Address header required (dev auth).",
        )
    # Normalize to lowercase; EIP-55 checksumming happens at write time.
    return x_wallet_address.lower()


@router.get("/me", response_model=SellersMeResponse)
def get_my_seller_profile(
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> SellersMeResponse:
    """
    Return the caller's seller profile, or `{profile: null}` if none exists.

    The 200+null shape lets the frontend treat "no profile" as a valid
    state (redirect to onboarding) without a 404 showing up in the
    console as a network error.
    """
    user = (
        db.query(User)
        .filter(User.wallet_address == wallet)
        .one_or_none()
    )
    if user is None:
        return SellersMeResponse(profile=None)

    profile = (
        db.query(SellerProfile)
        .filter(SellerProfile.user_id == user.id)
        .one_or_none()
    )
    if profile is None:
        return SellersMeResponse(profile=None)

    # Hydrate country from User (single source of truth per Block 0 recon).
    profile_response = SellerProfilePublic.model_validate(profile)
    profile_response.country = user.country
    return SellersMeResponse(profile=profile_response)


import re  # noqa: E402

_HANDLE_RE = re.compile(r"^[a-z0-9_]{3,30}$")


@router.get(
    "/handle-available/{handle}",
    response_model=HandleAvailabilityResponse,
)
def check_handle_available(
    handle: str,
    db: Annotated[Session, Depends(get_db)],
    _wallet: Annotated[str, Depends(get_current_wallet)],
) -> HandleAvailabilityResponse:
    """
    Return whether a shop handle is available for registration.

    The check is case-insensitive; handles are stored lowercase. The
    endpoint is behind auth so anonymous scripts cannot enumerate taken
    handles (small enumeration defense; not a security boundary).
    """
    normalized = handle.lower().lstrip("@")
    if not _HANDLE_RE.match(normalized):
        return HandleAvailabilityResponse(
            handle=normalized,
            available=False,
            reason="format",
        )

    exists = (
        db.query(SellerProfile)
        .filter(SellerProfile.shop_handle == normalized)
        .first()
    )
    return HandleAvailabilityResponse(
        handle=normalized,
        available=exists is None,
        reason=None if exists is None else "taken",
    )


# ============================================================
# V2 — Sprint J5 Block 6
# ============================================================

@router.get("/{seller_address}/profile", response_model=SellerProfileResponse)
async def get_seller_profile_v2(
    seller_address: str,
    db: AsyncSession = Depends(get_async_db),
    celo: CeloService = Depends(_get_celo_service),
) -> SellerProfileResponse:
    """V2 seller profile: stake + reputation + recent orders count.

    Reads from indexer-populated DB first; falls back to live RPC for
    any field that has no DB row yet (common for never-seen sellers
    or shortly after a fresh deploy).
    """
    addr = seller_address.lower()
    source: str = "indexer"

    # Stake: prefer DB, fall back to RPC
    stake_row = (
        await db.execute(select(Stake).where(Stake.seller_address == addr))
    ).scalar_one_or_none()

    if stake_row is not None:
        stake_block = StakeBlock(
            tier=stake_row.tier,
            amount_usdt=stake_row.amount_usdt,
            active_sales=stake_row.active_sales,
            freeze_count=stake_row.freeze_count,
        )
    else:
        source = "rpc_fallback"
        chain_stake = await celo.get_stake(addr)
        chain_wd = await celo.get_withdrawal(addr)
        stake_block = StakeBlock(
            tier=chain_stake.tier,
            amount_usdt=chain_stake.amount,
            active_sales=chain_stake.active_sales,
            freeze_count=chain_wd.freeze_count,
        )

    # Reputation: prefer DB, fall back to RPC
    rep_row = (
        await db.execute(
            select(ReputationCache).where(ReputationCache.seller_address == addr)
        )
    ).scalar_one_or_none()

    if rep_row is not None:
        rep_block = ReputationBlock.model_validate(rep_row)
    else:
        source = "rpc_fallback"
        chain_rep = await celo.get_reputation(addr)
        rep_block = ReputationBlock(
            orders_completed=chain_rep.orders_completed,
            orders_disputed=chain_rep.orders_disputed,
            disputes_lost=chain_rep.disputes_lost,
            total_volume_usdt=chain_rep.total_volume,
            score=chain_rep.score,
            is_top_seller=chain_rep.is_top_seller,
            status=chain_rep.status,
            last_sanction_at=(
                datetime.fromtimestamp(chain_rep.last_sanction_at, tz=timezone.utc)
                if chain_rep.last_sanction_at
                else None
            ),
            first_order_at=(
                datetime.fromtimestamp(chain_rep.first_order_at, tz=timezone.utc)
                if chain_rep.first_order_at
                else None
            ),
        )

    # Recent orders count (always from indexer; 0 if no rows)
    count_result = await db.execute(
        select(func.count(Order.id)).where(Order.seller_address == addr)
    )
    recent_orders_count = count_result.scalar() or 0

    return SellerProfileResponse(
        seller_address=addr,
        stake=stake_block,
        reputation=rep_block,
        recent_orders_count=recent_orders_count,
        source=source,
    )


# ============================================================
# ADR-036 — Seller self-service (Sprint J6 Block 8 Étape 8.1)
# ============================================================
@router.get("/{seller_address}/orders", response_model=SellerOrdersPage)
async def list_seller_orders(
    seller_address: str,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    page: int = 1,
    page_size: int = 20,
    order_status: str | None = None,
) -> SellerOrdersPage:
    """Public read — returns orders received by this seller wallet.
    Order.seller_address is the canonical link (string, not FK)."""
    if page < 1 or page_size < 1 or page_size > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination",
        )
    addr = seller_address.lower()

    base_filter = [Order.seller_address == addr]
    if order_status:
        base_filter.append(Order.global_status == order_status)

    total = (
        await db.execute(select(func.count(Order.id)).where(*base_filter))
    ).scalar() or 0

    rows = (
        await db.execute(
            select(Order)
            .where(*base_filter)
            .order_by(Order.created_at_chain.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return SellerOrdersPage(
        orders=[SellerOrderItem.model_validate(o) for o in rows],
        pagination={
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": page * page_size < total,
        },
    )


@router.put("/me/profile", response_model=SellerProfilePublic)
async def update_my_profile(
    payload: SellerProfileUpdate,
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> SellerProfilePublic:
    """Self-service profile update. shop_handle stays immutable (would
    break /[handle] URLs).

    `country` writes to the joined User row (single source of truth per
    Block 0 recon), validated against the V1 enum {NGA, GHA, KEN}.
    """
    update_data = payload.model_dump(exclude_unset=True)

    # Country lives on User, not SellerProfile — pull it out of the
    # generic setattr loop.
    new_country = update_data.pop("country", None)
    if new_country is not None:
        valid_countries = {c.value for c in Country}
        if new_country not in valid_countries:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid country. Must be one of {sorted(valid_countries)}.",
            )
        # Eager-load user to write through the FK without a second query.
        user = (
            await db.execute(select(User).where(User.id == seller.user_id))
        ).scalar_one()
        user.country = new_country

    for key, value in update_data.items():
        setattr(seller, key, value)

    await db.commit()
    await db.refresh(seller)

    # Re-read seller with user joined so the response carries country.
    seller_with_user = (
        await db.execute(
            select(SellerProfile)
            .where(SellerProfile.id == seller.id)
            .options(selectinload(SellerProfile.user))
        )
    ).scalar_one()
    response = SellerProfilePublic.model_validate(seller_with_user)
    response.country = seller_with_user.user.country if seller_with_user.user else None
    return response


@router.get("/me/products", response_model=MyProductsListResponse)
async def list_my_products(
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
    include_deleted: bool = False,
) -> MyProductsListResponse:
    """Owner-side product list — surfaces ALL statuses (active + draft +
    paused). 'deleted' soft-deletes excluded by default. Fixes the V1
    visibility limitation of fetchPublicBoutique (which filters
    status='active').

    ADR-036: require_seller_auth.
    """
    stmt = select(Product).where(Product.seller_id == seller.id)
    if not include_deleted:
        stmt = stmt.where(Product.status != "deleted")
    stmt = stmt.order_by(Product.created_at.desc())

    rows = (await db.execute(stmt)).scalars().all()
    items = [MyProductsListItem.model_validate(p) for p in rows]
    return MyProductsListResponse(products=items, total=len(items))


# ============================================================
# J7 Block 6 — credits ledger views
# ============================================================
@router.get("/me/credits/balance")
async def get_my_credits_balance(
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict:
    """Current credits balance. Lazy-grants the welcome bonus (10) on
    first call and the monthly free pack (5) once per calendar UTC
    month, both before computing the balance returned to the caller."""
    await credit_service.grant_welcome_bonus_if_first(seller.id, db)
    await credit_service.ensure_monthly_free_granted(seller.id, db)
    balance = await credit_service.get_balance(seller.id, db)
    return {
        "balance": balance,
        "wallet_address": seller.user.wallet_address,
    }


@router.get("/me/credits/history")
async def get_my_credits_history(
    seller: Annotated[SellerProfile, Depends(require_seller_auth)],
    db: Annotated[AsyncSession, Depends(get_async_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    """Paginated ledger entries, newest first. No lazy grants here —
    /balance is the canonical entry point that triggers them."""
    offset = (page - 1) * page_size
    rows = (
        (
            await db.execute(
                select(SellerCreditsLedger)
                .where(SellerCreditsLedger.seller_id == seller.id)
                .order_by(SellerCreditsLedger.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    total = (
        await db.scalar(
            select(func.count(SellerCreditsLedger.id)).where(
                SellerCreditsLedger.seller_id == seller.id
            )
        )
    ) or 0

    return {
        "entries": [
            {
                "id": str(r.id),
                "credits_delta": r.credits_delta,
                "source": r.source,
                "tx_hash": r.tx_hash,
                "image_id": str(r.image_id) if r.image_id else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": int(total),
    }
