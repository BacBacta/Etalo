# Audit — EtaloDispute.sol

**Date** : 2026-05-05
**Source** : packages/contracts/contracts/EtaloDispute.sol (416 lines)
**Method** : pashov 8-agent perspectives synthesized + celopedia D.1-D.4 + manual review against ADR-022 / 023 / 026 / 029 / 030 / 031 / 032 / 041
**Auditor** : Claude Sonnet via subagent delegation (Sprint J11 pre-audit prep)

> **POST-AUDIT UPDATE** (post-fix, after subagent verification) :
> H-1 (unfunded dispute drain) — RESOLVED.
> Empirical repro : commit dcae418.
> Fix : commit f8cf195 (3-layer require fundedAt > 0).
> Post-fix verification : docs/audit/H1_POST_FIX_VERIFICATION.md.
> Tracking : ADR-042.

**CRITICAL ISSUE FOUND — STOP AND ESCALATE**

H-1 below is a confirmed drainable path that lets an attacker (with one colluding wallet, or via N3 voting alone) pull USDT escrowed by other buyers out of `EtaloEscrow`. The bug spans `EtaloDispute.openDispute` (no `Funded` precondition) and `EtaloEscrow.markItemDisputed` / `resolveItemDispute` (no `order.fundedAt > 0` precondition), but the Dispute side is the natural locus to fix because Dispute owns the lifecycle entry. The vector is exploitable today on Sepolia and would be exploitable on mainnet at deploy time. Recommend halting Sprint J11 mainnet plans until either Dispute or Escrow gains the funded-order guard.

---

## Findings — High severity

### H-1 — Buyer can dispute an item on an UNFUNDED order, then drain other buyers' escrowed USDT via N1 collusion or N3 vote

- **Contract** : EtaloDispute.sol (entry) — exploit completes through EtaloEscrow.resolveItemDispute
- **Function / lines** :
  - `EtaloDispute.openDispute` line 159-200 (no order-funded precondition)
  - `EtaloDispute.resolveN1Amicable` line 265-287 (no order-funded precondition; matched proposals trigger `_applyResolution`)
  - `EtaloDispute.resolveFromVote` line 310-331 (`buyerWon=true` path computes `refundAmount = item.itemPrice - item.releasedAmount` for an unfunded order this evaluates to `item.itemPrice`)
  - `EtaloDispute._applyResolution` line 385-415 (calls `escrow.resolveItemDispute(orderId, itemId, refundAmount)` with no funded check)
  - Co-conspirator gap : `EtaloEscrow.markItemDisputed` line 789-805 and `EtaloEscrow.resolveItemDispute` line 832-918 also do not require `order.fundedAt > 0` / `order.globalStatus >= Funded`.

- **Bug class** : missing precondition / accounting drift / fund drainage. The `totalEscrowedAmount` global pool is debited and USDT is paid out for an order that never deposited into it.

