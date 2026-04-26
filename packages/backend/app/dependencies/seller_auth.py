"""ADR-036 — `require_seller_auth` FastAPI dependency.

Inlines the X-Wallet-Address header validation that `get_current_wallet`
in routers/sellers.py performs (we can't import from there without a
circular dep), then loads the SellerProfile + User and returns the
profile ready for ownership checks.

Routes that just need a wallet (no profile lookup) keep using the
existing `get_current_wallet`.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_async_db
from app.models.seller_profile import SellerProfile
from app.models.user import User


async def require_seller_auth(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    x_wallet_address: Annotated[
        str | None, Header(alias="X-Wallet-Address")
    ] = None,
) -> SellerProfile:
    """Returns the SellerProfile for the connected wallet, with `.user`
    eager-loaded. Cohérent avec routers/sellers.get_current_wallet on
    error semantics (401 missing header in dev, 501 in prod-ish).
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

    addr = x_wallet_address.lower()
    seller = (
        await db.execute(
            select(SellerProfile)
            .join(User, SellerProfile.user_id == User.id)
            .where(User.wallet_address == addr)
            .options(selectinload(SellerProfile.user))
        )
    ).scalar_one_or_none()

    if seller is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No seller profile registered for this wallet",
        )
    return seller
