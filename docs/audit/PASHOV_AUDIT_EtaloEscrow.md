# Audit — EtaloEscrow.sol

**Date** : 2026-05-05
**Source** : packages/contracts/contracts/EtaloEscrow.sol (1146 lines)
**Method** : pashov 8-agent perspectives synthesized + celopedia D.1-D.4 + manual review against ADR-015 / 022 / 023 / 026 / 030 / 031 / 032 / 041
**Auditor** : Claude Sonnet via subagent delegation (Sprint J11 pre-audit prep)

## Findings — High severity

No High-severity findings identified in V1 reachable surface.

The `resolveItemDispute` commission-misallocation bug (M-1 below) would normally rise to High because it lets a mediator divert protocol commission to the seller, but the partial-release pre-state required to trigger it is V2-cross-border-only (ADR-041 defers cross-border to V2), so it is unreachable on V1 mainnet. It is reported as Medium with a strong recommendation to fix before V2 reactivation.

## Findings — Medium severity

### M-1 — `resolveItemDispute` commission split misallocates fee to seller when item had prior partial release

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `resolveItemDispute` (line 832-918), specifically the formula at line 856-858
- **Bug class** : math-precision / fee-leakage / invariant-violation
- **Path** : seller ships cross-border item -> 20% net release (line 410-424) -> 72h post-arrival -> 70% majority release (line 538-550) -> buyer disputes the item -> mediator resolves with low `refundAmount` -> commission share computed against `itemPrice` instead of `remainingInEscrow` -> treasury under-paid, seller over-paid -> INV-4 (`item.releasedAmount <= itemNet`) violated.
- **Proof** : concrete state sequence
  - itemPrice = 100 USDT (6-dec scaled), itemCommission = 10 (cross-border), itemNet = 90.
  - `shipItemsGrouped` -> `_accrueItemPartialRelease(itemId, 2000)` -> `releasedAmount = 18` (20% of 90), seller wired 18.
  - `triggerMajorityRelease` -> `_accrueItemPartialRelease(itemId, 7000)` -> `releasedAmount = 81` (90% of 90 cumul.), seller wired 63.
  - Buyer opens dispute. `markItemDisputed` -> `item.status = Disputed`.
  - Mediator resolves with `refundAmount = 0` (rules for seller).
  - Code path lines 852-858 :
    - `remainingInEscrow = 100 - 81 = 19`
    - `remainingAfterRefund = 19 - 0 = 19`
    - `commissionShare = (19 * 10) / 100 = 1` (rounds down from 1.9)
    - `netShare = 19 - 1 = 18`
  - Effects (lines 868-873) : `item.releasedAmount += 18 -> 99`. **99 > itemNet = 90**, violating INV-4.
  - Interactions : seller receives 18, commissionTreasury receives 1, buyer receives 0.
  - **Cumulative seller payout = 18 + 63 + 18 = 99**, expected at most `itemNet = 90`.
  - **Treasury payout = 1**, expected `itemCommission = 10` (since the buyer received 0 and did not retain any value entitled to seller's commission portion).
  - **Net leak = 9 USDT** diverted from `commissionTreasury` to `seller`.
- **Description** : The formula `commissionShare = (remainingAfterRefund * itemCommission) / itemPrice` assumes `remainingAfterRefund` contains commission and net in the same ratio as the original `itemPrice`. After a partial release that paid out only NET (per the Q2 arbitrage commented at line 408), the remaining escrow contains a HIGHER fraction of commission than `itemCommission/itemPrice`. Splitting it back along the original ratio gives the seller the commission delta. Total escrow accounting (INV-1) stays balanced because `totalEscrowedAmount -= remainingInEscrow` (line 874) and the three USDT transfers sum to `remainingInEscrow`, but the per-actor allocation is wrong.
- **Suggested fix** : Track `commissionRemaining` separately (or compute it as `itemCommission - commissionAlreadyPaid`, where `commissionAlreadyPaid == 0` until `_releaseItemFully`) and split `remainingAfterRefund` between `netRemaining = itemNet - item.releasedAmount` and `commissionRemaining`. Concretely :

  ```solidity
  uint256 commissionRemaining = item.itemCommission; // none paid until _releaseItemFully
  uint256 netRemaining = (item.itemPrice - item.itemCommission) - item.releasedAmount;
  // assert(remainingInEscrow == commissionRemaining + netRemaining)

  // refundAmount draws from the buyer's economic claim first; remainder splits net/commission proportionally.
  uint256 commissionShare;
  uint256 netShare;
  if (remainingAfterRefund >= commissionRemaining + netRemaining) {
      commissionShare = commissionRemaining;
      netShare = netRemaining;
  } else if (netRemaining == 0) {
      commissionShare = remainingAfterRefund;
      netShare = 0;
  } else {
      // proportional allocation of remainingAfterRefund across the two buckets
      commissionShare = (remainingAfterRefund * commissionRemaining) / (commissionRemaining + netRemaining);
      netShare = remainingAfterRefund - commissionShare;
  }
  ```

  Add an explicit invariant assert : `require(item.releasedAmount + netShare <= item.itemPrice - item.itemCommission, "INV-4");`.
- **Conformance check** : Fix does not violate CLAUDE.md rule 11 (caps unchanged) nor rule 12 (forceRefund untouched). Compatible with ADR-032 strict CEI (the change is local to the Effects block). Compatible with ADR-030 (no reputation event added). **Accepted as fix candidate for V2 cross-border reactivation**.

## Findings — Low severity

### L-1 — `transferFrom` missing balance-delta accounting (fee-on-transfer / future CIP-64 exposure)

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `fundOrder` line 305-309 (write-side), and the symmetric `transfer(...)` calls at lines 419, 558, 660, 727, 899, 905, 911, 1083, 1088 (read-side trusts that exact amount left the contract).
- **Bug class** : trust-assumption / accounting-drift
- **Path** : buyer funds an order with a USDT variant that takes a transfer fee (e.g., a future bridged USDT or fee-enabled successor) -> `transferFrom(buyer, escrow, X)` succeeds but escrow only receives `X - fee` -> `totalEscrowedAmount += X` -> `totalEscrowedAmount > USDT.balanceOf(address(this))` -> later `transfer` calls revert with insufficient balance, locking unrelated orders' funds.
- **Proof** : Hypothetical (current Celo USDT does not implement fee-on-transfer). If a fee of 1% applied : buyer pays X, escrow receives 0.99X, `totalEscrowedAmount = X`. Sum of N such orders : USDT balance = 0.99 * sum(totalAmount), invariant INV-1 violated by 1% per order. First final-release transfer that drains past the actual balance reverts; permissionless triggers and dispute resolutions block.
- **Description** : The contract trusts that `IERC20.transferFrom` returning `true` implies the full requested amount was credited. CIP-64 itself does not introduce drift (gas debits are separate from `transferFrom` value), but a future bridged or fee-enabled USDT would. This is exactly the case ADR-003 V1.5 plan flags.
- **Suggested fix** : Snapshot pattern on inbound transfer :

  ```solidity
  uint256 balBefore = usdt.balanceOf(address(this));
  require(usdt.transferFrom(msg.sender, address(this), order.totalAmount), "USDT transfer failed");
  uint256 received = usdt.balanceOf(address(this)) - balBefore;
  require(received == order.totalAmount, "Fee-on-transfer USDT not supported");
  ```

  This converts a silent drift into an explicit revert. For V1.5 with a deliberately fee-enabled token, switch to crediting `received` and reject orders where `received != order.totalAmount` requires a different policy.
- **Conformance check** : No rule violation. Defensive pattern recommended.

### L-2 — `createOrderWithItems` calls external contracts before state writes (CEI inverse, no reentrancy guard)

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `createOrderWithItems` line 199-280, external calls at line 223 (`stake.isEligibleForOrder`) and indirectly line 980 (`reputation.isTopSeller` via `_calculateCommission`) before the state writes at line 230-269.
- **Bug class** : missing-cei / missing-reentrancy-guard
- **Path** : owner sets a malicious `reputation` or `stake` contract -> attacker calls `createOrderWithItems` -> external `isTopSeller` reenters into another EtaloEscrow function. No `nonReentrant` modifier on `createOrderWithItems`.
- **Proof** : No fund movement happens in `createOrderWithItems`, so direct value extraction is impossible. The function increments `_nextOrderId` and `_nextItemId` and writes Order/Item structs; reentry would just create more orders for the same `msg.sender`. Other reentry targets like `fundOrder` are `nonReentrant` and revert on reentry. Effective impact : negligible.
- **Description** : Style violation of ADR-032 strict CEI — external calls happen before the Effects block. Tolerable because no funds move and the external contracts are owner-set (trust assumption). Worth tightening for defense in depth.
- **Suggested fix** : (a) Add `nonReentrant` modifier to `createOrderWithItems`. (b) Cache the commission rate decision before any external call by reading `reputation.isTopSeller` first into a local, then computing all internal math, then mutating state. (Function would still call `stake.isEligibleForOrder` early — that one is unavoidable as a precondition; restricted to V2-cross-border path so V1 unreachable.)
- **Conformance check** : No rule violation.

### L-3 — `_calculateCommission` calls `reputation.isTopSeller` without `nonReentrant` and without try/catch

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `_calculateCommission` line 971-987, called from `createOrderWithItems`.
- **Bug class** : external-call-in-pricing-path / dos-griefing
- **Path** : malicious / buggy reputation contract reverts on `isTopSeller` -> all `createOrderWithItems` calls revert -> protocol DoS until owner replaces the reputation contract.
- **Proof** : `reputation.isTopSeller(seller)` (line 980) reverts -> the entire `createOrderWithItems` call reverts. Buyers cannot create orders. Owner mitigation : `setReputationContract(address(0))` to fall back to default rate (line 980 short-circuits on `address(0)`).
- **Description** : Pricing-path external call without graceful degradation. Risk only materializes if a malicious or upgraded-buggy reputation contract is set by the owner. Owner trusted, mitigation available; flagged for defensive coding.
- **Suggested fix** : Wrap in try/catch and fall back to default BPS on revert : `try reputation.isTopSeller(seller) returns (bool isTop) { if (isTop) bps = COMMISSION_TOP_SELLER_BPS; } catch { /* default */ }`. Same for `_intraAutoReleaseDuration` line 1010.
- **Conformance check** : No rule violation. Top Seller program deferred V1.1 anyway, so V1 default-rate fallback is the realized behavior.

### L-4 — `legalHoldRegistry` writes do not gate against orders in terminal status

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `registerLegalHold` line 745-753, `forceRefund` line 678-742.
- **Bug class** : access-control / state-machine-gap
- **Path** : owner registers a legal hold on an already-Completed or already-Refunded order -> the legal hold has no effect (forceRefund's `globalStatus` check at line 685-691 excludes terminal states) but lingers in the registry. Storage cruft only.
- **Proof** : `registerLegalHold` does not check `order.globalStatus`. An owner could register a hash on `orderId = 1` after the order completed; `legalHoldRegistry[1]` becomes non-zero. Calling `forceRefund(1, _)` later still reverts on line 685-691 ("Order not refundable") so funds cannot move. Off-chain indexers may incorrectly flag the order as "under legal hold".
- **Description** : Cosmetic state-machine inconsistency. No fund-loss path. Operationally, the registry is a notarization of legal documents and may legitimately predate or postdate order activity for historical reasons.
- **Suggested fix** : Optional. Either accept current behavior (legal-hold registry is a notarization, decoupled from order state) or add `require(order.globalStatus != Completed && order.globalStatus != Refunded && order.globalStatus != Cancelled, ...)` to `registerLegalHold` if "active orders only" is desired.
- **Conformance check** : No rule violation. ADR-023 does not require pre-state on hold registration.

### L-5 — `markGroupArrived` accepts duplicate calls (no monotonic guard)

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `markGroupArrived` line 428-461.
- **Bug class** : state-replay / weak-precondition
- **Path** : the `require(group.status == Shipped)` at line 442 prevents true re-entry once status flips to Arrived (line 451). However, the function only checks `Shipped`, not "not already Arrived". Under the current state machine the gate works, but if a future state were inserted (e.g., `InTransit` after `Shipped`), the `Shipped`-only check could leave a window. Currently safe.
- **Proof** : Cannot replay — second call reverts at line 442 because `group.status == Arrived`.
- **Description** : Defensive note — the precondition implicitly guards against replay, but a stricter `require(group.arrivedAt == 0, "Already arrived")` would be a future-proof guard.
- **Suggested fix** : Optional, harden to `require(group.arrivedAt == 0, ...)`.
- **Conformance check** : No rule violation.

### L-6 — Empty array branches in `confirmGroupDelivery` silently no-op

- **Contract** : EtaloEscrow.sol
- **Function / lines** : `confirmGroupDelivery` line 486-509.
- **Bug class** : event-coverage / silent-noop
- **Path** : buyer calls `confirmGroupDelivery` for a group whose items are all already in terminal state (Released, Refunded). The for-loop at line 498-508 finds no matching items, no `_releaseItemFully` runs, no event emitted. Caller gets a successful tx with no observable effect.
- **Proof** : groupId G has 2 items both already `Released`. `confirmGroupDelivery(orderId, G)` traverses items, neither matches the if-branch at line 501-504, loop ends. Function returns silently.
- **Description** : Defensive ergonomic concern. Off-chain UIs may rely on a revert to surface "nothing to confirm". Protocol-economic impact : zero.
- **Suggested fix** : Optional, emit a `NoOp` event or revert with `"No confirmable items"` after the loop if `confirmedCount == 0`.
- **Conformance check** : No rule violation.

## Findings — Info / Notes

### I-1 — `payable` surface : zero, as expected (celopedia D.1)

No public function carries the `payable` modifier; native CELO sent via accidental `selfdestruct` from another contract or pre-deployment funding would still be receivable since there's no `receive()` / `fallback()` reverting. Per Solidity 0.8 semantics, sending native CELO to this contract (without a payable function and without receive/fallback) reverts, so no native value gets stuck. Confirmed safe per celopedia D.1. No fix needed.

### I-2 — CIP-64 fee-currency drift : currently low impact (celopedia D.2)

When a buyer pays gas in USDT via CIP-64, the CIP-64 fee is charged to the EOA's USDT balance separately from the `transferFrom(buyer, escrow, totalAmount)` allowance pull. The escrow receives exactly `totalAmount`. There is no double-debit on the escrow's side. The remaining concern is the broader fee-on-transfer family captured by L-1. Note this in the human-auditor synthesis as "celopedia D.2 status : direct CIP-64 risk LOW for EtaloEscrow because gas debits don't mix with allowance pulls; the fee-on-transfer USDT successor is the real defensive concern, captured by L-1".

### I-3 — Epoch boundary (post-L2) : not applicable (celopedia D.3)

EtaloEscrow reads neither validator state nor staked-CELO balances. Block.timestamp comparisons (auto-release timers, 90-day forceRefund threshold) are unaffected by the L2 epoch boundary.

### I-4 — Mento / Aave / bridges : not applicable (celopedia D.4)

USDT direct only, no oracle reads, no AMM hooks, no bridge routes.

### I-5 — `_intraAutoReleaseDuration` evaluated at ship time, not create time

NatSpec at line 1004-1007 documents this is intentional. Note for human auditor : a seller could sandwich a Top Seller badge grant between order create and ship to qualify for the faster 2-day timer. Top Seller program deferred V1.1, so unreachable V1.

### I-6 — `_orderItems[orderId]` and `_orderGroups[orderId]` arrays unbounded by ABI size limits but bounded by `MAX_ITEMS_PER_ORDER = 50` and group cardinality

Iteration in `_computeNewOrderStatus` (line 1125), `forceRefund` (line 710), `triggerAutoRefundIfInactive` (line 644, 651), `confirmGroupDelivery` (line 498) is at most `MAX_ITEMS_PER_ORDER * MAX_ITEMS_PER_GROUP` per outer call, well below block-gas concerns at typical Celo gas limits.

### I-7 — Event `OrderCancelled` does not include the canceller's address

Line 331. For audit trail completeness, consider indexing `msg.sender` into the event signature. Trivial; no fix required for security.

### I-8 — `setStakeContract` / `setDisputeContract` / `setReputationContract` have no zero-address guard

Lines 179-192 omit `require(newContract != address(0))` (unlike treasury setters at lines 161, 167, 173). Setting these to zero is operationally meaningful — `_calculateCommission` line 980 short-circuits when `address(reputation) == 0`, fund-moving paths at lines 310, 663, 731, 915, 1096 short-circuit on `address(stake) == 0`, and `forceRefund` line 695 explicitly treats `address(dispute) == 0` as the first ADR-023 condition. So zero-setting is feature, not bug. Documented as info.

### I-9 — V2-deferred surfaces interspersed with V1 paths

V2-deferred surfaces (per ADR-041) are NOT removed from the contract; they are guarded by `isCrossBorder`-flag branches set false by V1 frontend (per backend cart.py:124 referenced in PASHOV_XRAY.md §8). This audit pass flags but does not deeply analyze these :
- Stake interactions : lines 220-225 (`isEligibleForOrder` gate), 311 (`incrementActiveSales` on fund), 663-665 (`decrementActiveSales` on auto-refund), 731-733 (`decrementActiveSales` on forceRefund), 915-917 (`decrementActiveSales` on dispute resolve), 1096-1098 (`decrementActiveSales` on full release).
- Reputation interactions : lines 980-984 (`isTopSeller` on commission calc), 1010-1014 (`isTopSeller` on auto-release duration), 1092-1095 (`recordCompletedOrder` + `checkAndUpdateTopSeller` on release).
- Cross-border release stages : lines 410-424 (20% ship), 517-562 (70% majority), 588-594 (cross-border arrival gate on auto-release).

### I-10 — Gas optimization opportunities (informational only)

- Line 210-213 : the `for` loop computes `totalAmount` and could be combined with the loop at line 248-270 (item creation) to avoid two passes; saves a bounded amount of gas. Skipped for clarity.
- Line 644 and 651 : two passes over `_orderItems[orderId]` in `triggerAutoRefundIfInactive`. Could be merged (loop once, on a Disputed item revert immediately, otherwise mutate). Skipped for clarity (the early-revert pass IS more readable).

### I-11 — `OrderStatus.Disputed` enum value is dead state

NatSpec at line 95-99 documents the enum value is intentionally unused. The audit confirms : no path sets `order.globalStatus = OrderStatus.Disputed`. `_computeNewOrderStatus` (line 1108-1145) never returns it. Accepted as documented.

### I-12 — ADR-023 condition #1 ("dispute contract inactive") interpreted as `address(dispute) == 0`

Line 695. The literal interpretation of "dispute contract inactive" is unambiguous in code. In practice, the owner must explicitly call `setDisputeContract(address(0))` to enable a forceRefund path. Combined with the 90-day inactivity and legal hold conditions, this is the strongest interpretation aligned with ADR-023 and CLAUDE.md rule 12.

### I-13 — V2 reentrancy surface from owner-controlled reputation contract

`reputation.recordCompletedOrder` and `reputation.checkAndUpdateTopSeller` (lines 1093-1094) are external calls AFTER USDT transfers. The current `nonReentrant` modifier on the entry point (e.g., `confirmItemDelivery`) prevents direct reentry into other guarded functions. However, reputation could reenter into the four NON-`nonReentrant` mutating functions : `cancelOrder`, `markGroupArrived`, `markItemDisputed` (onlyDispute), and the admin setters. None move funds, so no value extraction. Note for human auditor.

## Conformance with Etalo constraints

- **ADR-026 hardcoded limits** : verified enforced at
  - `MAX_ORDER_USDT` line 215 (`require(totalAmount <= MAX_ORDER_USDT)`)
  - `MAX_TVL_USDT` line 295-297 (`require(totalEscrowedAmount + order.totalAmount <= MAX_TVL_USDT)`)
  - `MAX_SELLER_WEEKLY_VOLUME` line 997-1000 (in `_updateSellerWeeklyVolume`)
  - `EMERGENCY_PAUSE_MAX` line 779 (`pausedUntil = block.timestamp + EMERGENCY_PAUSE_MAX`)
  - `EMERGENCY_PAUSE_COOLDOWN` line 776-778
  - `MAX_ITEMS_PER_ORDER` line 207, `MAX_ITEMS_PER_GROUP` line 358-360
  - `FORCE_REFUND_INACTIVITY_THRESHOLD` line 700
- **ADR-023 forceRefund three conditions** : verified at lines 694-706, AND-logic correct (three separate `require` statements all must pass).
  - Condition 1 : `address(dispute) == address(0)` line 695
  - Condition 2 : `block.timestamp > order.fundedAt + 90 days` line 700 (with `order.fundedAt > 0` precondition)
  - Condition 3 : `legalHoldRegistry[orderId] != bytes32(0)` line 704
- **ADR-032 CEI strict** : verified for fund-moving functions
  - `fundOrder` line 283-315 : Effects (totalEscrow, status, fundedAt, weekly volume) before USDT transferFrom and stake.incrementActiveSales. Note : `_updateSellerWeeklyVolume` mutates state pre-transfer, which is fine (no external call yet).
  - `shipItemsGrouped` line 339-425 : item state, group state, totalEscrow update before USDT transfer at line 419.
  - `confirmItemDelivery` / `confirmGroupDelivery` -> `_releaseItemFully` line 1042-1099 : Effects block (line 1050-1066) before Interactions block (line 1080-1098).
  - `triggerMajorityRelease` line 517-562 : Effects (releasedAmount via `_accrueItemPartialRelease`, releaseStage, totalEscrow) before USDT transfer at line 557.
  - `triggerAutoReleaseForItem` line 570-603 : delegates to `_releaseItemFully` which is CEI-correct.
  - `triggerAutoRefundIfInactive` line 618-668 : item state writes, totalEscrow decrement before USDT transfer and stake decrement.
  - `forceRefund` line 678-742 : item refunds, status, totalEscrow decrement before USDT transfer and stake decrement.
  - `resolveItemDispute` line 832-918 : item state, totalEscrow decrement, order status before three USDT transfers and stake decrement (explicit Effects/Interactions comments at lines 867 and 896).
- **ADR-031 auto-refund blocked on dispute** : verified at lines 644-649. Loop checks every item for `Disputed` status before any state mutation.
- **ADR-030 Dispute sole authority for reputation** : verified — `resolveItemDispute` does not call any reputation function (comment at line 887-890 explicit). Only `_releaseItemFully` calls `recordCompletedOrder` (non-dispute path).
- **ADR-015 item-level dispute isolation** : verified — `markItemDisputed` flips only one item's status; `triggerMajorityRelease` skips Disputed items at line 546-548; `triggerAutoReleaseForItem` reverts on Disputed at line 583.
- **ADR-041 V1 intra-only scope** : verified — V2-deferred branches (cross-border, stake, Top Seller commission rate) are gated by `isCrossBorder` flag and `address(stake) != address(0)` / `address(reputation) != address(0)` short-circuits. V1 frontend forces `isCrossBorder = false` per backend constraint.

## V2-deferred surfaces noted (not audited this pass)

- **EtaloStake interactions** (V2 reactivation per ADR-041) :
  - Line 220-225 : `stake.isEligibleForOrder(seller, totalAmount)` cross-border gate
  - Line 310-312 : `stake.incrementActiveSales(seller)` on fund
  - Line 663-665 : `stake.decrementActiveSales(seller)` on auto-refund
  - Line 731-733 : `stake.decrementActiveSales(seller)` on forceRefund
  - Line 915-917 : `stake.decrementActiveSales(seller)` on dispute resolve
  - Line 1096-1098 : `stake.decrementActiveSales(seller)` on release
- **EtaloReputation interactions** (Top Seller deferred V1.1 per ADR-041) :
  - Line 980-984 : `reputation.isTopSeller(seller)` in commission calc
  - Line 1010-1014 : `reputation.isTopSeller(seller)` in auto-release duration
  - Line 1092-1095 : `reputation.recordCompletedOrder` + `reputation.checkAndUpdateTopSeller` on release
- **Cross-border release stages** (V2 deferred) :
  - Line 410-424 : 20% net release at ship
  - Line 517-562 : 70% majority release post-72h
  - Line 588-594 : cross-border arrival gate on `triggerAutoReleaseForItem`
  - Line 428-461 : `markGroupArrived` (cross-border only)
  - **M-1 lives entirely in V2-deferred surface** — partial release prerequisite makes intra orders unable to trigger the bug. V2 reactivation must include the M-1 fix before mainnet.

## Cross-references

- pashov-skills `solidity-auditor` framework (8-agent perspectives : vector-scan / access-control / economic-security / invariants / math-precision / execution-trace / periphery / first-principles)
- celopedia-skills `security-patterns.md` D.1-D.4 captured in `docs/AUDIT_CELOPEDIA_ALIGN.md`
- `docs/audit/PASHOV_XRAY.md` threat model (this audit's parent document, §3 entry points + §4 invariants + §6 temporal risks + §7 hardcoded limits)
- `docs/DECISIONS.md` ADR-015 / ADR-022 / ADR-023 / ADR-026 / ADR-030 / ADR-031 / ADR-032 / ADR-041
- `CLAUDE.md` inner Critical rules 1-15 (rules 11 and 12 explicitly verified above)
- `docs/SPEC_SMART_CONTRACT_V2.md` §0 V1 scope + §3 data structures + §7 forceRefund three conditions + §11 constants + §12 functions + §13 events