- **Path** :
  1. Attacker A creates order `Y` with attacker-controlled wallet B as `seller` and a single item `X` priced at `MAX_ORDER_USDT = 500 USDT` (or any non-zero price up to that cap). `EtaloEscrow.createOrderWithItems` line 200-280 only requires `seller != msg.sender`, `itemPrices[i] > 0`, `totalAmount <= MAX_ORDER_USDT`. Order goes into `OrderStatus.Created` with `fundedAt = 0`, item goes into `ItemStatus.Pending`.
  2. **No `fundOrder` is ever called.** USDT custody balance for order `Y` is zero. The escrow contract may, however, hold non-zero USDT from other legitimate funded orders.
  3. A calls `EtaloDispute.openDispute(Y, X, "fake")` line 159. Required checks pass:
     - `escrow != address(0)` ✓
     - `_disputeByItem[Y][X] == 0` ✓
     - `escrow.getOrder(Y).buyer == A` ✓
     - `escrow.markItemDisputed(Y, X)` succeeds because item is `Pending` and the function only excludes `Released`, `Refunded`, `Disputed` (EtaloEscrow line 797-801). **It does NOT check `order.fundedAt > 0` or order status.**
  4. A and B both call `EtaloDispute.resolveN1Amicable(disputeId, 500e6)`. Lines 276-282 store proposals; line 284 detects match; line 285 calls `_applyResolution(disputeId, 500e6, 0)`.
  5. `_applyResolution` line 398 calls `escrow.resolveItemDispute(Y, X, 500e6)`.
  6. In Escrow.resolveItemDispute line 832-918:
     - Line 846 `item.orderId == orderId` ✓
     - Line 848 `item.status == Disputed` ✓
     - Line 852 `remainingInEscrow = item.itemPrice - item.releasedAmount = 500e6 - 0 = 500e6`
     - Line 853 `refundAmount <= remainingInEscrow` ✓ (500e6 <= 500e6)
     - Line 855-858 `remainingAfterRefund = 0`, `commissionShare = 0`, `netShare = 0`
     - Line 868 `refundAmount == item.itemPrice` → `item.status = Refunded`
     - Line 874 `totalEscrowedAmount -= 500e6` — succeeds whenever the protocol's accumulated `totalEscrowedAmount` is ≥ 500e6 (i.e. as soon as any other buyer has funded an order ≥ 500 USDT, or several smaller orders summing ≥ 500 USDT)
     - Line 897-899 `usdt.transfer(buyer A, 500e6)` — pulls from EtaloEscrow's actual USDT balance, which sits there from other buyers' deposits.

  7. A walks away with 500 USDT that they never deposited. Total drainable per call is bounded by `MAX_ORDER_USDT = 500 USDT` per ADR-026, but the attack is repeatable across distinct (orderId, itemId) pairs subject only to `MAX_ITEMS_PER_ORDER = 50` per order × any number of fresh orders. The architectural cap `MAX_TVL_USDT = 50 000 USDT` becomes the effective drainage ceiling in a single sweep.

  Variant without seller collusion (single-attacker): A skips step 4 and instead runs step 4' :
  - Wait 48h, call `escalateToMediation(disputeId)` (line 209 — buyer can call any time before deadline, anyone after).
  - Wait another 7 days, call `escalateToVoting(disputeId)` (line 224). Voters are the global `_mediatorsList` snapshot.
  - Wait the 14-day vote, then call `EtaloVoting.finalizeVote`. If `buyerWon == true` (community sees a buyer with no shipping evidence and a non-responsive seller — a likely "rule for buyer" outcome), `EtaloDispute.resolveFromVote(voteId, true)` line 310 fires.
  - Line 327-329: `EtaloTypes.Item memory item = escrow.getItem(d.itemId); refundAmount = item.itemPrice - item.releasedAmount;` → `refundAmount = item.itemPrice` since `releasedAmount = 0`.
  - Line 330: `_applyResolution(disputeId, refundAmount, 0)` → same drainage as N1 path.

  Note : `escalateToVoting` requires `voting != address(0)` at line 228 — this is a V1 protection because Voting is V2-deferred per ADR-041. So today, only the N1-collusion path drains. **As soon as Voting is activated for V2, the single-attacker path opens up.**

  Variant via N2 mediator : `escalateToMediation` then mediator runs `resolveN2Mediation(disputeId, 500e6, 0)` (line 289). A naive or compromised mediator who does not check off-chain that the order was funded would drain. This is mitigated only by mediator diligence, not by code.

- **Proof** : the precondition gap is observable in the source : `EtaloDispute.openDispute` line 159-200 has no `require(order.fundedAt > 0)` and no `require(order.globalStatus >= Funded)`. `EtaloEscrow.markItemDisputed` line 789-805 has the same gap. `EtaloEscrow.resolveItemDispute` line 832-918 only requires the item be in `Disputed`, which the dispute flow already arranged. Item state machine (EtaloTypes line 27-35) shows `Pending` is the initial state and is not in the forbidden set at line 797-801.

  Drainage realism :
  - `totalEscrowedAmount` is the protocol-wide sum, not order-scoped. Line 874's `totalEscrowedAmount -= remainingInEscrow` does not check that this order ever contributed to `totalEscrowedAmount`. Because Solidity 0.8.24 reverts on underflow, the attack actually reverts when the protocol pool is empty — but as soon as any other buyer funds an order ≥ 500 USDT (the typical case in production), it goes through and silently under-deducts the global pool.
  - The actual USDT transfer at line 897-899 draws from `address(this)` balance — which is the aggregate of all funded orders. Per-order accounting drift is exactly the celopedia D.2 risk: contract-level USDT balance no longer matches `totalEscrowedAmount + sum(stake balances + treasuries)`.

