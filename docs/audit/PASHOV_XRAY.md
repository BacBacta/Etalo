# X-Ray — Etalo V2 Smart Contracts Pre-Audit Threat Model

Generated 2026-05-05 from `feat/design-system-v5` HEAD (commit `fceae5b`) for Track B Sprint J11 audit pré-pratique.

**Scope** : 7 V2 contracts at `packages/contracts/contracts/*.sol` + their interfaces. Audit focus this batch : EtaloEscrow + EtaloDispute + EtaloCredits (P0+P1). EtaloReputation scan-only. EtaloStake + EtaloVoting deferred V2 reactivation per ADR-041. MockUSDT skipped (OZ standard).

**Skill source** : pashov/skills `x-ray` + `solidity-auditor` workflow (read from `/tmp/pashov-skills` clone). Skill markdown format adapted for Etalo's specific architectural constraints (CLAUDE.md rules 11/12 + ADR-026/ADR-023).

---

## 1. Protocol overview

**Etalo V2** : non-custodial USDT escrow + dispute + reputation system for African intra-trade social commerce. Distributed via MiniPay on Celo (Sepolia testnet → mainnet Q2 2027 per Sprint J12 plan).

**V1 scope (per ADR-041, 2026-04-30)** : intra-Africa only, 4-market big bang (NG / GH / KE / ZA), single commission rate 1.8%, no seller stake (cross-border + stake reactivated V2). Auto-release 3 days standard intra. Top Seller program deferred V1.1.

**V2 contract surface** :

| Contract | Role | Lines (~) | Audit priority |
|---|---|---|---|
| EtaloEscrow | Order lifecycle, USDT custody, commission split, auto-release, force refund (ADR-023 gates) | 1146 | **P0** |
| EtaloDispute | N1/N2/N3 dispute escalation, fund reallocation via `resolveItemDispute` | TBD | **P0** |
| EtaloCredits | Asset generator credits ledger (Sprint J7), USDT → credits at fixed 0.15 USDT rate | TBD | **P1** |
| EtaloReputation | Seller score + Top Seller badge, callable by Escrow + Dispute only | TBD | **P2** scan-only |
| EtaloStake | Cross-border seller stake, 3-tier (Starter/Established/Top Seller) | TBD | **P1** deferred V2 reactivation |
| EtaloVoting | Dispute level 3 community jury | TBD | **P2** deferred V2 reactivation |
| MockUSDT | OZ ERC20 standard test fixture | 16 | **P3** skipped (audit minimal) |

## 2. Trust model

Per ADR-022 : Etalo positions as **non-custodial** per the Zenland / Circle standard. Funds live in public smart contracts on Celo ; mediator (Etalo dispute owner) power is **structurally bounded by code**, not by social agreements.

**Privileged actors** :

- **Owner (Etalo deployer / multisig)** :
  - Can : `setStakeContract`, `setDisputeContract`, `setReputationContract`, `setCommissionTreasury`, `setCreditsTreasury`, `setCommunityFund`, `emergencyPause`, `registerLegalHold`, `forceRefund` (gated by ADR-023 three conditions), `clearLegalHold`
  - Cannot : drain escrow without legal hold + 90-day inactivity + dispute contract unset (CLAUDE.md rule 12 + ADR-023)
- **Buyer (msg.sender of `createOrderWithItems` / `fundOrder` / `confirmItemDelivery`)** :
  - Can : create order, fund order, cancel before fund, confirm delivery, open dispute via EtaloDispute
- **Seller (`order.seller` per `createOrderWithItems` arg)** :
  - Can : ship items grouped, mark group arrived (cross-border), respond to dispute via EtaloDispute
- **Anyone (permissionless triggers)** :
  - Can : `triggerMajorityRelease`, `triggerAutoReleaseForItem`, `triggerAutoRefundIfInactive`. These are ADR-019 / ADR-026 strict timeouts that anyone can call once elapsed.
- **Dispute contract (`onlyDispute` modifier)** :
  - Can : `markItemDisputed`, `resolveItemDispute` — sole authority for item-level dispute state changes (ADR-015 + ADR-030).

## 3. Entry points classification

EtaloEscrow public surface :

### State-mutating, fund-moving

