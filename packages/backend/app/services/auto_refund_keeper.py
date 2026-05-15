"""Auto-refund keeper — ADR-019 enforcement.

Background task that periodically scans funded orders past the seller-
inactivity deadline (7 days intra, 14 days cross-border per ADR-019)
and calls `EtaloEscrow.triggerAutoRefundIfInactive(orderId)` from a
relayer wallet. The contract function is permissionless ; the keeper
just removes the human-in-the-loop step so buyers don't have to remember
to claim.

The keeper is robust to :
- Missing relayer key — logs a warning and stays idle (no exception).
- Empty queue — logs at debug and sleeps.
- Per-order failures — caught + logged, the loop continues.
- "Open dispute blocks auto-refund" revert — ADR-031 ; left to dispute
  resolution flow (buyer / mediator).
- "Deadline not reached" revert — clock skew ; harmless skip.
- "Already refunded" (next refund attempt after AutoRefundInactive
  fires) — the contract reverts on `globalStatus != Funded`, treated
  as a benign skip.

The indexer's `handle_auto_refund_inactive` syncs the off-chain mirror
once the contract emits `AutoRefundInactive`. The keeper does NOT touch
the DB directly — single source of truth stays on-chain.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.config import settings
from app.models.enums import OrderStatus
from app.models.order import Order

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    from app.services.celo import CeloService

logger = logging.getLogger(__name__)


# ADR-019. Cross-border deferred V2 (ADR-041) so V1 only needs intra,
# but we keep both for forward-compat — the contract still encodes the
# 14-day window for `isCrossBorder = true` orders.
SELLER_INACTIVITY_INTRA = timedelta(days=7)
SELLER_INACTIVITY_CROSS = timedelta(days=14)

# Defensive : skip orders funded in the last N seconds even if the SQL
# `funded_at < now() - 7d` predicate matches (shouldn't, but cheap
# belt-and-suspenders).
MIN_AGE_GUARD = timedelta(minutes=1)


class AutoRefundKeeper:
    """Long-running coroutine. Construct, then `await keeper.run()`.

    Stops cleanly when `stop()` is called from the FastAPI lifespan
    shutdown hook.
    """

    def __init__(
        self,
        celo: "CeloService",
        session_factory: "async_sessionmaker[AsyncSession]",
        relayer_private_key: str,
        interval_hours: float,
    ) -> None:
        self._celo = celo
        self._session_factory = session_factory
        self._interval_seconds = max(60, int(interval_hours * 3600))
        self._stop_event = asyncio.Event()

        from eth_account import Account

        # Accept the key with or without 0x prefix to be forgiving.
        key = relayer_private_key.strip()
        if not key.startswith("0x"):
            key = "0x" + key
        self._account = Account.from_key(key)
        self._relayer_address = self._account.address
        logger.info(
            "auto_refund_keeper.initialised relayer=%s interval_seconds=%d",
            self._relayer_address,
            self._interval_seconds,
        )

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._scan_and_refund()
            except Exception as exc:  # noqa: BLE001
                # Never let a transient failure kill the keeper task —
                # log + sleep + retry.
                logger.exception(
                    "auto_refund_keeper.scan_failed err=%r", exc
                )
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    async def _scan_and_refund(self) -> None:
        now = datetime.now(timezone.utc)
        # Pick the *minimum* of the two windows for the SQL predicate ;
        # cross-border orders younger than 14d but older than 7d will
        # be loaded but skipped by the per-order deadline check below.
        cutoff = now - SELLER_INACTIVITY_INTRA - MIN_AGE_GUARD

        async with self._session_factory() as db:
            result = await db.execute(
                select(Order)
                .where(Order.global_status == OrderStatus.FUNDED)
                .where(Order.funded_at.is_not(None))
                .where(Order.funded_at < cutoff)
                .order_by(Order.funded_at.asc())
                .limit(100)
            )
            orders = result.scalars().all()

        if not orders:
            logger.debug("auto_refund_keeper.scan_empty")
            return

        logger.info(
            "auto_refund_keeper.scan_started candidates=%d", len(orders)
        )
        for order in orders:
            await self._maybe_refund(order, now)

    async def _maybe_refund(self, order: Order, now: datetime) -> None:
        # Per-order deadline check accounting for the cross-border window.
        is_cross = bool(getattr(order, "is_cross_border", False))
        window = SELLER_INACTIVITY_CROSS if is_cross else SELLER_INACTIVITY_INTRA
        funded_at = order.funded_at
        if funded_at is None:
            return
        if funded_at.tzinfo is None:
            # Postgres returned naive — treat as UTC.
            funded_at = funded_at.replace(tzinfo=timezone.utc)
        if funded_at + window > now:
            return

        try:
            await self._send_refund_tx(order.onchain_order_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "auto_refund_keeper.refund_failed onchain_id=%s err=%r",
                order.onchain_order_id,
                exc,
            )

    async def _send_refund_tx(self, onchain_order_id: int) -> None:
        w3 = self._celo._w3
        escrow = self._celo._escrow

        # Build the call. The contract reverts on already-refunded /
        # not-funded / open-dispute states ; we surface those as warnings,
        # not errors, so the loop keeps going.
        try:
            tx = await escrow.functions.triggerAutoRefundIfInactive(
                int(onchain_order_id)
            ).build_transaction(
                {
                    "from": self._relayer_address,
                    "nonce": await w3.eth.get_transaction_count(
                        self._relayer_address
                    ),
                    "gas": 250_000,
                    "gasPrice": await w3.eth.gas_price,
                    "chainId": await w3.eth.chain_id,
                }
            )
        except Exception as exc:  # noqa: BLE001
            # Most likely a `eth_estimateGas` revert preview — the build
            # call itself shouldn't fail unless the node reverts the
            # simulation. Log + skip.
            logger.info(
                "auto_refund_keeper.refund_skipped onchain_id=%s reason=%r",
                onchain_order_id,
                exc,
            )
            return

        signed = self._account.sign_transaction(tx)
        tx_hash = await w3.eth.send_raw_transaction(signed.raw_transaction)
        logger.info(
            "auto_refund_keeper.refund_sent onchain_id=%s tx=%s",
            onchain_order_id,
            tx_hash.hex(),
        )

        # Wait for the receipt so we can detect on-chain reverts before
        # moving on — but cap the wait so a stuck tx doesn't freeze the
        # keeper.
        try:
            receipt = await asyncio.wait_for(
                w3.eth.wait_for_transaction_receipt(tx_hash, poll_latency=2),
                timeout=120,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "auto_refund_keeper.receipt_timeout onchain_id=%s tx=%s",
                onchain_order_id,
                tx_hash.hex(),
            )
            return

        if receipt["status"] != 1:
            logger.warning(
                "auto_refund_keeper.tx_reverted onchain_id=%s tx=%s",
                onchain_order_id,
                tx_hash.hex(),
            )
        else:
            logger.info(
                "auto_refund_keeper.refund_confirmed onchain_id=%s",
                onchain_order_id,
            )


def build_keeper(
    celo: "CeloService",
    session_factory: "async_sessionmaker[AsyncSession]",
) -> AutoRefundKeeper | None:
    """Construct a keeper from settings, or return None if disabled.

    Caller (FastAPI lifespan) should treat None as "do not start the
    background task" and log accordingly.
    """
    if not settings.auto_refund_keeper_enabled:
        logger.info("auto_refund_keeper.disabled_via_setting")
        return None
    if not settings.relayer_private_key:
        logger.warning(
            "auto_refund_keeper.disabled_no_relayer_key — set "
            "RELAYER_PRIVATE_KEY to enable"
        )
        return None
    return AutoRefundKeeper(
        celo=celo,
        session_factory=session_factory,
        relayer_private_key=settings.relayer_private_key,
        interval_hours=settings.auto_refund_keeper_interval_hours,
    )
