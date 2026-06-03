"""Auto-release keeper — symmetric counterpart to the auto-refund keeper.

Background task that periodically scans SHIPPED items whose shipment
group has crossed its `finalReleaseAfter` deadline and calls
`EtaloEscrow.triggerAutoReleaseForItem(orderId, itemId)` from the
relayer wallet. The contract function is permissionless ; the keeper
removes the human-in-the-loop step so sellers get paid without
depending on the buyer remembering to confirm receipt.

Why this exists
---------------
Before this keeper, the platform ran an auto-REFUND keeper (pays the
buyer back on seller inactivity, ADR-019) but had NO auto-RELEASE
keeper. The release trigger is permissionless on-chain, but nobody
called it automatically — so an honest seller waited the full timer
AND then depended on the buyer (who has zero incentive to confirm) or
a manual poke. Funds sat idle. This keeper closes that asymmetry : the
buyer is auto-protected, now the seller is auto-paid.

Robustness mirrors the auto-refund keeper :
- Missing relayer key — logs a warning and stays idle.
- Empty queue — debug log + sleep.
- Per-item failures — caught + logged, loop continues.
- "Not yet releasable" / "already released" / "disputed" reverts —
  surfaced as benign skips (clock skew, indexer lag, dispute freeze).

The keeper does NOT touch the DB directly — the indexer's
`handle_item_released` syncs the off-chain mirror once the contract
emits `ItemReleased`. Single source of truth stays on-chain.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.enums import ItemStatus
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.shipment_group import ShipmentGroup

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    from app.services.celo import CeloService
    from app.services.relayer import RelayerTxSender

logger = logging.getLogger(__name__)


# Items eligible for auto-release are those that were shipped but not
# yet released / refunded / disputed. Disputed items are frozen until
# resolution (ADR-031) ; the contract reverts on them anyway, but we
# pre-filter to avoid wasting gas-estimation round-trips.
RELEASABLE_STATUSES = (ItemStatus.SHIPPED, ItemStatus.ARRIVED)

# Defensive guard — skip groups whose finalReleaseAfter is in the very
# recent past (clock skew between the DB clock and the chain). The
# contract enforces the real check ; this just avoids a guaranteed
# revert preview.
CLOCK_SKEW_GUARD = timedelta(seconds=30)


class AutoReleaseKeeper:
    """Long-running coroutine. Construct, then `await keeper.run()`.

    Stops cleanly when `stop()` is called from the FastAPI lifespan
    shutdown hook.
    """

    def __init__(
        self,
        celo: "CeloService",
        session_factory: "async_sessionmaker[AsyncSession]",
        sender: "RelayerTxSender",
        interval_hours: float,
    ) -> None:
        self._celo = celo
        self._session_factory = session_factory
        self._sender = sender
        self._interval_seconds = max(60, int(interval_hours * 3600))
        self._stop_event = asyncio.Event()
        logger.info(
            "auto_release_keeper.initialised relayer=%s interval_seconds=%d",
            sender.address,
            self._interval_seconds,
        )

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._scan_and_release()
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "auto_release_keeper.scan_failed err=%r", exc
                )
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._interval_seconds,
                )
            except asyncio.TimeoutError:
                continue

    async def _scan_and_release(self) -> None:
        now = datetime.now(timezone.utc)
        cutoff = now - CLOCK_SKEW_GUARD

        async with self._session_factory() as db:
            # Join item → shipment_group → order. We need :
            #  - item.status in {Shipped, Arrived}
            #  - group.final_release_after is set AND < now
            #  - the onchain ids for the contract call
            result = await db.execute(
                select(OrderItem)
                .join(
                    ShipmentGroup,
                    OrderItem.shipment_group_id == ShipmentGroup.id,
                )
                .where(OrderItem.status.in_(RELEASABLE_STATUSES))
                .where(ShipmentGroup.final_release_after.is_not(None))
                .where(ShipmentGroup.final_release_after < cutoff)
                .options(
                    selectinload(OrderItem.order),
                    selectinload(OrderItem.shipment_group),
                )
                .order_by(ShipmentGroup.final_release_after.asc())
                .limit(100)
            )
            items = result.scalars().all()

        if not items:
            logger.debug("auto_release_keeper.scan_empty")
            return

        logger.info(
            "auto_release_keeper.scan_started candidates=%d", len(items)
        )
        for item in items:
            await self._maybe_release(item, now)

    async def _maybe_release(self, item: OrderItem, now: datetime) -> None:
        order: Order | None = item.order
        group: ShipmentGroup | None = item.shipment_group
        if order is None or group is None:
            return
        deadline = group.final_release_after
        if deadline is None:
            return
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        if deadline > now:
            return

        try:
            await self._send_release_tx(
                order.onchain_order_id, item.onchain_item_id
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "auto_release_keeper.release_failed onchain_order=%s "
                "onchain_item=%s err=%r",
                order.onchain_order_id,
                item.onchain_item_id,
                exc,
            )

    async def _send_release_tx(
        self, onchain_order_id: int, onchain_item_id: int
    ) -> None:
        # Delegate the nonce/lock/sign/broadcast/receipt mechanics to the
        # shared RelayerTxSender (one authority for both keepers, #134).
        fn = self._celo._escrow.functions.triggerAutoReleaseForItem(
            int(onchain_order_id), int(onchain_item_id)
        )
        await self._sender.send(
            fn,
            gas=300_000,
            label=(
                f"auto_release order={onchain_order_id} "
                f"item={onchain_item_id}"
            ),
        )


def build_release_keeper(
    celo: "CeloService",
    session_factory: "async_sessionmaker[AsyncSession]",
    sender: "RelayerTxSender | None",
) -> AutoReleaseKeeper | None:
    """Construct a release keeper from settings, or None if disabled.

    `sender` is the shared RelayerTxSender (None when no relayer key is
    configured). Caller (FastAPI lifespan) treats None as "do not start
    the task".
    """
    if not settings.auto_release_keeper_enabled:
        logger.info("auto_release_keeper.disabled_via_setting")
        return None
    if sender is None:
        logger.warning(
            "auto_release_keeper.disabled_no_relayer_key — set "
            "RELAYER_PRIVATE_KEY to enable"
        )
        return None
    return AutoReleaseKeeper(
        celo=celo,
        session_factory=session_factory,
        sender=sender,
        interval_hours=settings.auto_release_keeper_interval_hours,
    )
