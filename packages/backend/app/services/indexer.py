"""V2 event indexer — async polling loop.

Architecture:
- Run as asyncio.create_task() launched in FastAPI lifespan.
- Each cycle, for each tracked contract:
  - Read indexer_state.last_processed_block (default = INDEXER_START_BLOCK).
  - Compute target = current_chain_block - 0 (no confirmation lag V1).
  - Re-read INDEXER_REORG_DEPTH blocks for reorg defense (idempotent
    on UNIQUE(tx_hash, log_index)).
  - Fetch eth_getLogs in INDEXER_BLOCK_CHUNK_SIZE chunks.
  - Decode each log with the matching contract ABI.
  - For each (event_name, args) pair: dispatch to HANDLERS registry.
  - After all events for the chunk processed: update checkpoint.
  - Sleep INDEXER_POLL_INTERVAL_SECONDS.

Idempotency:
- Before invoking the handler, check indexer_events_processed for
  (tx_hash, log_index). If found, skip. Otherwise insert AFTER the
  handler succeeds (same DB session = atomic).

Reorg V1: re-read last 3 blocks. Reorg-erase (event removed) is NOT
detected — V1.5 will add block-hash tracking. Acceptable given Celo
PoS finality.

Logging: each cycle logs a one-line summary at INFO. Per-event noise
is logged at DEBUG.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.indexer_event import IndexerEvent
from app.models.indexer_state import IndexerState
from app.services.celo import CeloService
from app.services.indexer_handlers import HANDLERS


logger = logging.getLogger(__name__)


CONTRACT_ATTR = {
    "EtaloEscrow": "_escrow",
    "EtaloDispute": "_dispute",
    "EtaloStake": "_stake",
    "EtaloReputation": "_reputation",
    "EtaloVoting": "_voting",
}


class Indexer:
    def __init__(
        self,
        celo: CeloService,
        session_factory: async_sessionmaker[AsyncSession],
        contracts_to_index: list[str] | None = None,
    ) -> None:
        self._celo = celo
        self._session_factory = session_factory
        self._stop = asyncio.Event()
        # Default: index the 4 contracts we have handlers for. Voting is
        # deferred to V1.5 per Sprint J5 Block 5 scope decision.
        self._contracts = contracts_to_index or [
            "EtaloEscrow",
            "EtaloDispute",
            "EtaloStake",
            "EtaloReputation",
        ]

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        """Main loop. Runs until stop() is called."""
        logger.info(
            "Indexer started — contracts=%s poll=%ds chunk=%d reorg_depth=%d",
            self._contracts,
            settings.indexer_poll_interval_seconds,
            settings.indexer_block_chunk_size,
            settings.indexer_reorg_depth,
        )
        try:
            while not self._stop.is_set():
                try:
                    await self._poll_cycle()
                except Exception:  # noqa: BLE001 — never let the loop die
                    logger.exception("Indexer cycle failed; retrying after sleep")
                # Sleep with cancellation support
                try:
                    await asyncio.wait_for(
                        self._stop.wait(),
                        timeout=settings.indexer_poll_interval_seconds,
                    )
                except asyncio.TimeoutError:
                    pass
        finally:
            logger.info("Indexer stopped")

    async def _poll_cycle(self) -> None:
        # Use get_block("latest")["number"] instead of `eth.block_number`
        # because the latter is an awaitable property which is awkward to
        # mock; methods are simpler with AsyncMock.
        latest = await self._celo._w3.eth.get_block("latest")
        current_block = latest["number"]
        for contract_name in self._contracts:
            await self._poll_contract(contract_name, current_block)

    async def _poll_contract(self, contract_name: str, current_block: int) -> None:
        async with self._session_factory() as db:
            last = await self._get_last_processed(db, contract_name)
            # Re-read last N blocks for reorg defense
            from_block = max(0, last - settings.indexer_reorg_depth + 1)
            to_block = current_block

            if from_block > to_block:
                return

            chunk = settings.indexer_block_chunk_size
            chunk_start = from_block
            events_seen = 0
            while chunk_start <= to_block and not self._stop.is_set():
                chunk_end = min(chunk_start + chunk - 1, to_block)
                count = await self._poll_chunk(db, contract_name, chunk_start, chunk_end)
                events_seen += count
                chunk_start = chunk_end + 1

            await self._set_last_processed(db, contract_name, to_block)
            await db.commit()
            logger.info(
                "Polled blocks %d..%d on %s (%d events processed)",
                from_block,
                to_block,
                contract_name,
                events_seen,
            )

    async def _poll_chunk(
        self,
        db: AsyncSession,
        contract_name: str,
        from_block: int,
        to_block: int,
    ) -> int:
        contract = getattr(self._celo, CONTRACT_ATTR[contract_name])
        # eth.get_logs with address filter — fetches ALL events on this contract
        # in the block range. We then filter by event name in the dispatcher.
        logs = await self._celo._w3.eth.get_logs(
            {
                "address": contract.address,
                "fromBlock": from_block,
                "toBlock": to_block,
            }
        )
        processed = 0
        for raw_log in logs:
            decoded = self._decode_log(contract, raw_log)
            if decoded is None:
                continue
            event_name, event_data = decoded
            handler = HANDLERS.get((contract_name, event_name))
            if handler is None:
                continue  # not a handler we care about (admin setters, etc.)

            tx_hash = raw_log["transactionHash"].hex()
            if not tx_hash.startswith("0x"):
                tx_hash = "0x" + tx_hash
            tx_hash = tx_hash.lower()
            log_index = raw_log["logIndex"]

            # Idempotency check
            already = await db.execute(
                select(IndexerEvent).where(
                    (IndexerEvent.tx_hash == tx_hash)
                    & (IndexerEvent.log_index == log_index)
                )
            )
            if already.scalar_one_or_none() is not None:
                continue

            # Run handler then mark processed (same transaction)
            try:
                await handler(event_data, db, {"celo": self._celo})
                db.add(
                    IndexerEvent(
                        tx_hash=tx_hash,
                        log_index=log_index,
                        contract_name=contract_name,
                        event_name=event_name,
                        block_number=raw_log["blockNumber"],
                    )
                )
                await db.flush()  # surface FK violations early
                processed += 1
            except IntegrityError:
                # Race condition: another worker beat us. Roll back this
                # event and continue.
                await db.rollback()
                logger.debug(
                    "Idempotency hit on %s/%s tx=%s log=%d",
                    contract_name,
                    event_name,
                    tx_hash,
                    log_index,
                )
            except Exception:
                logger.exception(
                    "Handler failed for %s/%s tx=%s log=%d",
                    contract_name,
                    event_name,
                    tx_hash,
                    log_index,
                )
                await db.rollback()
        return processed

    def _decode_log(
        self, contract: Any, raw_log: Any
    ) -> tuple[str, dict[str, Any]] | None:
        """Decode a raw log via the contract's events. Returns (name, decoded_dict)
        or None if no event in the contract ABI matches."""
        for event_obj in contract.events:
            try:
                decoded = event_obj().process_log(raw_log)
                # AttributeDict-like object with .event, .args, .blockNumber,
                # .transactionHash, .logIndex
                return decoded["event"], decoded
            except Exception:
                continue
        return None

    # ------------------------------------------------------------
    # Checkpoint state
    # ------------------------------------------------------------
    async def _get_last_processed(self, db: AsyncSession, contract_name: str) -> int:
        result = await db.execute(
            select(IndexerState).where(IndexerState.contract_name == contract_name)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return settings.indexer_start_block - 1
        return row.last_processed_block

    async def _set_last_processed(
        self, db: AsyncSession, contract_name: str, block: int
    ) -> None:
        result = await db.execute(
            select(IndexerState).where(IndexerState.contract_name == contract_name)
        )
        row = result.scalar_one_or_none()
        if row is None:
            db.add(
                IndexerState(contract_name=contract_name, last_processed_block=block)
            )
        else:
            row.last_processed_block = block
