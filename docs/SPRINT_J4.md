# Etalo — Sprint J4: Smart Contract V2 Refactor

**Start date**: May 2026 (exact date TBD by Mike)
**Duration target**: 5–6 working days (~30 hours of focused work)
**Developer**: Mike (solo)
**Primary AI assistant for execution**: Claude CLI in Cursor
**Primary spec**: `docs/SPEC_SMART_CONTRACT_V2.md`
**Relevant ADRs**: ADR-015 through ADR-026

---

## Sprint Mission

Refactor the V1 smart contract stack into the V1 Boutique architecture:

- `EtaloEscrow` — full rewrite around the **Order / ShipmentGroups / Items** hierarchy (ADR-015), with progressive cross-border release 20/70/10 (ADR-018), strict seller inactivity deadlines (ADR-019), restricted `forceRefund` (ADR-023), three separated treasuries (ADR-024), and hardcoded architectural limits (ADR-026).
- `EtaloStake` — **new** contract for the 3-tier cross-border seller stake with 14-day cooldown and dispute-freeze logic (ADR-020, ADR-021).
- `EtaloVoting` — **new** contract for level-3 community dispute voting (simplified V1).
- `EtaloDispute` — adaptations for item-level disputes and cross-contract hooks into `EtaloStake` and `EtaloVoting`.
- `EtaloReputation` — minor adaptations to expose Top Seller eligibility to `EtaloStake`.

**End-of-sprint checkpoint**: five V2 contracts deployed on Celo Sepolia, verified on CeloScan, passing 85%+ test coverage, with four end-to-end scenarios validated on testnet.

---

## Prerequisites (BLOCKERS if not done)

Before starting Block 1:

- V1 contracts remain deployed on Celo Sepolia (unchanged, serve as historical reference):
  - `EtaloEscrow` v1: `0x652e0278f4a1b7915dc89f53ab3e5c35696cb455`
  - `EtaloDispute` v1: `0x438ed447c5467abb6395b56a88bfec7a80c489e9`
  - `EtaloReputation` v1: `0xc9d3f823a4c985bd126899573864dba4a6601ef4`
- `docs/SPEC_SMART_CONTRACT_V2.md` is the source of truth; re-read sections 1–17 before starting.
- Three Celo wallets prepared for the V2 treasuries (`commissionTreasury`, `creditsTreasury`, `communityFund`) — addresses staged in `.env` ahead of Block 11.
- Sufficient Celo Sepolia testnet CELO in the deployer wallet (~5 CELO) — top up from `https://faucet.celo.org` if needed.
- Foundry installed locally for invariant tests (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).
- Slither installed (`pip install slither-analyzer`); Aderyn installed (`cargo install aderyn` or the latest recommended install method).
- `OpenZeppelin` contracts pinned to a stable version in `packages/contracts/package.json`.

---

## Architecture Overview

```
packages/contracts/
├── contracts/
│   ├── archive/v1/                   ← V1 code kept for reference, not compiled
│   │   ├── EtaloEscrow.sol
│   │   ├── EtaloDispute.sol
│   │   └── EtaloReputation.sol
│   ├── interfaces/
│   │   ├── IERC20.sol                (unchanged)
│   │   ├── IEtaloEscrow.sol          (V2 API — new signatures)
│   │   ├── IEtaloStake.sol           (NEW)
│   │   ├── IEtaloVoting.sol          (NEW)
│   │   ├── IEtaloDispute.sol         (updated)
│   │   └── IEtaloReputation.sol      (minor additions)
│   ├── types/
│   │   └── EtaloTypes.sol            (NEW — shared structs + enums)
│   ├── EtaloEscrow.sol               (V2 full rewrite)
│   ├── EtaloStake.sol                (NEW)
│   ├── EtaloVoting.sol               (NEW)
│   ├── EtaloDispute.sol              (adapted)
│   └── EtaloReputation.sol           (adapted)
├── test/
│   ├── EtaloEscrow.v2.test.ts        (~40 tests)
│   ├── EtaloStake.test.ts            (~25 tests)
│   ├── EtaloVoting.test.ts           (~10 tests)
│   ├── EtaloDispute.v2.test.ts       (~15 tests)
│   ├── EtaloReputation.v2.test.ts    (~10 tests)
│   └── Integration.v2.test.ts        (~15 tests)
├── test/invariants/                  (NEW — Foundry)
│   ├── EscrowInvariants.t.sol
│   └── StakeInvariants.t.sol
├── scripts/
│   └── deploy.v2.ts                  (NEW — ordered deployment)
└── foundry.toml                      (NEW — coexists with Hardhat)
```

