"""Shared relayer transaction sender.

A single relayer key signs for BOTH the auto-refund keeper (ADR-019)
and the auto-release keeper (ADR-058), running as concurrent asyncio
tasks in the same process. `RelayerTxSender` is the single authority for
those txs: one instance is constructed in the FastAPI lifespan and
passed to both keepers.

What it owns (so the invariants live in ONE place, not two hand-synced
keeper copies — see issue #134):

- **The signing account** — derived once from the relayer key.
- **A lock** serializing the nonce-read → sign → broadcast section, so
  the two keepers can't grab the same nonce and drop each other's tx.
- **In-process nonce tracking** — `next = max(node_pending, last_sent+1)`.
  The `"pending"` node count alone is not authoritative across a
  load-balanced RPC pool (a send and the next nonce-read can hit
  different backends), so we never regress below a nonce we already
  broadcast. The reserved nonce is committed ONLY after a successful
  broadcast, so a build/estimate revert (benign skip) leaves no gap.

Receipt waiting happens OUTSIDE the lock (only the broadcast needs
serializing). Replace-by-fee on a stuck/timed-out tx is tracked as a
follow-up in #134 — not yet implemented here.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Nonce read tag — "pending" includes the relayer's broadcast-but-unmined
# txs so back-to-back sends don't reuse a nonce (belt; the in-process
# counter is the suspenders).
RELAYER_NONCE_BLOCK = "pending"

DEFAULT_RECEIPT_TIMEOUT_S = 120

# Replace-by-fee (#134). If a broadcast tx doesn't get a receipt within
# the timeout it's likely stuck (under-priced during a fee spike) and —
# worse — it head-of-line-blocks every later nonce. We re-broadcast the
# SAME nonce at a higher gas price to evict it. Bounded so the escalation
# can't run away: 2 retries × +50% each = at most 2.25× the original
# price. Nodes require a >=~10% bump to accept a replacement; +50% clears
# that with margin.
RBF_MAX_ATTEMPTS = 2
RBF_GAS_PRICE_BUMP_NUM = 150
RBF_GAS_PRICE_BUMP_DEN = 100


class RelayerTxSender:
    """Serializes + sends relayer-signed txs for all keepers."""

    def __init__(
        self,
        w3: Any,
        relayer_private_key: str,
        *,
        receipt_timeout_s: int = DEFAULT_RECEIPT_TIMEOUT_S,
    ) -> None:
        from eth_account import Account

        key = relayer_private_key.strip()
        if not key.startswith("0x"):
            key = "0x" + key
        self._w3 = w3
        self._account = Account.from_key(key)
        self.address = self._account.address
        self._lock = asyncio.Lock()
        self._last_sent_nonce: int | None = None
        self._receipt_timeout_s = receipt_timeout_s

    async def _peek_next_nonce(self) -> int:
        """Compute the nonce to use WITHOUT committing it. Caller holds
        the lock. Never returns a nonce ≤ one we already broadcast."""
        pending = await self._w3.eth.get_transaction_count(
            self.address, RELAYER_NONCE_BLOCK
        )
        if self._last_sent_nonce is not None and pending <= self._last_sent_nonce:
            return self._last_sent_nonce + 1
        return pending

    async def _broadcast(
        self, fn: Any, *, nonce: int, gas: int, gas_price: int, label: str
    ) -> Any | None:
        """Build → sign → broadcast `fn` at an explicit nonce + gasPrice.
        Caller holds the lock. Returns the tx hash, or None if the build
        failed (benign skip). Gas is explicit so build is purely local
        (no re-estimate)."""
        w3 = self._w3
        try:
            tx = await fn.build_transaction(
                {
                    "from": self.address,
                    "nonce": nonce,
                    "gas": gas,
                    "gasPrice": gas_price,
                    "chainId": await w3.eth.chain_id,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.info("relayer.tx_skipped label=%s reason=%r", label, exc)
            return None
        signed = self._account.sign_transaction(tx)
        return await w3.eth.send_raw_transaction(signed.raw_transaction)

    async def _wait_receipt(self, tx_hash: Any, nonce: int, label: str) -> str:
        """Await the receipt for `tx_hash`. Returns confirmed/reverted, or
        'timeout' if no receipt within the window."""
        w3 = self._w3
        try:
            receipt = await asyncio.wait_for(
                w3.eth.wait_for_transaction_receipt(tx_hash, poll_latency=2),
                timeout=self._receipt_timeout_s,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "relayer.receipt_timeout label=%s nonce=%d tx=%s",
                label,
                nonce,
                tx_hash.hex(),
            )
            return "timeout"
        if receipt["status"] != 1:
            logger.warning(
                "relayer.tx_reverted label=%s nonce=%d tx=%s",
                label,
                nonce,
                tx_hash.hex(),
            )
            return "reverted"
        logger.info("relayer.tx_confirmed label=%s nonce=%d", label, nonce)
        return "confirmed"

    async def send(self, fn: Any, *, gas: int, label: str) -> str:
        """Build → sign → broadcast `fn` (a bound web3 contract-function
        call, e.g. `escrow.functions.triggerAutoReleaseForItem(o, i)`),
        await the receipt, and replace-by-fee if it gets stuck. Returns:

          "skipped"   — build failed (nothing broadcast; no nonce gap)
          "confirmed" — mined with status 1 (incl. a late-mined original)
          "reverted"  — mined with status 0
          "sent"      — still no receipt after RBF attempts exhausted

        Never raises for the ordinary on-chain outcomes; logs throughout.
        """
        w3 = self._w3
        async with self._lock:
            gas_price = await w3.eth.gas_price
            nonce = await self._peek_next_nonce()
            tx_hash = await self._broadcast(
                fn, nonce=nonce, gas=gas, gas_price=gas_price, label=label
            )
            if tx_hash is None:
                return "skipped"
            # Commit the nonce only now that it's actually broadcast.
            self._last_sent_nonce = nonce

        logger.info(
            "relayer.tx_sent label=%s nonce=%d tx=%s", label, nonce, tx_hash.hex()
        )

        attempt = 0
        while True:
            status = await self._wait_receipt(tx_hash, nonce, label)
            if status != "timeout":
                return status

            if attempt >= RBF_MAX_ATTEMPTS:
                logger.warning(
                    "relayer.rbf_exhausted label=%s nonce=%d — still pending "
                    "after %d replacements; next scan will retry",
                    label,
                    nonce,
                    attempt,
                )
                return "sent"
            attempt += 1

            # The original may have mined late while we waited — if the
            # mined-nonce advanced past ours, don't double-send.
            mined = await w3.eth.get_transaction_count(self.address, "latest")
            if mined > nonce:
                logger.info(
                    "relayer.tx_mined_late label=%s nonce=%d", label, nonce
                )
                return "confirmed"

            # Replace-by-fee: same nonce, bumped gas price, to evict the
            # stuck (head-of-line-blocking) tx.
            gas_price = gas_price * RBF_GAS_PRICE_BUMP_NUM // RBF_GAS_PRICE_BUMP_DEN
            async with self._lock:
                new_hash = await self._broadcast(
                    fn, nonce=nonce, gas=gas, gas_price=gas_price, label=label
                )
            if new_hash is None:
                # Build now fails (e.g. state changed) — the stuck tx is
                # moot; stop escalating.
                return "skipped"
            tx_hash = new_hash
            logger.warning(
                "relayer.rbf_sent label=%s nonce=%d attempt=%d gasPrice=%d tx=%s",
                label,
                nonce,
                attempt,
                gas_price,
                tx_hash.hex(),
            )


def build_relayer_sender(w3: Any, relayer_private_key: str) -> RelayerTxSender:
    """Factory mirrored on the keeper build_* helpers for lifespan use."""
    return RelayerTxSender(w3, relayer_private_key)
