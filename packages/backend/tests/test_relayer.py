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


def _fn_rec(calls: list):
    """Records (nonce, gasPrice) for each build — for RBF assertions."""
    fn = MagicMock()

    async def _build(tx):
        calls.append((tx["nonce"], tx["gasPrice"]))
        return dict(tx)

    fn.build_transaction = _build
    return fn


def _set_nonces(w3, *, pending: int, latest: int) -> None:
    """Make get_transaction_count return distinct values per block tag."""

    async def _gtc(addr, block):
        return latest if block == "latest" else pending

    w3.eth.get_transaction_count = AsyncMock(side_effect=_gtc)


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


def test_persistent_timeout_rbf_then_sent() -> None:
    """Every receipt wait times out + nonce never advances → RBF retries
    up to the cap, then returns 'sent'. Total broadcasts = 1 + RBF_MAX."""
    from app.services.relayer import RBF_MAX_ATTEMPTS

    w3 = _fake_w3(pending=0)
    _set_nonces(w3, pending=0, latest=0)  # nonce 0 never mines
    w3.eth.wait_for_transaction_receipt = AsyncMock(side_effect=asyncio.TimeoutError)
    s = _sender(w3)
    s._receipt_timeout_s = 0
    calls: list = []
    status = asyncio.run(s.send(_fn_rec(calls), gas=1, label="t"))
    assert status == "sent"
    assert len(calls) == 1 + RBF_MAX_ATTEMPTS
    # All re-broadcasts reuse the SAME nonce…
    assert {n for n, _ in calls} == {0}
    # …at strictly increasing gas prices (+50% each).
    prices = [p for _, p in calls]
    assert prices == sorted(prices) and prices[1] > prices[0]
    assert prices[1] == prices[0] * 150 // 100


def test_rbf_resends_same_nonce_bumped_then_confirms() -> None:
    """Timeout once, nonce not advanced → one RBF resend (same nonce,
    +50% gas), which then confirms."""
    w3 = _fake_w3(pending=7)
    _set_nonces(w3, pending=7, latest=7)
    # First wait raises TimeoutError (simulated stuck tx), second returns
    # a receipt. Non-zero timeout so asyncio.wait_for lets the mock's
    # return value through on the second call.
    w3.eth.wait_for_transaction_receipt = AsyncMock(
        side_effect=[asyncio.TimeoutError, {"status": 1}]
    )
    s = _sender(w3)
    s._receipt_timeout_s = 5
    calls: list = []
    status = asyncio.run(s.send(_fn_rec(calls), gas=1, label="t"))
    assert status == "confirmed"
    assert len(calls) == 2
    assert calls[0][0] == calls[1][0] == 7  # same nonce
    assert calls[1][1] == calls[0][1] * 150 // 100  # bumped gas price


def test_timeout_but_nonce_mined_late_returns_confirmed_no_resend() -> None:
    """Receipt wait times out, but the mined-nonce advanced past ours —
    the original landed late, so we must NOT re-broadcast."""
    w3 = _fake_w3(pending=3)
    _set_nonces(w3, pending=3, latest=4)  # latest=4 > nonce 3 → mined
    w3.eth.wait_for_transaction_receipt = AsyncMock(side_effect=asyncio.TimeoutError)
    s = _sender(w3)
    s._receipt_timeout_s = 0
    calls: list = []
    status = asyncio.run(s.send(_fn_rec(calls), gas=1, label="t"))
    assert status == "confirmed"
    assert len(calls) == 1, "must not re-broadcast a nonce that already mined"