- **Description** : the dispute lifecycle entry (`openDispute`) and the dispute resolution callbacks (`resolveItemDispute`) both treat funded and unfunded orders as identical because the only state used for refund math is `item.itemPrice` (set at order creation, before funding) and `item.releasedAmount` (zero for unfunded items). The CEI rewrite for ADR-032 preserved this behaviour. Combined with the global `totalEscrowedAmount` debit and the global USDT custody pool, the gap allows a buyer to claim a refund that no buyer ever deposited. The architectural cap at `MAX_TVL_USDT` provides an upper bound on a single sweep but does not prevent the bug.

  The bug is hidden by the test mocks per ADR-029 / ADR-030 lessons: `MockEtaloEscrow` accepts any `refundAmount` without checking funded state, and the unit test suites for Dispute do not exercise an unfunded-order open. Block 8 integration scenarios all start with `fundOrder`, so the path is never traversed in CI.

- **Suggested fix** :
  1. **Primary (Dispute side)** — in `EtaloDispute.openDispute` after line 167 add :
     ```
     require(order.fundedAt > 0, "Order not funded");
     ```
     This is the cheapest fix and aligns with ADR-031's reasoning that Dispute owns the lifecycle and must not orphan a no-op state machine.

  2. **Defense-in-depth (Escrow side)** — also add to `EtaloEscrow.markItemDisputed` after line 794 :
     ```
     require(_orders[orderId].fundedAt > 0, "Order not funded");
     ```
     This is independent of the Dispute fix and protects against any future caller satisfying `onlyDispute` (e.g. a contract migration where Dispute is replaced).

  3. **Test guard** — add a Hardhat unit test `EtaloDispute.test.ts > openDispute on unfunded order reverts`, and a Foundry invariant `invariant_DisputedItemsImplyFundedOrder`. Block 8 integration scenario should include a regression for the unfunded-order rejection path.

- **Conformance check** :
  - ADR-023 (forceRefund 3 conditions) : not bypassed — the fix tightens, not loosens, refund preconditions. ✓
  - ADR-026 (hardcoded limits) : limits unchanged. ✓
  - ADR-030 (Dispute sole reputation authority) : the funded check fires before any reputation event, so authority chain is preserved. ✓
  - ADR-031 (auto-refund blocked on dispute) : the inverse direction (dispute blocks auto-refund) is unaffected by the fix. ✓
  - ADR-032 (strict CEI) : the funded check is a Check, so it sits at the top of the function — CEI preserved. ✓
  - CLAUDE.md rule 11 : limits not bypassed. ✓
  - CLAUDE.md rule 12 : forceRefund gates not relaxed. ✓

---

## Findings — Medium severity

### M-1 — Reputation grief : a single buyer can flood a real seller with disputes on unfunded orders, polluting their reputation cache without any economic stake

- **Contract** : EtaloDispute.sol
- **Function / lines** : `openDispute` line 159-200 ; `_applyResolution` line 407-410 (calls `reputation.recordDispute(d.seller, d.orderId, refundAmount > 0)` and `reputation.checkAndUpdateTopSeller(d.seller)`)
- **Bug class** : reputation poisoning / DoS via free-to-open disputes
- **Path** :
  1. Attacker creates orders against a target seller `S` (real, productive seller). No funding required.
  2. Attacker calls `openDispute` on each order's items. Each call increments `_activeDisputesBySeller[S]` (line 191) and triggers `stake.pauseWithdrawal(S, disputeId)` if stake is set.
  3. Either : (a) attacker proposes refund 0 in `resolveN1Amicable` and waits for seller to also propose 0 (both proposals match at zero — `_applyResolution(disputeId, 0, 0)` fires, but the seller never proposes since the item was never theirs to refund — so this path stalls) ; OR (b) attacker lets escalation expire and waits 23 days for N1+N2+N3 timers, then anyone can drive resolution.
  4. Once H-1 is fixed, the funded-order requirement blocks step 1. **Until H-1 is fixed, the grief is uncapped.**
  5. Even with H-1 fixed (i.e. only funded orders can be disputed) the attacker can still grief by funding small-priced orders (down to 1 wei of USDT — `itemPrices[i] > 0` line 211) and disputing them.

