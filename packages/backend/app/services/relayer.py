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

    async def send(self, fn: Any, *, gas: int, label: str) -> str:
        """Build → sign → broadcast `fn` (a bound web3 contract-function
        call, e.g. `escrow.functions.triggerAutoReleaseForItem(o, i)`),
        then await the receipt. Returns one of:

          "skipped"   — build/estimate reverted (benign: not yet
                        actionable, already done, or disputed)
          "sent"      — broadcast but no receipt within the window
          "confirmed" — mined with status 1
          "reverted"  — mined with status 0

        Never raises for the ordinary on-chain outcomes; logs throughout.
        """
        w3 = self._w3
        async with self._lock:
            try:
                gas_price = await w3.eth.gas_price
                nonce = await self._peek_next_nonce()
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
                # estimate/build revert preview — nothing broadcast, so
                # the reserved nonce was never committed (no gap).
                logger.info("relayer.tx_skipped label=%s reason=%r", label, exc)
                return "skipped"

            signed = self._account.sign_transaction(tx)
            tx_hash = await w3.eth.send_raw_transaction(signed.raw_transaction)
            # Commit the nonce only now that it's actually broadcast.
            self._last_sent_nonce = nonce

        logger.info(
            "relayer.tx_sent label=%s nonce=%d tx=%s",
            label,
            nonce,
            tx_hash.hex(),
        )

        try:
            receipt = await asyncio.wait_for(
                w3.eth.wait_for_transaction_receipt(tx_hash, poll_latency=2),
                timeout=self._receipt_timeout_s,
            )
        except asyncio.TimeoutError:
            # Stuck tx. Replace-by-fee is tracked in #134 ; for now the
            # next scan re-attempts and the in-process nonce counter keeps
            # later sends from colliding with this still-pending one.
            logger.warning(
                "relayer.receipt_timeout label=%s nonce=%d tx=%s",
                label,
                nonce,
                tx_hash.hex(),
            )
            return "sent"

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


def build_relayer_sender(w3: Any, relayer_private_key: str) -> RelayerTxSender:
    """Factory mirrored on the keeper build_* helpers for lifespan use."""
    return RelayerTxSender(w3, relayer_private_key)
