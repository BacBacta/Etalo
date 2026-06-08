"""Unit tests for RelayerTxSender (#134).

Covers account derivation + the in-process nonce tracking that keeps the
two keepers (sharing one relayer key) from reusing a nonce even when the
node's "pending" count regresses, and the skip path leaving no nonce gap.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.relayer import RelayerTxSender

# Well-known Hardhat/Foundry dev key — NEVER used for anything real.
DEV_TEST_KEY = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)
DEV_TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


class _Awaitable:
    """Mimics an AsyncWeb3 awaitable property (e.g. w3.eth.gas_price)."""

    def __init__(self, value):
        self._value = value

    def __await__(self):
        async def _coro():
            return self._value

        return _coro().__await__()


def _fake_w3(pending: int):
    eth = SimpleNamespace()
    eth.gas_price = _Awaitable(1_000_000)
    eth.chain_id = _Awaitable(42220)
    eth.get_transaction_count = AsyncMock(return_value=pending)
    eth.send_raw_transaction = AsyncMock(
        return_value=SimpleNamespace(hex=lambda: "0xdead")
    )
    eth.wait_for_transaction_receipt = AsyncMock(return_value={"status": 1})
    return SimpleNamespace(eth=eth)


def _sender(w3) -> RelayerTxSender:
    s = RelayerTxSender(w3, DEV_TEST_KEY)
    # Replace the real signing account so we don't need a valid tx dict.
    s._account = MagicMock()
    s._account.sign_transaction = MagicMock(
        return_value=SimpleNamespace(raw_transaction=b"\x01")
    )
    return s


def _fn_ok(nonce_box: list):
    """A bound-contract-fn mock whose build_transaction succeeds and
    records the nonce it was handed."""
    fn = MagicMock()

    async def _build(tx):
        nonce_box.append(tx["nonce"])
        return dict(tx)

    fn.build_transaction = _build
    return fn


def _fn_revert():
    fn = MagicMock()

    async def _build(tx):
        raise ValueError("execution reverted: Not yet releasable")

    fn.build_transaction = _build
    return fn


def test_address_derived_from_key() -> None:
    s = RelayerTxSender(_fake_w3(0), DEV_TEST_KEY)
    assert s.address == DEV_TEST_ADDR


def test_accepts_key_without_0x_prefix() -> None:
    s = RelayerTxSender(_fake_w3(0), DEV_TEST_KEY[2:])
    assert s.address == DEV_TEST_ADDR


def test_malformed_key_raises_so_lifespan_can_catch() -> None:
    """A non-hex / accented placeholder (e.g. the literal '<clé>') must
    raise here — the FastAPI lifespan wraps this in try/except and
    disables the keepers instead of crashing the API. Guards the prod
    incident where RELAYER_PRIVATE_KEY='<clé>' took the backend down."""
    import pytest

    with pytest.raises(Exception):
        RelayerTxSender(_fake_w3(0), "<clé>")


def test_happy_send_commits_nonce_and_confirms() -> None:
    w3 = _fake_w3(pending=5)
    s = _sender(w3)
    used: list = []
    status = asyncio.run(s.send(_fn_ok(used), gas=300_000, label="t"))
    assert status == "confirmed"
    assert used == [5]
    assert s._last_sent_nonce == 5


def test_skip_on_build_revert_leaves_no_nonce_gap() -> None:
    w3 = _fake_w3(pending=5)
    s = _sender(w3)
    status = asyncio.run(s.send(_fn_revert(), gas=300_000, label="t"))
    assert status == "skipped"
    # Nonce was peeked but NOT committed — a later send reuses 5, no gap.
    assert s._last_sent_nonce is None
    used: list = []
    asyncio.run(s.send(_fn_ok(used), gas=300_000, label="t2"))
    assert used == [5]


def test_nonce_never_regresses_below_last_sent() -> None:
    # Node 'pending' regresses (e.g. multi-RPC pool returns a stale value
    # that doesn't yet include our just-sent tx). The sender must hand out
    # last_sent+1, not the stale pending.
    w3 = _fake_w3(pending=5)
    s = _sender(w3)
    a: list = []
    asyncio.run(s.send(_fn_ok(a), gas=1, label="a"))
    assert a == [5] and s._last_sent_nonce == 5

    w3.eth.get_transaction_count = AsyncMock(return_value=5)  # regressed
    b: list = []
    asyncio.run(s.send(_fn_ok(b), gas=1, label="b"))
    assert b == [6], "must use last_sent+1, not the stale pending=5"
    assert s._last_sent_nonce == 6


def test_reverted_receipt_returns_reverted() -> None:
    w3 = _fake_w3(pending=0)
    w3.eth.wait_for_transaction_receipt = AsyncMock(return_value={"status": 0})
    s = _sender(w3)
    status = asyncio.run(s.send(_fn_ok([]), gas=1, label="t"))
    assert status == "reverted"


def test_receipt_timeout_returns_sent() -> None:
    w3 = _fake_w3(pending=0)
    # The receipt wait raising TimeoutError → send returns "sent".
    w3.eth.wait_for_transaction_receipt = AsyncMock(side_effect=asyncio.TimeoutError)
    s = _sender(w3)
    s._receipt_timeout_s = 0
    status = asyncio.run(s.send(_fn_ok([]), gas=1, label="t"))
    assert status == "sent"