- **Proof** : there is no deposit, bond, or rate limit on `openDispute`. The only economic cost is gas. The seller's `recordDispute` counter is incremented on any resolution, even resolutions where `refundAmount == 0` (line 408 evaluates `refundAmount > 0` as the `sellerLost` flag, but `recordDispute` increments `ordersDisputed` regardless per IEtaloReputation NatSpec line 44-45).

- **Description** : pure reputation DoS. A motivated competitor can permanently demote a seller below the Top Seller threshold (ADR-020) by repeatedly opening trivial disputes. Combined with `stake.pauseWithdrawal` being called on every open (line 194-196), the attacker can also keep a seller's stake frozen indefinitely if they time disputes to overlap.

- **Suggested fix** : require a small refundable bond at `openDispute` (paid by the buyer in USDT), forfeited only if the dispute resolves with `refundAmount == 0` (seller wins). Bond should be capped to avoid raising the bar for legitimate disputes — e.g. 0.5 USDT or 1% of item price, whichever is smaller. Forfeited bond goes to `commissionTreasury` per ADR-024. Alternatively, rate-limit per-buyer disputes via `mapping(address => uint256) _disputesOpenedThisDay` with a small daily cap.

- **Conformance check** :
  - ADR-022 (non-custodial) : a refundable bond is non-custodial as long as it is held in EtaloDispute and returned automatically. ✓
  - ADR-026 (limits) : limits unchanged. ✓
  - ADR-030 (sole reputation authority) : preserved. ✓
  - **Note** : this is a candidate for a new ADR if accepted. Flagged in Info.

### M-2 — `escalateToMediation` and `escalateToVoting` permissionless after deadline allow third parties to grief in-progress amicable resolutions

- **Contract** : EtaloDispute.sol
- **Function / lines** : `escalateToMediation` line 203-217 (line 208-211 allows `block.timestamp >= n1Deadline` from anyone) ; `escalateToVoting` line 219-255 (line 224-227 same pattern)
- **Bug class** : MEV / griefing / level-jumping
- **Path** :
  1. Buyer and seller are negotiating in good faith via `resolveN1Amicable`. Both have stored proposals at, say, 100 USDT (buyer) and 90 USDT (seller). They are 10 USDT apart and converging.
  2. `n1Deadline` ticks past `block.timestamp`. Buyer is about to propose 95 USDT to match seller.
  3. Random third party calls `escalateToMediation(disputeId)`. The dispute jumps to N2. The N1 proposals are abandoned and the parties are now stuck with a single mediator who must charge time.
  4. Same pattern for N2 → N3.

- **Proof** : the `||` clause `block.timestamp >= n1Deadline` (line 209-210) explicitly allows anyone after the deadline. There is no buyer-extension mechanism and no check that an amicable resolution was about to fire.

- **Description** : in practice this rewards the side that wants to drag a dispute into a costlier phase. A buyer who suspects they will lose at N1 can stall to the deadline, then escalate to N2 where they hope a sympathetic mediator awards them more. A seller who suspects they will lose at N1 can do the symmetric thing — but the `escalateToMediation` clause `msg.sender == d.buyer` (line 209) means only the buyer can escalate before the deadline, so the seller's only escalation tool is the timer expiring.

- **Suggested fix** : either (a) restrict third-party escalation to `block.timestamp >= n1Deadline + GRACE_PERIOD` (e.g. 24h grace) so parties have a window to finalize ; or (b) add a `cancelEscalation` path within the grace period letting either party revert the escalation if N1 proposals were live ; or (c) accept the current behaviour and document it explicitly as "if you want to amicably resolve, do it before the 48h is up".