| Function | Caller | Pulls/pushes funds | Auth |
|---|---|---|---|
| `createOrderWithItems(seller, prices[], isCrossBorder)` | buyer | none yet (book only) | open |
| `fundOrder(orderId)` | buyer | pulls totalAmount via transferFrom | `onlyBuyer` (msg.sender == order.buyer) |
| `cancelOrder(orderId)` | buyer | none (status Created → Cancelled) | `onlyBuyer` |
| `shipItemsGrouped(orderId, itemIds[], proofHash)` | seller | cross-border : push 20% net to seller | `onlyseller` |
| `markGroupArrived(orderId, groupId, proofHash)` | buyer or seller | none (timer set) | buyer ∨ seller |
| `confirmItemDelivery(orderId, itemId)` | buyer | push remaining net to seller + commission to treasury | `onlyBuyer` |
| `confirmGroupDelivery(orderId, groupId)` | buyer | same as confirmItemDelivery × N | `onlyBuyer` |
| `triggerMajorityRelease(orderId, groupId)` | anyone | push 70% net to seller (cross-border, post-72h after arrived) | permissionless + temporal gate |
| `triggerAutoReleaseForItem(orderId, itemId)` | anyone | push remaining net + commission (post finalReleaseAfter) | permissionless + temporal gate |
| `triggerAutoRefundIfInactive(orderId)` | anyone | push totalAmount to buyer (post 7d intra / 14d cross) | permissionless + temporal gate + ADR-031 dispute check |
| `forceRefund(orderId, reasonHash)` | owner | push remaining to buyer | `onlyOwner` + ADR-023 three conditions |
| `markItemDisputed(orderId, itemId)` | dispute contract | none (state flip) | `onlyDispute` |
| `resolveItemDispute(orderId, itemId, refundAmount)` | dispute contract | push refund + net + commission per CEI | `onlyDispute` + nonReentrant |
| `emergencyPause()` | owner | none | `onlyOwner` + 30-day cooldown |
| `registerLegalHold(orderId, documentHash)` / `clearLegalHold(orderId)` | owner | none (registry) | `onlyOwner` |

### Admin setters

`setCommissionTreasury` / `setCreditsTreasury` / `setCommunityFund` / `setDisputeContract` / `setStakeContract` / `setReputationContract` — `onlyOwner`. Setter pattern: emits old → new event, then writes. No timelock.

## 4. Architectural invariants (must hold V1)

These are the bookkeeping invariants the contracts assume. **Violation = fund-loss bug**.

1. **`EtaloEscrow.totalEscrowedAmount == sum(USDT.balanceOf(EtaloEscrow))`** — total accounting matches custody. Currently implicit (not asserted on-chain). At risk under CIP-64 fee-currency drift (see celopedia security-patterns.md §2 + ADR-003 V1.5 plan).
2. **`order.totalAmount == sum(items[i].itemPrice for i in order.itemIds)`** — order total is the sum of item prices. Set at `createOrderWithItems` line 209-213 (loop). No mutation post-create.
3. **`order.totalCommission == sum(items[i].itemCommission for i in order.itemIds)`** — commission split is exact (last item absorbs dust per `EtaloEscrow.sol:255-258`). Verified by construction.
4. **`item.releasedAmount <= itemNet := item.itemPrice - item.itemCommission`** — per-item release never exceeds net allocation. `_accrueItemPartialRelease` line 1027 + `_releaseItemFully` line 1051.
5. **`MAX_TVL_USDT >= totalEscrowedAmount`** — per ADR-026 cap, enforced at `fundOrder` line 295.
6. **`MAX_ORDER_USDT >= order.totalAmount`** — per-order cap, enforced at `createOrderWithItems` line 215.
7. **`MAX_SELLER_WEEKLY_VOLUME >= sellerWeeklyVolume[seller]`** — weekly cap, enforced at `_updateSellerWeeklyVolume` line 998.
8. **`pausedUntil <= block.timestamp + EMERGENCY_PAUSE_MAX (= 7 days)`** — pause duration cap.
9. **`forceRefund` requires** : `dispute == address(0) ∧ block.timestamp > order.fundedAt + 90 days ∧ legalHoldRegistry[orderId] != 0` (ADR-023 three conditions, CLAUDE.md rule 12).
10. **`order.status == Refunded` ⟹ `sum(items[i].status == Refunded) == itemCount`** — order-level refund implies all items refunded. Maintained via `_computeNewOrderStatus` line 1108.

## 5. Cross-contract dependencies (composability map)

```
                     ┌──────────────┐
                     │   USDT (OZ)  │
                     └──────┬───────┘
                            │ transferFrom / transfer
                            ▼
                     ┌──────────────┐
                     │ EtaloEscrow  │◀────── (caller external)
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────────┐
              │             │                 │
              ▼             ▼                 ▼
   ┌──────────────┐ ┌────────────┐   ┌──────────────┐
   │ EtaloDispute │ │EtaloStake* │   │EtaloReputation│
   └──────┬───────┘ └────────────┘   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │ EtaloVoting* │  (* = V2 deferred per ADR-041)
   └──────────────┘
```

