-- ADR-057 cutover — off-chain mirror reset for the new EtaloEscrow
--
-- Context. After the satellites were re-pointed and ETALO_ESCROW_ADDRESS
-- was swapped to the new escrow 0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671,
-- the indexer started watching the NEW escrow. But the new escrow's order
-- IDs restart at 1, and the mirror's `orders.onchain_order_id` is UNIQUE
-- and NOT namespaced by escrow address — so the new escrow's orders 1..14
-- COLLIDE with the old escrow's already-mirrored orders 1..14:
--   - handle_order_created(new #1) -> INSERT onchain_order_id=1 -> IntegrityError
--     -> rolled back (event NOT marked processed), so the new order never
--        lands in the mirror;
--   - handle_order_funded(new #1)  -> looks up onchain_order_id=1, finds the
--     OLD #1, and overwrites ITS status -> the app shows the wrong order.
-- Funds are unaffected (correctly escrowed on-chain); this is purely the
-- off-chain mirror.
--
-- Fix. The old escrow is fully drained (totalEscrowed == 0) and its orders
-- are disposable launch/test data (migration plan §1 = fresh start, no state
-- migration). So we wipe the order mirror, clear the escrow's processed-event
-- dedup rows (some new-escrow events succeeded against the OLD #1 row and are
-- marked processed — they must reprocess), and rewind ONLY the EtaloEscrow
-- indexer cursor to the new escrow's deploy block. Other contracts
-- (Dispute/Stake/Reputation/Credits/Voting) are UNCHANGED — their addresses
-- didn't move, their mirror data + cursors stay.
--
-- Run on the prod DB, then restart the backend (clean re-scan on next poll).
-- The indexer re-reads last_processed_block from the DB every cycle, so it
-- backfills 68596818..head in a single cycle (~1-2 min) and inserts the new
-- escrow's orders 1,2,... cleanly.
--
-- Verification post-run:
--   SELECT count(*) FROM orders;                         -- 0, then climbs as it re-indexes
--   SELECT contract_name,last_processed_block FROM indexer_state;  -- EtaloEscrow = 68596818 (briefly)
--   curl .../api/v1/orders/by-onchain-id/1               -- new escrow's #1 (0.05 USDT, Myboutique)

-- 1. Wipe the order mirror. ON DELETE CASCADE clears order_items,
--    shipment_groups and disputes (-> dispute_votes). All 14 rows are
--    old-escrow test data (the new ones could not insert).
DELETE FROM orders;

-- 2. Clear the escrow's processed-event dedup so new-escrow events that were
--    already marked processed (the fundOrder that hit the OLD #1) reprocess.
--    Old-escrow events live in blocks < 68596818 and are never re-scanned
--    (cursor rewinds only to the new deploy block, and the indexer now polls
--    the new address only), so clearing the whole EtaloEscrow set is safe.
DELETE FROM indexer_events_processed WHERE contract_name = 'EtaloEscrow';

-- 3. Rewind ONLY the EtaloEscrow cursor to the new escrow's deploy block.
UPDATE indexer_state
SET last_processed_block = 68596818
WHERE contract_name = 'EtaloEscrow';