- **Conformance check** :
  - ADR-031 (auto-refund blocked on dispute) : preserved. ✓
  - ADR-032 (strict CEI) : preserved. ✓
  - No rule-violation concern.

### M-3 — `_disputeByItem[orderId][itemId]` is never reset, so a single item disputed and resolved can never be disputed again even if subsequent state events warrant it

- **Contract** : EtaloDispute.sol
- **Function / lines** : `openDispute` line 165 (require `_disputeByItem[orderId][itemId] == 0`) ; `_applyResolution` line 385-415 (no reset of `_disputeByItem`)
- **Bug class** : missing reset / accidental one-shot
- **Path** : in the current state machine this is defense-in-depth (item statuses `Released` / `Refunded` are also blocked at `markItemDisputed` line 797-801). However, if item state machines evolve (e.g. a future "rectified" state where seller corrects a minor issue and item re-enters `Shipped`), the `_disputeByItem` lock would silently prevent a second dispute on the same item.
- **Proof** : grep on EtaloDispute.sol shows no `delete _disputeByItem` anywhere. The mapping stores `disputeId` (non-zero) once set.
- **Description** : low impact today. Flagged because the contract carries this hidden invariant ("each item disputable once forever") that is not documented and could break in V2 surface evolution.
- **Suggested fix** : either delete the `_disputeByItem[orderId][itemId]` slot at the end of `_applyResolution`, or document the one-shot semantics in NatSpec on `openDispute` line 158.
- **Conformance check** : no rule-violation concern.

---

## Findings — Low severity

### L-1 — `assignN2Mediator` does not verify the mediator is still in `_mediatorsList` at call time, only that `isMediatorApproved[med]` is true

- **Contract** : EtaloDispute.sol
- **Function / lines** : `approveMediator` line 122-142 ; `assignN2Mediator` line 148-156
- **Bug class** : registry-state inconsistency
- **Path** : `approveMediator(med, false)` correctly removes from `_mediatorsList`, sets `isMediatorApproved[med] = false`. `assignN2Mediator` requires `isMediatorApproved[med]` only — so if state flips between calls, no race exists today (single-tx state). However, the symmetric concern : if a mediator is unapproved AFTER being assigned to a dispute, `resolveN2Mediation` line 289 still passes `onlyAssignedMediator(disputeId)` modifier (line 88-91 only checks `msg.sender == d.n2Mediator`), so an unapproved mediator can still resolve their existing case. Whether this is desired is unclear from the code/NatSpec.
- **Proof** : line 88-91 vs line 122-142.
- **Description** : either (a) intentional — mediators retain authority over already-assigned cases even after de-approval (good for case continuity) ; or (b) accidental — owner expected unapproval to revoke authority. Need NatSpec clarification.
- **Suggested fix** : add NatSpec on `onlyAssignedMediator` modifier line 88 explaining the persistence-after-unapproval semantics. Optionally, `resolveN2Mediation` could add `require(isMediatorApproved[d.n2Mediator], "Mediator no longer approved")` if the desired semantic is revocation.
- **Conformance check** : no rule-violation concern.

### L-2 — `escalateToVoting` builds the voter list at escalation time, locking it for the 14-day vote even if owner subsequently approves additional mediators or revokes one

- **Contract** : EtaloDispute.sol
- **Function / lines** : `escalateToVoting` line 232-251 (snapshots `_mediatorsList` into a fresh `address[] memory voters` and passes to `voting.createVote`)
- **Bug class** : snapshot-vs-mutation / governance race
- **Path** : the snapshot semantic is per IEtaloVoting NatSpec line 25-28 ("snapshot of addresses allowed to vote"), so this is intentional. Documented at the interface level. However, EtaloDispute does not document this on its own NatSpec, and a reviewer reading just EtaloDispute.sol would not know that mediator removals during a vote are silently honored at the EtaloDispute side but not at the EtaloVoting side.
- **Proof** : line 243-249 builds `voters` from the current `_mediatorsList`. After `voting.createVote` returns, no further sync.
- **Description** : low risk in practice (V2-deferred), but operationally surprising.
- **Suggested fix** : add NatSpec on `escalateToVoting` line 219 explicitly stating "voter list is snapshotted at escalation, mediator approvals / revocations after escalation do not affect this vote."
- **Conformance check** : no rule-violation concern.

