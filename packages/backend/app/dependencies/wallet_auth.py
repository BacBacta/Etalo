"""
FastAPI dependency : resolve the caller's wallet address.

Extracted from `app.routers.sellers` so the 10+ routers that consume
this don't have to import from a sibling router (which created a
larvae circular-coupling pattern). Sits next to `seller_auth.py` in
the `app/dependencies/` package.

V1 posture (ADR-046) : trusts the `X-Wallet-Address` header when
`settings.enforce_jwt_auth = False`. This is explicitly insecure
and is the hard mainnet gate — on J12 the flag flips to True and
this dependency starts requiring a JWT (binding to be wired in the
same sprint).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import settings


def get_current_wallet(
    x_wallet_address: Annotated[
        str | None, Header(alias="X-Wallet-Address")
    ] = None,
) -> str:
    """
    Resolve the caller's wallet address.

    Development mode (`settings.enforce_jwt_auth = False`) : trust the
    X-Wallet-Address header. Explicitly insecure ; documented in
    ADR-046. Do NOT ship with `enforce_jwt_auth = False`.

    Production mode (`settings.enforce_jwt_auth = True`) : refuse the
    header and return 501 — JWT dependency wiring is the J12 sprint
    item that flips this on.
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
    # Normalize to lowercase ; EIP-55 checksumming happens at write time.
    return x_wallet_address.lower()