- **EtaloEscrow → EtaloStake** (`stake.isEligibleForOrder`, `stake.incrementActiveSales`, `stake.decrementActiveSales`) — V1 inactive (cross-border deferred). When V2 reactivates, stake contract calls re-introduce reentrancy surface.
- **EtaloEscrow → EtaloReputation** (`reputation.isTopSeller`, `reputation.recordCompletedOrder`, `reputation.checkAndUpdateTopSeller`) — V1 inactive (Top Seller deferred V1.1). When activated, reputation calls happen post-USDT transfer (ADR-032 strict CEI).
- **EtaloEscrow ← EtaloDispute** (`onlyDispute` callbacks `markItemDisputed`, `resolveItemDispute`). EtaloDispute is the SOLE authority for dispute reputation per ADR-030.
- **EtaloDispute → EtaloVoting** (V2 deferred) for level-3 jury escalation.
- **EtaloDispute → EtaloStake** (V2 deferred) for stake freeze on dispute open.
- **EtaloCredits** : independent, no escrow dependency. Pulls USDT from buyer for credits purchase, transfers to creditsTreasury.

## 6. Temporal risks (timer-based attack surface)

| Timer | Duration | Function | Risk |
|---|---|---|---|
| AUTO_RELEASE_INTRA | 3 days | seller can ship + 3 days → final release permissionless | Seller delays ship to maximize escrow time → buyer auto-refund kicks in (7 days). OK. |
| AUTO_RELEASE_TOP_SELLER | 2 days | Top Seller variant | V1.1 deferred — N/A V1 |
| AUTO_RELEASE_CROSS_FINAL | 5 days | post-arrival cross-border | V2 deferred |
| MAJORITY_RELEASE_DELAY | 72h | post-arrival cross-border | V2 deferred |
| AUTO_REFUND_INACTIVE_INTRA | 7 days | buyer auto-refund if no ship | Permissionless trigger, ADR-031 dispute-blocked |
| AUTO_REFUND_INACTIVE_CROSS | 14 days | cross-border variant | V2 deferred |
| EMERGENCY_PAUSE_MAX | 7 days | owner pause duration | bounded |
| EMERGENCY_PAUSE_COOLDOWN | 30 days | between pauses | enforced |
| FORCE_REFUND_INACTIVITY_THRESHOLD | 90 days | ADR-023 condition #2 | enforced |

**Temporal attack vectors to scrutinize per audit** :
- Block.timestamp manipulation : Solidity panic on overflow (≤2^32 unix epoch) negligible at current timestamps.
- Front-run permissionless triggers (`triggerMajorityRelease`, `triggerAutoRefundIfInactive`) : caller pays gas, no value extraction → economically irrational MEV, low risk.
- Edge-case : seller ships at `block.timestamp == fundedAt + AUTO_REFUND_INACTIVE_INTRA - 1s`, then anyone calls `triggerAutoRefundIfInactive` 2s later → race condition. Looking at `EtaloEscrow.sol:629-638` : `require(block.timestamp > deadline, ...)` and shipItemsGrouped flips status to PartiallyShipped/AllShipped which fails the `Funded` precondition at line 630. **Race condition resolved by status-not-timestamp check** ✓.

## 7. Architectural limits enforced (ADR-026 + CLAUDE.md rule 11)

Hardcoded constants — DO NOT propose fixes that bypass these :

```solidity
MAX_TVL_USDT                       = 50_000 * 10**6   // 50,000 USDT
MAX_ORDER_USDT                     = 500 * 10**6      // 500 USDT
MAX_SELLER_WEEKLY_VOLUME           = 5_000 * 10**6    // 5,000 USDT
EMERGENCY_PAUSE_MAX                = 7 days
EMERGENCY_PAUSE_COOLDOWN           = 30 days
MAX_ITEMS_PER_GROUP                = 20
MAX_ITEMS_PER_ORDER                = 50
FORCE_REFUND_INACTIVITY_THRESHOLD  = 90 days
```

Per CLAUDE.md inner règle 11 : "Architectural limits are hardcoded — never propose code that bypasses". Per ADR-026, numerical values may be revisited at V1 mainnet deploy time given 4-market big-bang load patterns (per ADR-041), but the hardcoding pattern itself is locked.

## 8. Known limitations + V2-deferred surfaces

Per ADR-041 V1 scope restriction :