---

## Block Dependency Graph

```
Block 1 ─┬─► Block 2 ─┬─► Block 3 (Reputation)
         │            ├─► Block 4 (Stake) ─────────┐
         │            ├─► Block 5 (Voting) ────────┤
         │            └─► Block 6 (Dispute) ──────►│
         │                                         ▼
         │                                    Block 7 (Escrow)
         │                                         │
         │                                         ▼
         └────────────────────────────────► Block 8 (Integration tests)
                                                   │
                                                   ▼
                                            Block 9 (Foundry invariants)
                                                   │
                                                   ▼
                                            Block 10 (Static analysis)
                                                   │
                                                   ▼
                                            Block 11 (Deploy Sepolia)
                                                   │
                                                   ▼
                                            Block 12 (Testnet smoke tests)
                                                   │
                                                   ▼
                                            Block 13 (Docs + cleanup)
```

Blocks 3, 4, 5 can be parallelized if time allows; Block 6 depends on 3+4+5 via cross-contract hooks. Block 7 depends on all prior contract blocks.

---

## Time Breakdown

| Block | Task | Duration | Priority |
|-------|------|----------|----------|
| 1 | Branch setup, V1 archive, V2 scaffold | 1h | Must-have |
| 2 | Interfaces + shared types | 2h | Must-have |
| 3 | `EtaloReputation` adaptations | 1h | Must-have |
| 4 | `EtaloStake` (new) | 4–5h | Must-have |
| 5 | `EtaloVoting` (new, simplified) | 2–3h | Must-have |
| 6 | `EtaloDispute` adaptations | 3h | Must-have |
| 7 | `EtaloEscrow` V2 full rewrite | 6–8h | Must-have |
| 8 | End-to-end integration tests | 2h | Must-have |
| 9 | Foundry invariant tests | 2h | Must-have |
| 10 | Static analysis (Slither + Aderyn) | 1h | Must-have |
| 11 | Deploy to Celo Sepolia + CeloScan verify | 1.5h | Must-have |
| 12 | Testnet smoke tests (4 scenarios) | 1h | Must-have |
| 13 | Documentation + cleanup | 1.5h | Must-have |
| **Total** | | **~29–32h** | |

---

## Definition of Done

Sprint J4 is considered complete when **all** of the following hold:

- The five contracts compile with zero warnings (`npx hardhat compile` and `forge build`).
- Hardhat test coverage ≥ 85% on the V2 contract codebase (`npx hardhat coverage`).
- All five Foundry invariants pass (`forge test --match-contract Invariants`).
- Slither reports no `High` or `Medium` severity issues; Aderyn reports clean.
- Five V2 contracts deployed on Celo Sepolia with new addresses recorded in `.env.example` and `docs/SECURITY.md`.
- All five contracts verified on CeloScan (source code visible).
- Four end-to-end smoke scenarios executed on testnet and documented (Block 12).
- Three treasury wallets configured and verified on-chain.
- `docs/SMART_CONTRACTS.md`, `docs/SECURITY.md`, and `README.md` reflect the V2 architecture.
- All changes committed and pushed to `feat/contracts-v2` branch, PR opened for review (self-review acceptable for solo dev).

---

## Out of Scope (explicit deferrals)

The following are **not** part of Sprint J4:

- Backend refactor to consume the new contract API → **Sprint J5**.
- Frontend Mini App refactor for the Boutique model → **Sprint J6**.
- `EtaloCredits` contract for the asset generator → **Sprint J9**.
- Mainnet deployment of V2 contracts → deferred to **Q1 2027**, after audit/grant (ADR-025).
- Payment of an external audit firm → deferred to **Phase 3** of the audit strategy (ADR-025).
- Proxy upgradeability pattern (V1 contracts are immutable per ADR-026) — migrations require a fresh deployment.

---

## Blocks

### Block 1: Branch setup, V1 archive, V2 scaffold (1h)

**Goal**: Set up the working branch, move V1 contracts to an archive folder (keeping them in git history but excluded from compilation), and scaffold the V2 file structure.

**Commands**:
```bash
git checkout main
git pull
git checkout -b feat/contracts-v2
mkdir -p packages/contracts/contracts/archive/v1
mkdir -p packages/contracts/contracts/types
mv packages/contracts/contracts/EtaloEscrow.sol packages/contracts/contracts/archive/v1/
mv packages/contracts/contracts/EtaloDispute.sol packages/contracts/contracts/archive/v1/
mv packages/contracts/contracts/EtaloReputation.sol packages/contracts/contracts/archive/v1/
```

