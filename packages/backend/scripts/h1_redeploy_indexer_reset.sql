-- H-1 redeploy — indexer state UPDATE (Option C, validated by Mike 2026-05-05)
--
-- After the H-1 fix bundle merged on main and the V2 contract suite was
-- redeployed on Celo Sepolia (commit 7ca0dea on ops/sepolia-redeploy-h1-fix),
-- the contract addresses changed but the indexer_state rows in Postgres
-- are keyed on contract_name (not address) and still hold last_processed_block
-- values from the old chain history.
--
-- Because the new contracts were deployed at block 24720376 (MockUSDT, the
-- earliest of the redeploy batch) — well above any pre-redeploy checkpoint —
-- the cleanest correction is to bump every indexer_state row to that block,
-- forcing the indexer to re-scan the new contracts from their actual deploy
-- block on the next poll cycle.
--
-- Run BEFORE restarting the FastAPI backend. Idempotent (running twice has
-- no effect since last_processed_block is already at 24720376 after first
-- run, and the WHERE clause is per-contract).
--
-- Companion changes (already on this branch):
--   packages/backend/app/config.py
--     - 7 etalo_*_address defaults bumped to post-H-1 addresses
--     - indexer_start_block bumped from 23761654 to 24720376
--
-- Verification post-execution:
--   SELECT contract_name, last_processed_block FROM indexer_state;
--   -> all rows should show last_processed_block >= 24720376

UPDATE indexer_state
SET last_processed_block = 24720376
WHERE contract_name IN (
  'EtaloEscrow',
  'EtaloDispute',
  'EtaloStake',
  'EtaloReputation',
  'EtaloVoting',
  'EtaloCredits'
);

-- Note: indexer_events_processed rows from pre-redeploy contracts are
-- retained as historical audit trail. They reference now-deprecated
-- contract addresses (see docs/DEPLOYMENTS_HISTORY.md). The UNIQUE
-- (tx_hash, log_index) constraint prevents any double-processing risk
-- when the indexer re-scans the new contracts.
