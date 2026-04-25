# Indexer handlers — TODO

Block 5 (this commit) ships **15 core handlers** covering the
critical V2 lifecycle (Order create → fund → ship → arrive → release
→ complete; Dispute open → resolve; Stake deposit / slash /
auto-downgrade; Reputation order recorded).

The remaining **25 handlers** below are deferred to Block 5b or
in-line as endpoint needs surface. Each entry: contract / event /
1-line scope.

---

## EtaloEscrow (9 deferred / 17 total — 8 done)

- `OrderCancelled(orderId)` — set Order.global_status = Cancelled
- `ItemCompleted(orderId, itemId)` — fired alongside ItemReleased; redundant
  with handle_item_released for now (consider in Block 5b for state
  reconciliation belt-and-braces)
- `ItemDisputeResolved(orderId, itemId, refundAmount)` — Item back to
  Released or Refunded depending on refund vs itemPrice
- `ForceRefundExecuted(orderId, reasonHash, refundAmount)` — admin
  emergency, ADR-023; transition order/items to Refunded
- `LegalHoldRegistered(orderId, registeredAt, registrarAddress)` — log
  to a yet-to-create LegalHold model
- `LegalHoldCleared(orderId, timestamp)` — companion to above
- `EmergencyPauseActivated(admin, pausedUntil)` — log to AdminAction model
- `AutoRefundInactive(orderId, timestamp)` — order timed out, transition
  to Refunded (mirrors handle_order_completed but for the other terminal)
- `AutoReleaseTriggered(orderId, itemId)` — fired on permissionless
  triggerFinalRelease; updates Item.released_amount

## EtaloDispute (1 deferred / 4 total — 3 done)

- `DisputeEscalated(disputeId, newLevel)` — update Dispute.level on
  N1→N2 or N2→N3 transitions; capture new deadline timestamps

## EtaloStake (8 deferred / 11 total — 3 done)

- `StakeUpgraded(seller, oldTier, newTier, addedAmount)` — same
  pattern as StakeDeposited but for tier climb (delta may be 0 per ADR-028)
- `StakeToppedUp(seller, amount, newStake)` — increment Stake.amount
  without tier change (currently blocked by ADR-033 for tier=None
  but indexer should still handle if it fires)
- `WithdrawalInitiated(seller, amount, unlockAt)` — populate
  Stake.withdrawal_* embedded fields, set withdrawal_active=true
- `WithdrawalExecuted(seller, amount)` — clear withdrawal_*, decrement
  Stake.amount
- `WithdrawalCancelled(seller)` — clear withdrawal_*, no amount change
- `WithdrawalPaused(seller, disputeId)` — increment Stake.freeze_count,
  capture frozen_remaining if going 0→1
- `WithdrawalResumed(seller, newUnlockAt)` — decrement freeze_count,
  recompute unlock_at from frozen_remaining if going N→0

## EtaloReputation (5 deferred / 6 total — 1 done)

- `DisputeRecorded(seller, orderId, sellerLost)` — increment
  ReputationCache.orders_disputed and disputes_lost (if sellerLost)
- `ScoreUpdated(seller, newScore)` — sync ReputationCache.score
- `SellerSanctioned(seller, newStatus)` — update ReputationCache.status,
  capture last_sanction_at = block.timestamp
- `TopSellerGranted(seller)` — set ReputationCache.is_top_seller = true
- `TopSellerRevoked(seller)` — set ReputationCache.is_top_seller = false

## EtaloVoting (3 deferred / 3 total — 0 done) — V1.5

Voting handlers deferred to **V1.5**. The N3 community vote was not
exercised in the J4 smoke suite (5 scenarios cover N1 amicable +
N2 mediation; N3 is unit-tested in EtaloVoting.test.ts but not
on-chain testnet-stressed).

- `VoteCreated(voteId, disputeId, deadline)` — populate Dispute.vote_id,
  set deadline tracker (we may add a Vote model when needed)
- `VoteSubmitted(voteId, voter, favorBuyer)` — log per-vote tally,
  optional aggregate counter
- `VoteFinalized(voteId, buyerWon, forBuyer, forSeller)` — finalize
  Dispute (set favor_buyer, transition level to RESOLVED)

---

## Implementation notes for Block 5b

- Each remaining handler should be 5-30 lines: read primary entity by
  onchain id → mutate fields → flush. Pattern is well-established by
  Block 5 handlers.
- Idempotency is automatic (dispatcher in indexer.py handles via
  IndexerEvent UNIQUE constraint).
- Handler tests follow the pattern in tests/services/test_indexer.py
  — synthetic event payloads, AsyncSession with in-memory or test DB,
  assertion on resulting DB state.
- Stake withdrawal handlers form a sub-graph (5 events touching the
  same embedded state): keep them in a single PR for atomicity of
  review.

Related ADRs:
- ADR-018 (cross-border 20/70/10): drives PartialReleaseTriggered +
  AutoReleaseTriggered semantics.
- ADR-019 (auto-refund 7d/14d): drives AutoRefundInactive.
- ADR-020 (stake tiers): drives StakeUpgraded, WithdrawalInitiated.
- ADR-022 (3-level dispute): drives DisputeEscalated.
- ADR-028 (auto-downgrade + topUp): drives StakeToppedUp,
  TierAutoDowngraded (already done).
- ADR-030 (sole authority for reputation events): drives
  DisputeRecorded, ScoreUpdated semantics.
- ADR-033 (post-slash recovery gap): StakeToppedUp will revert when
  tier=None on V1; handler should still treat it as informational.