### L-3 — `resolveN1Amicable` accepts an arbitrary `refundAmount` from each party without bounding by `item.itemPrice` ; only at `escrow.resolveItemDispute` line 853 does the cap apply

- **Contract** : EtaloDispute.sol
- **Function / lines** : `resolveN1Amicable` line 265-287
- **Bug class** : late-cap validation
- **Path** : both buyer and seller can propose `refundAmount = type(uint256).max`. If they match (both same garbage value), `_applyResolution(disputeId, 2^256 - 1, 0)` fires, then `escrow.resolveItemDispute` reverts at line 853 (`refundAmount <= remainingInEscrow`). The dispute stays at `LEVEL_RESOLVED` per line 396 with `resolved = true`, but the external call reverts the entire transaction so all state is rolled back. Net effect : nothing changes, gas is wasted. **Not a fund risk, but it is poor UX and hides invariant violations from the dispute log.**
- **Proof** : line 277, 280 store `refundAmount` without bound check. Cap enforcement is delegated downstream.
- **Description** : low priority. Belt-and-suspenders fix : `require(refundAmount <= escrow.getItem(itemId).itemPrice, "Refund exceeds item price");` at line 274.
- **Suggested fix** : add the line above at top of `resolveN1Amicable`.
- **Conformance check** : no rule-violation concern.

### L-4 — `resolveN2Mediation` does not bound `slashAmount` at the Dispute layer ; relies on `EtaloStake.slashStake` to revert if `amount > getStake(seller)`

- **Contract** : EtaloDispute.sol
- **Function / lines** : `resolveN2Mediation` line 289-300 ; `_applyResolution` line 402-404
- **Bug class** : late-cap validation (mirror of L-3)
- **Path** : V2-deferred (Stake reactivates with cross-border in V2). Mediator can propose any `slashAmount`. Dispute stores it (line 393) and calls `stake.slashStake(seller, slashAmount, buyer, disputeId)` only when stake is set (line 400). EtaloStake reverts if too high. Same shape as L-3.
- **Proof** : line 289-300 has no bound on `slashAmount`.
- **Description** : V2-deferred. Note for V2 reactivation review.
- **Suggested fix** : when V2 reactivates Stake, add a Dispute-level cap fetching `stake.getStake(seller)` to short-circuit before the external call.
- **Conformance check** : no rule-violation concern.

### L-5 — Mediator list iteration in `escalateToVoting` is two-pass O(N²)-ish for excluded-N2 case ; current `_mediatorsList` is unbounded

- **Contract** : EtaloDispute.sol
- **Function / lines** : `escalateToVoting` line 232-251 ; `approveMediator` line 122-142 (no cap on `_mediatorsList.length`)
- **Bug class** : DoS via large mediator list
- **Path** : owner can `approveMediator` indefinitely. `escalateToVoting` walks the list twice (count, then build). For very large N (say 10 000 mediators), the call exceeds block gas limit and the dispute cannot escalate to N3.
- **Proof** : `_mediatorsList` has no length cap ; line 236, 245 are linear scans.
- **Description** : V2-deferred (Voting inactive). At V2 reactivation, owner self-DoS is the realistic shape — accidental over-approval. Cap to e.g. 100 mediators.
- **Suggested fix** : add `require(_mediatorsList.length < MAX_MEDIATORS, "Mediator cap reached")` at top of `approveMediator` line 122.
- **Conformance check** : no rule-violation concern.

---

## Findings — Info / Notes

### I-1 — Setter functions emit old/new event but allow re-setting to the same address

`setEscrow` line 102-105, `setStake` line 107-110, `setVoting` line 112-115, `setReputation` line 117-120 emit even when `_addr == address(escrow)`. Consider `require(_addr != address(0), "Zero address")` and `require(_addr != address(escrow), "Same address")` for hygiene. Low impact.