- **EtaloStake** : code present + deployed Sepolia, but **NOT used by EtaloEscrow at runtime** (cross-border check at line 220-225 only fires when `isCrossBorder == true` which V1 frontend forces to false per backend cart.py:124 → V2 reactivation needed for stake.isEligibleForOrder runtime path).
- **EtaloVoting** : same — V2 deferred. Code present mais EtaloDispute level-3 path bypassed V1.
- **Top Seller program** : EtaloReputation has the `checkAndUpdateTopSeller` + `isTopSeller` machinery, but `_calculateCommission` line 980-985 + `_intraAutoReleaseDuration` line 1010-1014 fall back to default rates when `address(reputation) == address(0)`. Currently set per `setReputationContract`, so reputation is queryable, but Top Seller badge granting logic depends on volume/rating thresholds that V1 doesn't enforce.

## 9. Attack surface ranking (for audit prioritization)

For the 3 contracts in scope :

### EtaloEscrow (P0)
**Highest impact** — holds USDT, decides splits, permissionless triggers, multi-state machine.
Top scrutiny zones :
- `fundOrder` line 283-315 : USDT transferFrom external call + state ordering (CEI)
- `_releaseItemFully` line 1042-1099 : commission split + reputation external call (V2 reentrancy)
- `resolveItemDispute` line 832-918 : 3-way fund split (buyer / seller / treasury) under disputed state
- `triggerAutoRefundIfInactive` line 618-668 : permissionless refund + ADR-031 dispute block
- `_computeNewOrderStatus` line 1108-1145 : status transition logic, especially Completed/Refunded thresholds
- `forceRefund` line 678-742 : owner override, ADR-023 three conditions (CLAUDE.md rule 12)

### EtaloDispute (P0)
- N1/N2/N3 escalation logic
- Fund reallocation calls into `Escrow.resolveItemDispute(refundAmount)` — must clamp to `remainingInEscrow`
- Reputation event emission per ADR-030 (sole authority)

### EtaloCredits (P1, Sprint J7)
- USDT pull → credits ledger write
- Possible reentrancy if any post-write external call
- Welcome bonus + free monthly grant logic (per ADR-014)

## 10. Audit deliverables planned

- `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` (subagent dispatch — pashov-equivalent 8-agent perspectives merged)
- `docs/audit/PASHOV_AUDIT_EtaloDispute.md` (subagent dispatch)
- `docs/audit/PASHOV_AUDIT_EtaloCredits.md` (subagent dispatch)
- `docs/audit/PASHOV_AUDIT_EtaloReputation.md` (scan-only main thread, light)
- `docs/AUDIT_PRE_J11_SUMMARY.md` (synthesis : findings table + celopedia D.1-D.4 cross-ref + Top 10 issues + rejets ADR-026/CLAUDE rule 11/12 violators + déjà-traités for human auditor)

## 11. Out-of-scope this audit

- EtaloStake (V2 deferred) + EtaloVoting (V2 deferred) — code present mais runtime path inactive V1 per ADR-041. Will audit when V2 reactivation happens (probably Sprint J13+ when cross-border lands).
- MockUSDT — OZ standard, no custom logic. Audit covered by OpenZeppelin's own published audits.
- Off-chain backend services (FastAPI indexer, IPFS pinning, Twilio notifications) — separate audit scope (Sprint J11 backend security review).
- Frontend integration (wagmi connectors, MiniPay detection) — covered Sprint J11 frontend audit + Sprint J10-V5 Phase 5 polish lessons.

---

## Cross-references

- celopedia-skills `security-patterns.md` (4 Celo-specific risks D.1-D.4 captured in `docs/AUDIT_CELOPEDIA_ALIGN.md` commit `9e2a15e` §D)
- pashov/skills `solidity-auditor` 8-agent framework (vector-scan / math-precision / access-control / economic / execution-trace / invariant / periphery / first-principles)
- pashov/skills `x-ray` SKILL.md threat modeling pipeline
- `CLAUDE.md` inner Critical rules (1-15) + V2 invariants (14-15)
- `docs/DECISIONS.md` ADR-015 (V2 hierarchy) + ADR-022 (non-custodial) + ADR-023 (forceRefund 3 conditions) + ADR-026 (hardcoded limits) + ADR-030 (Dispute sole reputation authority) + ADR-031 (auto-refund blocked on dispute) + ADR-032 (CEI strict) + ADR-041 (V1 scope intra-only)
- `docs/SPEC_SMART_CONTRACT_V2.md` §0 V1 scope + §3 data structures + §7 forceRefund three conditions
