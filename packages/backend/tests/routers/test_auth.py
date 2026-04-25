"""Unit tests for app/auth.py (EIP-191 signed message recovery)."""
from __future__ import annotations

import time

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException

from app.auth import recover_address


# A deterministic test wallet (private key only used in tests, never real funds)
TEST_PK = "0x" + "11" * 32  # 0x1111...1111
TEST_ADDR = Account.from_key(TEST_PK).address.lower()


def _sign(method: str, path: str, timestamp: int, pk: str = TEST_PK) -> str:
    message = f"Etalo auth: {method.upper()} {path} {timestamp}"
    encoded = encode_defunct(text=message)
    signed = Account.sign_message(encoded, private_key=pk)
    return signed.signature.hex() if signed.signature.hex().startswith("0x") else "0x" + signed.signature.hex()


def test_recover_happy_path():
    ts = int(time.time())
    sig = _sign("POST", "/orders/42/metadata", ts)
    recovered = recover_address("POST", "/orders/42/metadata", ts, sig)
    assert recovered == TEST_ADDR


def test_recover_method_case_insensitive():
    ts = int(time.time())
    # Sign with uppercase, send lowercase — both reconstruct uppercase
    sig = _sign("POST", "/orders/42/metadata", ts)
    recovered = recover_address("post", "/orders/42/metadata", ts, sig)
    assert recovered == TEST_ADDR


def test_expired_timestamp_raises_401():
    ts = int(time.time()) - 10_000  # > 5 min ago
    sig = _sign("POST", "/orders/42/metadata", ts)
    with pytest.raises(HTTPException) as excinfo:
        recover_address("POST", "/orders/42/metadata", ts, sig)
    assert excinfo.value.status_code == 401
    assert "too old" in excinfo.value.detail.lower()


def test_future_timestamp_raises_401():
    ts = int(time.time()) + 1000
    sig = _sign("POST", "/orders/42/metadata", ts)
    with pytest.raises(HTTPException) as excinfo:
        recover_address("POST", "/orders/42/metadata", ts, sig)
    assert excinfo.value.status_code == 401
    assert "future" in excinfo.value.detail.lower()


def test_malformed_signature_raises_401():
    ts = int(time.time())
    # Clearly invalid signature (wrong length)
    bad_sig = "0xdeadbeef"
    with pytest.raises(HTTPException) as excinfo:
        recover_address("POST", "/orders/42/metadata", ts, bad_sig)
    assert excinfo.value.status_code == 401


def test_wrong_path_recovers_different_address():
    """If client signs path A but sends path B, the recovered address
    won't match (the recovered account is whoever signed the OTHER message)."""
    ts = int(time.time())
    sig = _sign("POST", "/orders/42/metadata", ts)
    # Verify a different path
    recovered = recover_address("POST", "/orders/99/metadata", ts, sig)
    assert recovered != TEST_ADDR  # different message → different recovered addr


def test_wrong_timestamp_recovers_different_address():
    ts = int(time.time())
    sig = _sign("POST", "/orders/42/metadata", ts)
    recovered = recover_address("POST", "/orders/42/metadata", ts + 1, sig)
    assert recovered != TEST_ADDR