### I-2 — `assignN2Mediator` can be called multiple times, overwriting the assigned mediator without event clarity

Line 148-156. The `MediatorAssigned` event fires every time, but there is no `MediatorReassigned(old, new)` distinction. Adding a stricter `require(d.n2Mediator == address(0) || msg.sender == owner(), ...)` is overkill since `onlyOwner` already gates ; just consider naming clarity.

### I-3 — `recordDispute` reputation event includes `refundAmount > 0` as `sellerLost` flag

Line 408 : `reputation.recordDispute(d.seller, d.orderId, refundAmount > 0)`. This conflates "any refund" with "seller lost". A 1-wei refund flags the seller as having lost the dispute — likely fine in practice but worth double-checking the reputation score formula (out-of-scope for Dispute audit ; see EtaloReputation P2 scan).

### I-4 — N1 amicable two-party state machine has no "cancel proposal" path

Line 265-287. Once a party proposes `100 USDT`, they cannot retract (only update). If they want to back away from the dispute entirely, the only path is `escalateToMediation` which forces N2. Could add a `withdrawN1Proposal(disputeId)` view if UX warrants.

### I-5 — ADR candidate : refundable dispute-opening bond

H-1's primary fix (funded-order check) closes the drainage path. M-1's grief vector (free-to-open disputes against any seller) remains. A new ADR proposing a refundable bond in USDT (returned on `refundAmount > 0`, forfeited to `commissionTreasury` on `refundAmount == 0`) would close the grief path and align with ADR-022 non-custodial positioning.

### I-6 — ADR candidate : N3 voter list snapshot semantic documentation

Per L-2, the voter snapshot at escalation time is intentional but undocumented at the EtaloDispute layer. Consider an ADR or a NatSpec patch on `escalateToVoting`.

### I-7 — Celopedia D.1 — D.4 cross-cutting

- **D.1 CELO duality** : EtaloDispute has zero `payable` functions (verified by reading lines 159, 203, 219, 265, 289, 310 — none have `payable` keyword). N/A. ✓
- **D.2 CIP-64 fee-currency drift** : Dispute does not move USDT directly. The drift risk lives in EtaloEscrow.resolveItemDispute (3-way transfer at lines 897-913). Note that H-1 amplifies D.2 because it allows `totalEscrowedAmount` to drift below the actual USDT custody balance (an attacker drains USDT but the per-order state shows the order was "refunded normally"). Ledger reconciliation off-chain would expose the drift.
- **D.3 Epoch boundary effects post-L2** : Dispute reads no validator state. Block timestamps used at lines 171, 180, 209, 214, 225 are standard `block.timestamp` ; no epoch-boundary read. ✓
- **D.4 Mento / Aave / bridge** : N/A.

### I-8 — Deployment ordering risk

`escrow`, `stake`, `voting`, `reputation` all default to `address(0)` and are set by owner per ADR-028. Until `setEscrow` is called, `openDispute` reverts at line 164 (good). Until `setReputation` is called, `_applyResolution` skips reputation events at line 407 (good). Until `setStake` is called, `_applyResolution` skips stake hooks at line 400 (good). Until `setVoting` is called, `escalateToVoting` reverts at line 228 (good). All four wires fail closed — no accidental zero-address calls.

### I-9 — `slashAmount` semantics at N1

`resolveN1Amicable` always passes `slashAmount = 0` (line 285). NatSpec at line 263-264 documents this ("No slash is applied at N1"). Verified.

---

## Conformance with Etalo constraints