**Hardhat config update**: Exclude `archive/v1/` from compilation. In `hardhat.config.ts`:
```ts
solidity: {
  compilers: [{ version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } }],
},
paths: {
  sources: "./contracts",
},
// Exclude via a preprocessor step or by moving archive outside contracts/
// Alternative: keep archive/ outside contracts/ entirely.
```

(Recommendation: move `archive/v1/` to `packages/contracts/archive/v1/` — outside `contracts/` — so Hardhat never compiles it.)

**Files to create (empty placeholders)**:
- `contracts/types/EtaloTypes.sol`
- `contracts/interfaces/IEtaloEscrow.sol` (V2 signatures)
- `contracts/interfaces/IEtaloStake.sol`
- `contracts/interfaces/IEtaloVoting.sol`
- `contracts/EtaloEscrow.sol` (empty shell, `// SPDX + pragma only`)
- `contracts/EtaloStake.sol` (empty shell)
- `contracts/EtaloVoting.sol` (empty shell)
- `contracts/EtaloDispute.sol` (copy from archive as starting point for adaptation)
- `contracts/EtaloReputation.sol` (copy from archive as starting point)

**Commit**: `chore(contracts): archive V1 and scaffold V2 file structure`

**Checkpoint**:
- `npx hardhat compile` succeeds with empty contracts (pragma-only files).
- V1 contracts no longer in `contracts/` root (visible in `archive/v1/`).
- Branch `feat/contracts-v2` pushed to origin.

---

### Block 2: Interfaces and shared types (2h)

**Goal**: Define all shared enums, structs, and interface signatures before implementation. This unlocks parallel work on Blocks 3–5.

**Reference**: `docs/SPEC_SMART_CONTRACT_V2.md` §3 (structures) and §12 (public functions).

**Files to write**:

1. `contracts/types/EtaloTypes.sol` — shared types:
   ```solidity
   library EtaloTypes {
       enum OrderStatus { Created, Funded, Active, Completed, Refunded, Disputed }
       enum ItemStatus { Pending, Shipped, Arrived, Delivered, Released, Disputed, Refunded }
       enum ShipmentStatus { Pending, Shipped, Arrived, Released }
       enum StakeTier { None, Starter, Established, TopSeller }
       enum DisputeLevel { N1_Amicable, N2_Mediation, N3_Voting }

       struct Item { ... }             // see §3.2 of spec
       struct ShipmentGroup { ... }    // see §3.3 of spec
       struct Order { ... }            // see §3.1 of spec
   }
   ```

2. `contracts/interfaces/IEtaloEscrow.sol` — all external/public function signatures for V2 (see spec §12).

3. `contracts/interfaces/IEtaloStake.sol` — `depositStake`, `upgradeTier`, `initiateWithdrawal`, `executeWithdrawal`, `cancelWithdrawal`, `pauseWithdrawal`, `resumeWithdrawal`, `slashStake` + views.

4. `contracts/interfaces/IEtaloVoting.sol` — `createVote`, `submitVote`, `finalizeVote` + views.

5. `contracts/interfaces/IEtaloDispute.sol` — updated for item-level disputes and `pauseWithdrawal`/`resumeWithdrawal` hooks.

6. `contracts/interfaces/IEtaloReputation.sol` — add `isTopSeller(address)` view for tier 3 gating.

**Checkpoint**:
- `npx hardhat compile` succeeds.
- All interfaces importable from test files.
- No function bodies yet — signatures and NatSpec only.

**Commit**: `feat(contracts): define V2 interfaces and shared types`

---

### Block 3: `EtaloReputation` adaptations (1h)

**Goal**: Update `EtaloReputation` to expose Top Seller eligibility to `EtaloStake` (Block 4 dependency).

**Reference**: ADR-020 (Top Seller badge → Tier 3 eligibility).

**Changes**:
- Add `function isTopSeller(address seller) external view returns (bool)` — returns true when seller meets the Top Seller threshold (50+ completed sales or defined criteria).
- Retain existing review + score logic from V1.
- Update NatSpec.

**Tests** (`test/EtaloReputation.v2.test.ts`, ~10 tests):
- Existing V1 tests adapted (ensure review + score still work).
- `isTopSeller` returns false initially.
- `isTopSeller` returns true after crossing threshold.
- Events emitted correctly.

**Checkpoint**:
- Reputation tests pass.
- Coverage ≥ 85% on this contract.

**Commit**: `feat(contracts): adapt EtaloReputation for V2 (Top Seller query)`

---

### Block 4: `EtaloStake` (new contract) (4–5h)

**Goal**: Implement the full 3-tier stake contract with cooldown, dispute freeze, slash, downgrade, and cancel flows.

