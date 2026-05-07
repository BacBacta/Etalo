"""User-level reads/writes — Sprint J11.7 Block 5 (ADR-045).

Real implementation replacing the J5 stubs. Targets the buyer-side
flow primarily : every visitor that wallet-connects (via MiniPay or
otherwise) should be able to read their own profile and write their
country preference. Auth uses the X-Wallet-Address header pattern
(ADR-036, same dev-mode shortcut as /sellers/me + /me/addresses ;
graduates to JWT in V1.5+).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.enums import Country
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.user import UserMeResponse, UserMeUpdate, UserMeWrapper

router = APIRouter(prefix="/users", tags=["users"])


def _build_response(user: User) -> UserMeResponse:
    """Hydrate has_seller_profile via the SellerProfile relationship.

    Lazy load is acceptable here — /users/me is a low-traffic endpoint
    and the load is one row per call.
    """
    return UserMeResponse(
        id=user.id,
        wallet_address=user.wallet_address,
        country=user.country,
        language=user.language,
        has_seller_profile=user.seller_profile is not None,
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserMeWrapper)
def get_me(
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> UserMeWrapper:
    """Return the User row for the caller, or `{user: null}` if the
    wallet has never been seen by the backend.

    Null shape (vs 404) lets the frontend treat 'first visit' as a
    valid state without surfacing a network error in the console.
    Mirrors the GET /sellers/me pattern.
    """
    user = (
        db.query(User).filter(User.wallet_address == wallet).one_or_none()
    )
    if user is None:
        return UserMeWrapper(user=None)
    return UserMeWrapper(user=_build_response(user))


@router.put("/me", response_model=UserMeResponse)
def update_me(
    payload: UserMeUpdate,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> UserMeResponse:
    """Upsert User-level fields for the caller's wallet.

    Creates the User row if missing (so a fresh wallet can declare its
    country before any other action). Validates country against the V1
    enum {NGA, GHA, KEN}.
    """
    update_data = payload.model_dump(exclude_unset=True)

    # Country validation against the V1 enum.
    new_country = update_data.get("country")
    if new_country is not None:
        valid = {c.value for c in Country}
        if new_country not in valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid country. Must be one of {sorted(valid)}.",
            )

    user = (
        db.query(User).filter(User.wallet_address == wallet).one_or_none()
    )
    if user is None:
        # First visit — create the row with the provided fields.
        user = User(
            wallet_address=wallet,
            country=update_data.get("country"),
            language=update_data.get("language") or "en",
        )
        db.add(user)
    else:
        for key, value in update_data.items():
            if value is not None:
                setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return _build_response(user)