- **ADR-022 non-custodial** : Dispute holds no buyer funds itself. All fund movement is delegated to Escrow's `resolveItemDispute`. The only state Dispute owns is dispute metadata + reputation hooks. ✓ verified.
- **ADR-023 forceRefund 3 conditions** : Dispute cannot trigger forceRefund. Dispute's `_applyResolution` is independent of Escrow's forceRefund path. CLAUDE.md rule 12 is preserved by the deployment-time `address(dispute) != 0` check that gates forceRefund — Dispute's existence inherently blocks forceRefund. ✓ verified at deployment-ordering level.
- **ADR-026 hardcoded limits** : Dispute does not reference `MAX_ORDER`, `MAX_TVL`, `MAX_SELLER_WEEKLY`, `EMERGENCY_PAUSE_MAX` — those are Escrow concerns. ✓ no bypass surface.
- **ADR-029 N3 vote partial release semantics** : verified at `resolveFromVote` line 327-329 (`refundAmount = item.itemPrice - item.releasedAmount`, capped at `remainingInEscrow`). NatSpec at line 302-309 explicitly documents the semantic and points at ADR-029. ✓ verified.
- **ADR-030 Dispute sole reputation authority** : verified at `_applyResolution` line 407-409 (sole `recordDispute` + `checkAndUpdateTopSeller` call site for dispute resolutions). EtaloEscrow.resolveItemDispute lines 887-890 (cross-checked) confirm the comment "Reputation events on dispute resolution are emitted by EtaloDispute._applyResolution". ✓ verified — no double-counting today.
- **ADR-031 auto-refund blocked on dispute** : verified at `openDispute` line 193 (calls `escrow.markItemDisputed` flipping item to `Disputed` status), and at EtaloEscrow.triggerAutoRefundIfInactive (out of scope this audit, see PASHOV_AUDIT_EtaloEscrow.md). ✓ wiring confirmed.
- **ADR-032 strict CEI** : `_applyResolution` line 385-415 applies all state writes (lines 392-396) before any external call (lines 398, 401, 403, 408-409). `nonReentrant` modifier on `openDispute`, `resolveN1Amicable`, `resolveN2Mediation`, `resolveFromVote`. ✓ verified.
- **ADR-041 V1 intra-only scope** : V2-deferred surfaces (Voting, Stake) all guarded by `address(...) != address(0)` checks. ✓ verified.
- **CLAUDE.md rules** :
  - Rule 1 (no .env) : N/A. ✓
  - Rule 2 (USDT 6 decimals) : Dispute does not do USDT math directly ; passes amounts through to Escrow / Stake. ✓
  - Rule 3 (no EIP-1559) : Dispute is contract-side ; tx type concern is frontend. ✓
  - Rule 6 (ReentrancyGuard on fund-moving) : openDispute / resolveN1Amicable / resolveN2Mediation / resolveFromVote all carry `nonReentrant`. ✓
  - Rule 11 (hardcoded limits) : not bypassed. ✓
  - Rule 12 (forceRefund 3 conditions) : not bypassed. ✓
  - Rule 14 (no new EIP-191 backend auth) : Dispute is on-chain-only. ✓

## V2-deferred surfaces noted

- **EtaloVoting integration** (V2 deferred per ADR-041) — wiring points :
  - `setVoting` line 112-115 (admin setter)
  - `escalateToVoting` line 219-255 (caller of `voting.createVote`)
  - `resolveFromVote` line 310-331 (callback from voting, gated by `onlyVoting` line 93-96)
  - `_voteIdToDisputeId` mapping line 78
- **EtaloStake integration** (V2 deferred per ADR-041) — wiring points :
  - `setStake` line 107-110 (admin setter)
  - `openDispute` line 194-196 (`stake.pauseWithdrawal` on dispute open)
  - `_applyResolution` line 400-405 (`stake.resumeWithdrawal` + optional `stake.slashStake` on resolution)
- All four V2-deferred external calls are guarded by `address(...) != address(0)` so V1 deployment without Voting / Stake is safe.

## Cross-references

- pashov-skills `solidity-auditor` (vector-scan / access-control / economic / invariant / math / execution-trace / periphery / first-principles)
- celopedia-skills `security-patterns.md` D.1-D.4
- docs/audit/PASHOV_XRAY.md (V2 threat model, EtaloDispute attack surface section §9)
- docs/DECISIONS.md ADR-022 / 023 / 026 / 029 / 030 / 031 / 032 / 041
- CLAUDE.md inner rules 1-15 (Etalo-specific constraints)
- docs/audit/PASHOV_AUDIT_EtaloEscrow.md (sister audit ; H-1 cross-references EtaloEscrow.markItemDisputed line 789-805 and resolveItemDispute line 832-918 for the co-conspirator gap)