**Reference**: `docs/SPEC_SMART_CONTRACT_V2.md` §6, ADR-020, ADR-021.

**Key constants**:
- `TIER_1_AMOUNT = 10 USDT`, `TIER_2_AMOUNT = 25 USDT`, `TIER_3_AMOUNT = 50 USDT`
- `TIER_1_MAX_CONCURRENT = 3`, `TIER_2_MAX_CONCURRENT = 10`, `TIER_3_MAX_CONCURRENT = type(uint256).max`
- `TIER_1_MAX_PRICE = 100 USDT`, `TIER_2_MAX_PRICE = 200 USDT`, `TIER_3_MAX_PRICE = type(uint256).max`
- `WITHDRAWAL_COOLDOWN = 14 days`

**Functions to implement**:
- `depositStake(StakeTier tier)` — initial deposit.
- `upgradeTier(StakeTier newTier)` — ADD the delta between current and new tier.
- `initiateWithdrawal(StakeTier newTier)` — start 14-day cooldown. `newTier = None` for full exit.
- `executeWithdrawal()` — after cooldown, no active dispute.
- `cancelWithdrawal()` — reactivate stake any time during cooldown.
- `pauseWithdrawal(address seller)` — `onlyDisputeContract`, freezes cooldown.
- `resumeWithdrawal(address seller)` — `onlyDisputeContract`, resumes cooldown timer.
- `slashStake(address seller, uint256 amount, address victim)` — `onlyDisputeContract`, sends to victim first, surplus to `communityFund`.
- Views: `getStake(seller)`, `getTier(seller)`, `getConcurrentSales(seller)`, `canWithdraw(seller)`, `isEligibleForOrder(seller, orderPrice)`.
- Integration hooks with `EtaloEscrow`: increment/decrement concurrent sales count on order create/complete.

**Tests** (`test/EtaloStake.test.ts`, ~25 tests):
- Deposit at each tier.
- Upgrade T1 → T2 → T3.
- Initiate withdrawal with zero active sales.
- Initiate withdrawal fails with active sales.
- Cooldown timer progression.
- Execute withdrawal after cooldown succeeds.
- Execute withdrawal fails before cooldown.
- Dispute opens during cooldown → freeze.
- Resume after dispute resolution.
- Slash with victim receives priority, surplus to communityFund.
- Downgrade T2 → T1 returns 15 USDT delta.
- Cancel withdrawal any time during cooldown.
- Multiple downgrades allowed.
- Concurrent sales limit enforced per tier.
- Max price per tier enforced.
- Top Seller gating via `EtaloReputation.isTopSeller`.
- Events emitted correctly for each state change.
- Reentrancy guard on all fund-moving functions.

**Checkpoint**:
- All 25 tests pass.
- Coverage ≥ 85%.
- Slither on this contract alone: clean.

**Commit**: `feat(contracts): add EtaloStake — 3-tier cross-border stake with cooldown and slash`

---

### Block 5: `EtaloVoting` (new, simplified N3) (2–3h)

**Goal**: Implement the simplified level-3 community voting contract for dispute escalation.

**Reference**: ADR-022 (non-custodial — N3 is the final on-chain resolution).

**Functions to implement**:
- `createVote(uint256 disputeId, address[] calldata eligibleVoters, uint256 votingPeriod)` — called by `EtaloDispute` when escalating to N3.
- `submitVote(uint256 voteId, bool favorBuyer)` — one vote per eligible voter.
- `finalizeVote(uint256 voteId)` — permissionless after voting period; emits result, calls back into `EtaloDispute`.
- Views: `getVote(voteId)`, `hasVoted(voteId, voter)`, `getResult(voteId)`.

**Simplifications for V1**:
- Eligible voters: initially a fixed set of mediators provided by Etalo (admin-managed, documented in `docs/SECURITY.md`).
- One-person-one-vote (no token weighting yet).
- Majority wins; ties default to refund buyer (conservative).
- Voting period: 14 days per dispute-flow spec.

**Tests** (`test/EtaloVoting.test.ts`, ~10 tests):
- Create vote with valid eligible voters.
- Submit vote — counted correctly.
- Submit vote twice — rejected.
- Non-eligible voter rejected.
- Finalize before period ends — rejected.
- Finalize after period — majority wins.
- Tie goes to buyer.
- Events emitted.
- Callback to `EtaloDispute` triggers.

**Checkpoint**:
- All 10 tests pass.
- Coverage ≥ 85%.

**Commit**: `feat(contracts): add EtaloVoting — N3 community dispute resolution (simplified V1)`

