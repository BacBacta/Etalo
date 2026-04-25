"""Stateless HMAC-SHA256 cart token.

The token contains the resolved cart (validated + locked at issue time)
and a 15-minute TTL. The Mini App resolves the token to obtain the
groups + seller addresses needed for `createOrderWithItems` calls.

Token format: `<urlsafe_b64(envelope_json)>.<hex(hmac_sha256)>`

Compatible with ADR-034: the token is a server-issued opaque value, not
a user-signed message — no MiniPay sign prompt.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from app.config import settings

TTL_MINUTES = 15


def _sign(payload_b64: bytes) -> str:
    secret = settings.cart_token_secret.encode("utf-8")
    return hmac.new(secret, payload_b64, hashlib.sha256).hexdigest()


def issue_token(cart_dict: dict) -> tuple[str, datetime]:
    """Sign a cart payload. Returns (token, expires_at_utc)."""
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=TTL_MINUTES)
    envelope = {
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "cart": cart_dict,
    }
    # sort_keys ensures deterministic JSON for any future debug compare;
    # separators strip whitespace for compactness.
    payload = json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    payload_b64 = base64.urlsafe_b64encode(payload)
    sig = _sign(payload_b64)
    return f"{payload_b64.decode('ascii')}.{sig}", exp


def verify_token(token: str) -> dict:
    """Verify signature + TTL. Returns the envelope dict.

    Raises ValueError with one of:
      - "malformed_token"     — missing dot separator
      - "invalid_signature"   — HMAC mismatch
      - "malformed_payload"   — base64/json decode failed
      - "expired"             — exp < now
    """
    try:
        b64_part, sig_part = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("malformed_token") from exc

    expected_sig = _sign(b64_part.encode("ascii"))
    if not hmac.compare_digest(expected_sig, sig_part):
        raise ValueError("invalid_signature")

    try:
        payload = base64.urlsafe_b64decode(b64_part.encode("ascii"))
        envelope = json.loads(payload)
    except Exception as exc:  # noqa: BLE001 — opaque catch on purpose
        raise ValueError("malformed_payload") from exc

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if envelope.get("exp", 0) < now_ts:
        raise ValueError("expired")

    return envelope
