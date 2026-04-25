"""E2E tests for the V2 indexer — Sprint J5 Block 7.

Single test exercising the full polling pipeline (Web3 → eth_getLogs
→ decode → handler → DB) over a small recent block range, validating
the mechanics without depending on the slow J4 first-catchup sync.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session_factory
from app.models.indexer_state import IndexerState
from app.services.celo import CeloService
from app.services.indexer import Indexer


pytestmark = pytest.mark.asyncio


async def test_indexer_one_cycle_runs_without_error(db: AsyncSession):
    """End-to-end pipeline check: run a real poll cycle against Sepolia
    and verify it completes without exception, writes/updates the
    indexer_state row for every tracked contract.

    We deliberately don't assert on the exact `last_processed_block`
    value because Alchemy load-balances RPC reads across multiple
    nodes whose head-block view diverges by ±20 blocks. The Block 5
    unit tests cover the exact-checkpoint-advance mechanics with
    deterministic mocks.
    """
    celo = CeloService.from_settings()
    factory = get_async_session_factory()
    contracts = ["EtaloEscrow", "EtaloDispute", "EtaloStake", "EtaloReputation"]

    indexer = Indexer(
        celo=celo,
        session_factory=factory,
        contracts_to_index=contracts,
    )

    # Run one cycle — should complete without exception.
    await indexer._poll_cycle()

    # Each tracked contract must now have a row (existing or freshly created).
    for c in contracts:
        row = (
            await db.execute(
                select(IndexerState).where(IndexerState.contract_name == c)
            )
        ).scalar_one_or_none()
        assert row is not None, f"No indexer_state row for {c} after cycle"
        assert row.last_processed_block > 0, (
            f"{c} checkpoint not initialized: {row.last_processed_block}"
        )