---

### Block 6: `EtaloDispute` adaptations (3h)

**Goal**: Adapt `EtaloDispute` to item-level disputes, add hooks into `EtaloStake` (freeze/resume/slash), and add escalation path to `EtaloVoting`.

**Reference**: ADR-022 (3-level dispute system), `docs/SPEC_SMART_CONTRACT_V2.md` §12.5.

**Changes vs V1**:
- Disputes now target **items** (not orders). `openDispute(uint256 orderId, uint256 itemId, string reason)`.
- On dispute open: call `EtaloStake.pauseWithdrawal(seller)`.
- On dispute resolution: call `EtaloStake.resumeWithdrawal(seller)` and, if fraud proven, `EtaloStake.slashStake(seller, amount, victim)`.
- N1 (amicable) — 48h window; both parties must agree on outcome.
- N2 (mediator) — 7 days; Etalo mediator resolves.
- N3 (voting) — 14 days; calls `EtaloVoting.createVote`, then callback `resolveFromVote(voteId, result)`.

**Tests** (`test/EtaloDispute.v2.test.ts`, ~15 tests):
- Open dispute at item level.
- N1 amicable resolution (both parties agree).
- N1 timeout → auto-escalate to N2.
- N2 mediator resolves favor buyer (with or without slash).
- N2 mediator resolves favor seller.
- N2 timeout → auto-escalate to N3.
- N3 vote creation + completion.
- Stake pause on dispute open.
- Stake resume on dispute resolution.
- Stake slash on fraud-confirmed resolution.
- Multiple disputes against same seller (each independently frozen).
- Item-level isolation (dispute on item 1 doesn't block release of items 2-5).
- Reentrancy guard.
- Events.

**Checkpoint**:
- All 15 tests pass.
- Integration with `EtaloStake` mock verified.
- Coverage ≥ 85%.

**Commit**: `feat(contracts): adapt EtaloDispute for V2 (item-level + stake hooks + N3 voting)`

---

### Block 7: `EtaloEscrow` V2 full rewrite (6–8h) — LE GROS MORCEAU

**Goal**: Rewrite `EtaloEscrow` as the central orchestrator with Order/ShipmentGroups/Items hierarchy, progressive release, auto-refund, `forceRefund` restrictions, architectural limits, and integration with `EtaloStake` and `EtaloDispute`.

**Reference**: `docs/SPEC_SMART_CONTRACT_V2.md` §3–11 (full coverage). ADRs 015, 017, 018, 019, 023, 024, 026.

**Constants** (see spec §11):
```solidity
// Commissions
uint256 public constant COMMISSION_INTRA_BPS = 180;         // 1.8%
uint256 public constant COMMISSION_CROSS_BPS = 270;         // 2.7%
uint256 public constant COMMISSION_TOP_SELLER_BPS = 120;    // 1.2%

// Auto-release timers
uint256 public constant AUTO_RELEASE_INTRA = 3 days;
uint256 public constant AUTO_RELEASE_TOP_SELLER = 2 days;
uint256 public constant AUTO_RELEASE_CROSS_FINAL = 5 days;
uint256 public constant MAJORITY_RELEASE_DELAY = 72 hours;

// Auto-refund deadlines
uint256 public constant AUTO_REFUND_INACTIVE_INTRA = 7 days;
uint256 public constant AUTO_REFUND_INACTIVE_CROSS = 14 days;

// Cross-border release percentages (basis points)
uint256 public constant SHIPPING_RELEASE_PCT = 2000;    // 20%
uint256 public constant MAJORITY_RELEASE_PCT = 7000;    // 70%
uint256 public constant FINAL_RELEASE_PCT = 1000;       // 10%

// Architectural limits
uint256 public constant MAX_TVL_USDT = 50_000 * 10**6;
uint256 public constant MAX_ORDER_USDT = 500 * 10**6;
uint256 public constant MAX_SELLER_WEEKLY_VOLUME = 5_000 * 10**6;
uint256 public constant EMERGENCY_PAUSE_MAX = 7 days;
uint256 public constant EMERGENCY_PAUSE_COOLDOWN = 30 days;
uint256 public constant MAX_ITEMS_PER_GROUP = 20;
uint256 public constant MAX_ITEMS_PER_ORDER = 50;

// Force refund
uint256 public constant FORCE_REFUND_INACTIVITY_THRESHOLD = 90 days;
```

**Functions to implement** (spec §12):

Seller lifecycle:
- `createOrder(address buyer, Item[] calldata items, bool isCrossBorder, uint8 sellerTier)` — creates the order; reverts if any limit would be breached or seller stake insufficient.
- `fundOrder(uint256 orderId)` — buyer pulls USDT via `transferFrom`.
- `createShipmentGroup(uint256 orderId, uint256[] calldata itemIds, bytes32 shipmentProofHash)` — seller groups items + uploads proof. Triggers 20% release for cross-border.
- `markArrived(uint256 groupId, bytes32 arrivalProofHash)` — seller marks group arrived in destination country. Starts 72h timer.

Buyer lifecycle:
- `confirmDelivery(uint256 itemId)` — triggers immediate final-10% release.

Permissionless triggers:
- `triggerMajorityRelease(uint256 groupId)` — anyone can call after 72h without dispute.
- `triggerFinalRelease(uint256 groupId)` — anyone can call after 5 days from majority release.
- `triggerAutoRefundIfInactive(uint256 orderId)` — anyone can call after 7/14 days inactivity (ADR-019).

Admin (restricted):
- `pause()` / `unpause()` — with `EMERGENCY_PAUSE_MAX` auto-expiry.
- `registerLegalHold(uint256 orderId, bytes32 documentHash)` — `onlyOwner`.
- `forceRefund(uint256 orderId)` — gated by the three conditions from ADR-023.
- `setCommissionTreasury`, `setCreditsTreasury`, `setCommunityFund` — each with event.
- `setDisputeContract`, `setStakeContract`, `setReputationContract` — setters with events.

Dispute-only:
- `freezeItem(uint256 itemId)` — `onlyDisputeContract`, prevents release until resolved.
- `releaseItemAfterDispute(uint256 itemId, bool toBuyer)` — `onlyDisputeContract`.

**Tests** (`test/EtaloEscrow.v2.test.ts`, ~40 tests — see spec §16.1):

Creation and funding:
1. Create single-item intra order.
2. Create single-item cross-border order — fails without stake.
3. Create single-item cross-border — succeeds with Tier 1 stake.
4. Create multi-item order (5 items).
5. Create order exceeding `MAX_ITEMS_PER_ORDER` — reverts.
6. Fund order via `transferFrom`.
7. Fund order with insufficient allowance — reverts.

Shipment groups:
8. Create group with 1 item.
9. Create group with multiple items.
10. Create group with > `MAX_ITEMS_PER_GROUP` — reverts.
11. Create multiple groups for one order.
12. Cross-border group creation → 20% release to seller.
13. Intra group creation → no immediate release (awaits auto-release timer).

Release flows (intra):
14. Auto-release intra after 3 days (standard).
15. Auto-release intra after 2 days (Top Seller).
16. Buyer manual confirm before auto-release timer.

Release flows (cross-border):
17. Mark arrived → 72h majority release timer starts.
18. `triggerMajorityRelease` after 72h → 70% released.
19. `triggerFinalRelease` after 5 days post-majority → 10% released + commission deducted.
20. Buyer `confirmDelivery` → immediate final 10% release.

Disputes:
21. Dispute on item 1 doesn't block release of items 2-5 in same group.
22. Frozen item stays locked until dispute resolves.
23. Dispute resolution toBuyer triggers refund of item.
24. Dispute resolution toSeller releases item normally.

Auto-refund:
25. `triggerAutoRefundIfInactive` before deadline — reverts.
26. `triggerAutoRefundIfInactive` after 7 days intra — refunds whole order.
27. `triggerAutoRefundIfInactive` after 14 days cross-border — refunds whole order.

Force refund (ADR-023):
28. `forceRefund` without all 3 conditions — reverts.
29. `forceRefund` with dispute contract still set — reverts.
30. `forceRefund` before 90 days — reverts.
31. `forceRefund` without registered legal hold — reverts.
32. `forceRefund` with all 3 conditions — succeeds.

Architectural limits:
33. Create order that would push TVL over `MAX_TVL` — reverts.
34. Create order > `MAX_ORDER_USDT` — reverts.
35. Seller weekly volume exceeding `MAX_SELLER_WEEKLY` — reverts.

Emergency pause:
36. `pause` blocks all state-mutating functions except admin.
37. `pause` auto-expires after `EMERGENCY_PAUSE_MAX`.
38. Successive pauses require `EMERGENCY_PAUSE_COOLDOWN` gap.

Treasuries:
39. Commission flows to `commissionTreasury`.
40. Setter events emitted.

**Checkpoint**:
- All 40 tests pass.
- Coverage ≥ 85%.
- Slither on Escrow: clean.

**Commit**: `feat(contracts): rewrite EtaloEscrow V2 — Order/ShipmentGroups/Items hierarchy`

---

### Block 8: End-to-end integration tests (2h)

**Goal**: Test cross-contract interactions with real (non-mocked) deployed instances.

**File**: `test/Integration.v2.test.ts` (~15 tests).

**Scenarios**:
1. Full intra-Africa order flow (create → fund → ship → auto-release).
2. Full cross-border flow with progressive release 20/70/10.
3. Order with disputed item (item 2 disputed, items 1/3/4 released normally).
4. Seller fraud → dispute → stake slashed → buyer refunded.
5. Seller inactivity 14 days → permissionless auto-refund.
6. Top Seller path: commission 1.2%, auto-release 2 days.
7. Seller stake upgrade mid-cycle (T1 → T2 while active sales).
8. Seller stake withdrawal after completing all sales.
9. Concurrent disputes against same seller (multiple freezes).
10. N3 vote escalation with simulated mediators.
11. Force refund after 90 days + legal hold.
12. Emergency pause during active order.
13. TVL cap reached → new orders reject.
14. Weekly seller cap reached → new orders reject.
15. Multiple shipment groups with mixed statuses.

**Checkpoint**:
- All 15 integration tests pass.
- Contracts deployed via Hardhat Ignition for the test suite (simulates production ordering).

**Commit**: `test(contracts): end-to-end integration scenarios V2`

---

### Block 9: Foundry invariant tests (2h)

**Goal**: Add property-based invariant tests for long-running assurance.

**Reference**: `docs/SPEC_SMART_CONTRACT_V2.md` §16.2.

**Setup**:
- Add `foundry.toml` coexisting with Hardhat config.
- Tests live in `test/invariants/`.
- Run via `forge test --match-contract Invariants`.

**Invariants to implement** (5 total):
1. `sum(balances) == total_funded - total_released - total_refunded`
2. No item can be in both `Released` and `Refunded` states.
3. Effective commission per order is always in [1.2%, 2.7%] range.
4. Total slashed stake never exceeds total deposited stake.
5. An order in `Completed` state cannot transition back to any prior state.

**Handlers**: write `EscrowHandler.sol` and `StakeHandler.sol` exposing bounded random actions (create, fund, ship, dispute, refund) for the fuzzer.

**Checkpoint**:
- `forge test` runs ≥ 10,000 invariant iterations without violation.

**Commit**: `test(contracts): add Foundry invariant suite`

---

### Block 10: Static analysis (Slither + Aderyn) (1h)

**Goal**: Confirm no critical or high-severity findings.

**Commands**:
```bash
cd packages/contracts
slither . --config-file slither.config.json
aderyn .
```

**Process**:
- Run both tools.
- Review findings.
- `High` or `Medium` issues → fix and re-run.
- `Low` / `Info` → document in `docs/SECURITY.md` with justification if intentional.

**Allowed exceptions** (must be documented):
- `Reentrancy` warnings on functions already guarded by `ReentrancyGuard` — acceptable.
- `Shadowing` warnings on constructor parameters — acceptable if standard pattern.

**Checkpoint**:
- Zero `High` or `Medium` findings.
- `docs/SECURITY.md` has a "Static Analysis Report" section listing tool versions and date of last run.

**Commit**: `chore(contracts): address Slither/Aderyn findings + document exceptions`

---

### Block 11: Deploy to Celo Sepolia and verify on CeloScan (1.5h)

**Goal**: Deploy the five V2 contracts in the correct order, configure inter-references, configure the three treasuries, and verify all on CeloScan.

**Reference**: `docs/SPEC_SMART_CONTRACT_V2.md` §15.2 (deployment checklist).

**Prerequisites**:
- `.env` has `DEPLOYER_PRIVATE_KEY`, `CELO_SEPOLIA_RPC`, `CELOSCAN_API_KEY`.
- `.env` has `COMMISSION_TREASURY_ADDR`, `CREDITS_TREASURY_ADDR`, `COMMUNITY_FUND_ADDR`.

**Script**: `scripts/deploy.v2.ts` (use Hardhat Ignition).

**Deployment order**:
1. `EtaloReputation` (no dependencies)
2. `EtaloStake` (depends on Reputation for Top Seller query)
3. `EtaloVoting` (no dependencies)
4. `EtaloDispute` (depends on Stake + Voting)
5. `EtaloEscrow` (depends on all above)

After deployment:
- Call `setDisputeContract`, `setStakeContract`, `setReputationContract`, `setVotingContract` where applicable.
- Call `setCommissionTreasury`, `setCreditsTreasury`, `setCommunityFund` on `EtaloEscrow`.
- Verify each contract on CeloScan (`npx hardhat verify --network celoSepolia <address> <constructor-args>`).
- Record addresses in `.env.example` and `docs/SECURITY.md`.

**Checkpoint**:
- Five contracts deployed, addresses recorded.
- Five CeloScan pages show verified source code.
- Three treasury addresses queryable via getter and return expected values.

**Commit**: `deploy(contracts): V2 contracts on Celo Sepolia with CeloScan verification`

---

### Block 12: Testnet smoke tests (1h)

**Goal**: Run four real scenarios on Celo Sepolia to validate the deployed contracts under real network conditions.

**Scenarios**:
1. **Intra-Africa happy path**: test wallet A buys from test wallet B (same country), order funded, seller ships, auto-release after 3 days (use `evm_increaseTime` via a helper RPC or wait).
2. **Cross-border 20/70/10**: test wallet A (Europe) buys from test wallet B (Africa), 20% release at shipping, 70% at arrival + 72h, 10% at confirmation.
3. **Auto-refund after 14 days inactivity**: cross-border order funded, seller never ships, permissionless `triggerAutoRefundIfInactive` called after 14 days, buyer refunded.
4. **Dispute flow**: cross-border order with item dispute opened, mediator resolves in favor of buyer, stake slashed, buyer refunded from stake.

Document each scenario in `docs/SECURITY.md` with transaction hashes.

**Checkpoint**:
- Four scenarios executed successfully.
- Transaction hashes recorded.

**Commit**: `test(contracts): testnet smoke tests for V2 (4 scenarios documented)`

---

### Block 13: Documentation and cleanup (1.5h)

**Goal**: Update all documentation to reflect V2 and hand off cleanly to Sprint J5.

**Files to update**:

1. `docs/SMART_CONTRACTS.md` — rewrite for V2:
   - New contract list and responsibilities.
   - Function signatures with NatSpec-style descriptions.
   - State machine diagrams for Order / ShipmentGroups / Items.
   - Link to SPEC_SMART_CONTRACT_V2.md for deeper detail.

2. `docs/SECURITY.md` — **create**:
   - Deployed V2 addresses (Celo Sepolia).
   - Three treasury addresses + governance model.
   - Architectural limits (reference ADR-026).
   - `forceRefund` conditions (reference ADR-023).
   - Non-custodial claim justification (reference ADR-022).
   - Static analysis report summary.
   - Testnet smoke test transaction hashes.
   - Bug bounty policy (placeholder for Phase 4 of ADR-025).

3. `README.md`:
   - Update "Smart contracts" section with new addresses.
   - Remove V1 address references where misleading.

4. `docs/DECISIONS.md`:
   - Add any ADR-027+ entries discovered during implementation (unexpected trade-offs).

5. `.env.example`:
   - New variables: `V2_ESCROW_ADDR`, `V2_STAKE_ADDR`, `V2_VOTING_ADDR`, `V2_DISPUTE_ADDR`, `V2_REPUTATION_ADDR`, `COMMISSION_TREASURY_ADDR`, `CREDITS_TREASURY_ADDR`, `COMMUNITY_FUND_ADDR`.

6. `CLAUDE.md`:
   - Update "Current sprint" to point at `docs/SPRINT_J5.md` or `docs/SPRINT_J4_DONE.md`.

**Checkpoint**:
- Documentation reflects current state of deployed contracts.
- Handoff notes for Sprint J5 (backend refactor) included at end of this sprint's README update.

**Commit**: `docs: finalize V2 contract documentation and security report`

**Final step**: Open a PR from `feat/contracts-v2` to `main`. Self-review. Merge. Tag the commit `v2.0.0-contracts-sepolia`.

---

## Post-Sprint

**Handoff to Sprint J5 (backend refactor)**:
- New contract addresses stored in `.env.example`.
- Contract ABIs exported from `packages/contracts/artifacts/` for backend consumption.
- Backend models need new fields: `Order.items[]`, `Order.shipment_groups[]`, `Seller.stake_tier`, etc.
- `/api/v1/orders/*` endpoints need refactor — new payloads.
- Web3 integration: update `services/celo.py` to point to new addresses.

**Risks identified during J4 to track**:
- Any TODOs left in code must be tracked as issues.
- Any invariant that required manual tuning of fuzzer bounds should be noted.
- CeloScan verification sometimes fails silently on first attempt — retry with explicit compiler version.

**Metrics to report at sprint close**:
- Total LOC added/removed.
- Total test count and coverage percentage.
- Gas usage of key functions (`createOrder`, `fundOrder`, `createShipmentGroup`, `triggerAutoRefundIfInactive`).
- Deployment cost in CELO.
