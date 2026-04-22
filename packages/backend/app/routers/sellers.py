# SECURITY WARNING: Temporary auth via X-Wallet-Address header.
# Replace with JWT verification before any deployment.
# See docs/DECISIONS.md 2026-04-22 entry on X-Wallet-Address header.
#
# When settings.enforce_jwt_auth is True (production), the header is
# rejected and the endpoint returns 501 until JWT auth is wired.

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.schemas.seller import (
    HandleAvailabilityResponse,
    SellersMeResponse,
    SellerProfilePublic,
)

router = APIRouter(prefix="/sellers", tags=["sellers"])


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

    return SellersMeResponse(profile=SellerProfilePublic.model_validate(profile))


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
