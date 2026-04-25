"""V2 EIP-191 signed-message auth — Sprint J5 Block 6.

Lightweight V1 pattern (deferred SIWE/EIP-4361 to V1.5):

The client signs a deterministic message:
    "Etalo auth: {METHOD} {PATH} {TIMESTAMP}"

…using the wallet's private key (eth_signTypedData_v4 not needed —
plain personal_sign is enough for this UX). The HTTP request carries
two headers:
    X-Etalo-Signature: 0x<132 hex chars>
    X-Etalo-Timestamp: <unix seconds>

The server reconstructs the message, runs ecrecover, and returns
the recovered address (lowercased). Routes that need authorization
take this address as a FastAPI dependency and verify it matches the
buyer/seller of the resource.

Replay window: timestamp must be within [now - 300s, now + 60s].
"""
from __future__ import annotations

import time

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import Header, HTTPException, Request, status


# Replay window (seconds)
MAX_AGE_SECONDS = 300  # 5 min back
MAX_FUTURE_SECONDS = 60  # 1 min forward (clock skew tolerance)


def _build_message(method: str, path: str, timestamp: int) -> str:
    return f"Etalo auth: {method.upper()} {path} {timestamp}"


def recover_address(method: str, path: str, timestamp: int, signature: str) -> str:
    """Recover the signing address. Returns lowercase address. Raises
    HTTPException 401 on any decode failure or replay-window violation."""
    now = int(time.time())
    if timestamp < now - MAX_AGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature timestamp too old (replay protection)",
        )
    if timestamp > now + MAX_FUTURE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature timestamp in the future",
        )

    message = _build_message(method, path, timestamp)
    encoded = encode_defunct(text=message)
    try:
        recovered = Account.recover_message(encoded, signature=signature)
    except Exception:  # noqa: BLE001 — any decode error → 401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )
    return recovered.lower()


async def verify_signature(
    request: Request,
    x_etalo_signature: str = Header(..., alias="X-Etalo-Signature"),
    x_etalo_timestamp: int = Header(..., alias="X-Etalo-Timestamp"),
) -> str:
    """FastAPI dependency: returns the recovered (lowercased) address.

    Endpoints then verify that this address matches the buyer or
    seller of the resource being mutated.
    """
    method = request.method
    # Strip query string from path; signed message commits to the
    # canonical path only.
    path = request.url.path
    return recover_address(method, path, x_etalo_timestamp, x_etalo_signature)
