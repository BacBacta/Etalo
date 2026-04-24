# Etalo Security Report — V2 Contracts

## Non-custodial claim (ADR-022)

The Etalo V2 escrow is positioned as **non-custodial** under the
Zenland / Circle Refund Protocol / OpenSea standard. The claim rests
on four publicly verifiable criteria:

1. Funds live in public smart contracts on Celo.
2. Source code is verified on CeloScan (Sepolia addresses listed
   below; mainnet deferred post-audit per ADR-025).
3. Admin power is structurally bounded by code — every admin
   function is scoped by code. `forceRefund` requires three
   codified conditions (ADR-023). `emergencyPause` has a 7-day
   auto-expiry and a 30-day cooldown (ADR-026). All mutating
   settings emit events.
4. Disputes resolve through a permissionless 3-level chain
   (N1 48h → N2 7d → N3 14d community vote) that always terminates
   in code-enforced resolution.

## Architectural limits (ADR-026)

Hardcoded constants in `EtaloEscrow`:

| Constant | Value |
|---|---|
| `MAX_TVL_USDT` | 50,000 USDT |
| `MAX_ORDER_USDT` | 500 USDT |
| `MAX_SELLER_WEEKLY_VOLUME` | 5,000 USDT |
| `EMERGENCY_PAUSE_MAX` | 7 days |
| `EMERGENCY_PAUSE_COOLDOWN` | 30 days |
| `MAX_ITEMS_PER_GROUP` | 20 |
| `MAX_ITEMS_PER_ORDER` | 50 |

Worst-case protocol exposure is capped at 50,000 USDT. Not
admin-adjustable in V1 — raising a cap requires a V2.1 redeploy
with explicit user communication.

## `forceRefund` conditions (ADR-023)

`EtaloEscrow.forceRefund(orderId, reasonHash)` is `onlyOwner` **AND**
requires all three of:

1. `disputeContract == address(0)` (dispute contract decommissioned)
2. `block.timestamp > order.fundedAt + 90 days` (prolonged inactivity)
3. `legalHoldRegistry[orderId] != bytes32(0)` (legal hold registered)

## N3 refund semantics (ADR-029)

Community-vote (N3) buyerWon refunds `itemPrice - releasedAmount`,
not full itemPrice. Already-released portions stay with the seller
because ADR-018 earmarks them as compensation for shipping
milestones actually performed.

## Auto-refund blocked on open dispute (ADR-031)

`triggerAutoRefundIfInactive` reverts if any item is currently
`Disputed`. Prevents a cross-contract deadlock where the dispute
record becomes orphan and the seller's stake freezeCount stays up
indefinitely. Buyer recovery path in that case is the
N1 → N2 → N3 escalation chain (~23 days total to resolution).

## Dispute reputation authority (ADR-030)

`EtaloDispute._applyResolution` is the sole authority for dispute-
related reputation events. `EtaloEscrow.resolveItemDispute` does NOT
call `reputation.recordDispute` — doing so would double-count
`disputesLost` on every resolution.

## Stake auto-downgrade (ADR-028)

If `slashStake` reduces a seller's stake below the current tier
threshold, tier auto-downgrades to the highest tier the remaining
stake still supports (possibly `None`). Companion `topUpStake`
restores coverage. Sub-TIER_1 residuals drainable via
`initiateWithdrawal(None)` with the standard 14-day cooldown.

## CEI enforced across all fund-moving functions (ADR-032)

Every fund-moving function in `EtaloStake` and `EtaloEscrow`
follows strict Checks-Effects-Interactions ordering:

1. **Checks** — `require`/eligibility first
2. **Effects** — state writes and event emissions before any external call
3. **Interactions** — USDT transfers, Reputation hooks, Stake hooks at the end

`ReentrancyGuard` stays on every public entry as defense-in-depth.
`EtaloEscrow._computeNewOrderStatus` is a pure view helper that
computes the order-status transition without writing state, so the
stake `decrementActiveSales` call can live in the Interactions
section of each caller.

## Deployed addresses (Celo Sepolia)

**Deployment date**: 2026-04-24
**Chain ID**: 11142220
**Deploy commit**: TBD (see `git log` for `deploy(contracts): V2 on Celo Sepolia with triple-explorer verification`)
**Full artifact**: `packages/contracts/deployments/celo-sepolia-v2.json` (tx hashes, block numbers, constructor args, setter events, mint receipt)

### Core contracts

| Contract | Address |
|---|---|
| `MockUSDT` (test-only) | `0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3` |
| `EtaloReputation` | `0x2a6639074d0897c6280f55b252B97dd1c39820b7` |
| `EtaloStake` | `0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417` |
| `EtaloVoting` | `0x335Ac0998667F76FE265BC28e6989dc535A901E7` |
| `EtaloDispute` | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` |
| `EtaloEscrow` | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` |

### Treasury wallets (three-wallet separation per ADR-024)

| Role | Address |
|---|---|
| `commissionTreasury` | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| `creditsTreasury` | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| `communityFund` | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

### Contract verification

Each contract is verified on three independent explorers: Etherscan
(via the V2 multichain API surfaced at CeloScan), Blockscout Celo
Sepolia, and Sourcify. Any one of them is sufficient to reconstruct
the source; all three agreeing gives defense-in-depth against a
single-explorer outage or delisting.

| Contract | CeloScan | Blockscout | Sourcify |
|---|---|---|---|
| `MockUSDT` | [source](https://sepolia.celoscan.io/address/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3#code) | [source](https://celo-sepolia.blockscout.com/address/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3) |
| `EtaloReputation` | [source](https://sepolia.celoscan.io/address/0x2a6639074d0897c6280f55b252B97dd1c39820b7#code) | [source](https://celo-sepolia.blockscout.com/address/0x2a6639074d0897c6280f55b252B97dd1c39820b7#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0x2a6639074d0897c6280f55b252B97dd1c39820b7) |
| `EtaloStake` | [source](https://sepolia.celoscan.io/address/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417#code) | [source](https://celo-sepolia.blockscout.com/address/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417) |
| `EtaloVoting` | [source](https://sepolia.celoscan.io/address/0x335Ac0998667F76FE265BC28e6989dc535A901E7#code) | [source](https://celo-sepolia.blockscout.com/address/0x335Ac0998667F76FE265BC28e6989dc535A901E7#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0x335Ac0998667F76FE265BC28e6989dc535A901E7) |
| `EtaloDispute` | [source](https://sepolia.celoscan.io/address/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE#code) | [source](https://celo-sepolia.blockscout.com/address/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE) |
| `EtaloEscrow` | [source](https://sepolia.celoscan.io/address/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb#code) | [source](https://celo-sepolia.blockscout.com/address/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb#code) | [source](https://sourcify.dev/server/repo-ui/11142220/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb) |

### Deployment notes

- 6 deploys + 17 inter-contract setters + 1 mint = 24 transactions,
  total cost ~0.66 CELO on Sepolia.
- A fresh `MockUSDT` was deployed at V2 (rather than reusing the V1
  `MockUSDT` at `0x4212...12dc6`) to isolate the V2 environment from
  accumulated V1 test balances and allowances.
- Setter #7 (`Voting.setDisputeContract`) was submitted during the
  initial deploy run and recovered as a ghost-tx: the drpc.org RPC
  returned a 500 (trace-id `f6c1f8d2f5a1750c8000e8437e93069a`)
  before the tx hash was echoed, but the tx had already reached the
  mempool and was mined. On-chain read of `voting.disputeContract()`
  after the crash returned the expected `EtaloDispute` address. The
  resume workflow (`scripts/check-resume-state.ts` for nonce + state
  check, then `scripts/resume-wiring.ts` with defensive pre-reads on
  each setter) identified the ghost-tx and executed the remaining 10
  setters without duplicating #7. See `deployments/celo-sepolia-v2.json`
  `setters[6]` for the recorded note (`txHash: null`,
  `verifiedOnChain: true`).
- **Item status after partial dispute resolution (scenario 4 finding)**:
  `resolveItemDispute` sets `item.status = Refunded` **only** when
  `refundAmount == item.itemPrice` (gross). A refund equal to
  `remainingInEscrow` (what is actually left after prior partial
  releases) leaves `item.status = Released` with `releasedAmount`
  capturing the net portion already sent to the seller. Observed on
  scenario 4: refund = 64.432 USDT on an 80 USDT item where 15.568
  USDT was already released at shipping produced
  `item.status = Released (4)`, not `Refunded (6)`. The `Refunded`
  terminal is reserved for cases where the item never shipped
  (refund = full itemPrice). Behaviour as coded — no design change
  required. Documented here for audit clarity.
- **Post-slash orphan stake (ADR-033)**: scenario 4 slashed 5 USDT
  from a Tier.Starter seller holding 10 USDT, triggering the expected
  auto-downgrade to Tier.None with a 5 USDT residual. The recovery
  path specified in ADR-028 point 2 (`topUpStake` to restore coverage)
  is blocked at the implementation level because `topUpStake`
  requires `tier != None`. See ADR-033 for the full gap analysis and
  the V1.5 fix plan. Scenario 5 was re-routed to use `AISSA` as
  seller (freshly staked) instead of attempting to recover the
  slashed seller. The `CHIOMA` test wallet remains on-chain at
  Celo Sepolia with `(stake = 5 USDT, tier = None)` as a preserved
  regression fixture for the V1.5 patch acceptance check.
- **Cleanup operation for order 7**: an earlier crashed run of
  scenario 3 left order 7 in `PartiallyDelivered` state with items
  9 and 11 un-confirmed (48.324 USDT locked in escrow;
  `CHIOMA.activeSales` stuck at 1). A follow-up cleanup script
  called `confirmItemDelivery` on each un-confirmed item to drain
  the residual, transitioning order 7 to `Completed` and
  decrementing `activeSales` to 0. Operational hygiene, not part of
  the smoke-test scenarios. Detailed in
  `scripts/smoke/cleanup-order7-result.json`.

## Testnet smoke tests (Celo Sepolia)

**Test date**: 2026-04-24
**Test wallets**: 4 dedicated EOAs (`chioma`, `aissa`, `mamadou`,
`mediator1`) — private keys in `.env` (gitignored). Public addresses
recorded in `packages/contracts/deployments/celo-sepolia-smoke-setup.json`.

### Methodology

Five end-to-end scenarios were executed on the production V2
contracts on Celo Sepolia. Each scenario ran the full flow as a
single `viem` script, captured before/after/intermediate balance
snapshots (USDT for the participants + escrow + stake + commission
treasury), asserted on-chain state (order status, item statuses,
stake tier/amount/activeSales/freezeCount, reputation deltas),
verified all expected events were emitted across the transaction
set, and saved a per-scenario result artifact.

Scenario 6 (emergency pause cycle) was **not executed on testnet** —
validated via Hardhat unit tests in `test/EtaloEscrow.test.ts` Stage
4 (pause blocks `createOrder`, auto-expire after 7 days via
`evm_increaseTime`, 30-day cooldown between pauses). Real-network
execution is infeasible because ADR-026 forbids manual unpause and
the 7-day auto-expiry cannot be accelerated on public Sepolia.

Each scenario's representative tx hash in the table below
corresponds to the concluding transaction (final confirmation or
resolution). Full tx hash chains per scenario are preserved in the
respective JSON artifact under `packages/contracts/scripts/smoke/`.

### Scenarios executed

| # | Scenario | Representative tx hash | Validates |
|---|----------|------------------------|-----------|
| 1 | Intra-Africa 2-item happy path | `0x15cc6039840ce5fd32760f65442ba31363c392f3453c99db17b08f8806beb06c` (confirmGroupDelivery) | Phases 1/2/3/5 + 1.8% intra commission + reputation |
| 2 | Cross-border 20% + buyer confirm | `0xc6b52bd3034279fe6b3f2142e0aec9d75cc83b6d35f23607c90826b94b093c0a` (confirmItemDelivery) | Phases 1 (stake gate), 3 (20% ship), 4 (arrival), 5, 8, 12 |
| 3 | Sibling isolation + N1 amicable | `0xf8ef298e23527b4c4376a6ccd28ca593c802648a7d2d1fd03403f92e50215f7f` (confirmItemDelivery #3) | Phases 5 (sibling isolation ADR-015), 6 (N1 bilateral match), 12 |
| 4 | Fraud → N2 mediation slash | `0x92a17be6c3e9bc88f3908d1cccddb3858505749e48d1b64be78388bc44ec32d6` (resolveN2Mediation) | Phases 6 (N2 with slash), 8 (auto-downgrade ADR-028), 12 — led to ADR-033 discovery |
| 5 | Multi shipment groups | `0x77f618e2cbfbf607c3bf1cca5be25c1b3ba587fa6b15636f46c12e8cd0a1e858` (confirmGroupDelivery group2) | Phase 3 (multi-groups per order), Phase 5 (status transitions PartiallyShipped → AllShipped → PartiallyDelivered → Completed) |
| 6 | Emergency pause cycle | *not executed on testnet* | Hardhat unit tests `test/EtaloEscrow.test.ts` Stage 4 tests 36-38 |

### Supporting operations (non-scenario)

Two additional on-chain operations ran during smoke testing:

- **Cleanup order 7** — post-scenario-3 hygiene. A mid-run drpc 500 on
  the first attempt left items 9, 11 un-confirmed in order 7 (48.324
  USDT trapped in escrow, `CHIOMA.activeSales = 1`). A follow-up
  script called `confirmItemDelivery` twice to transition order 7 to
  `Completed` and drain the residual. Detailed in
  `packages/contracts/scripts/smoke/cleanup-order7-result.json`.
- **AISSA stake deposit** — scenario 5 pre-setup. `AISSA` was
  designated seller for scenario 5 instead of `CHIOMA` (see
  ADR-033). `depositStake(Starter)` with 10 USDT.

Full tx hashes, block numbers, balance deltas, events, and
assertion outcomes for every scenario are in
`packages/contracts/scripts/smoke/scenarioN-result.json` (N = 1..5).

## Static analysis report

**Run date**: 2026-04-24

**Tool versions**:

- **Slither** 0.11.5 (config: `slither.config.json`)
- **forge coverage** 1.5.1-stable
- **Aderyn**: deferred to Phase 3 of the audit strategy (ADR-025)
  because Cargo/Rust is unavailable in the Sprint J4 development
  environment. Will be re-run by the Phase 3 audit competition or
  audit firm.

### Coverage — Foundry-measured (`forge coverage --report summary`)

Measured via the Block 9 invariant suite (256 runs × 50 depth =
12,800 bounded actions per invariant × 7 invariants ≈ 89,600 actions).

| File | % Lines | % Statements | % Branches | % Funcs |
|---|---|---|---|---|
| `contracts/EtaloEscrow.sol` | 81.56% (292/358) | 83.01% (298/359) | 48.66% (91/187) | 78.05% (32/41) |
| `contracts/EtaloReputation.sol` | 63.01% (46/73) | 68.06% (49/72) | 35.00% (7/20) | 70.00% (7/10) |
| `contracts/EtaloStake.sol` | 44.17% (72/163) | 38.99% (62/159) | 18.09% (17/94) | 62.07% (18/29) |
| `contracts/EtaloDispute.sol` | 46.05% (70/152) | 43.51% (67/154) | 21.33% (16/75) | 47.62% (10/21) |
| `contracts/EtaloVoting.sol` | 4.44% (2/45) | 2.44% (1/41) | 0.00% (0/25) | 12.50% (1/8) |

### Coverage — Hardhat-observed (test suite 144 tests)

The 144 Hardhat tests (14 Reputation + 34 Stake + 13 Voting + 16
Dispute + 50 Escrow + 16 integration + 1 size-guard) cover paths
explicitly tested in TypeScript — for example: `forceRefund` with
all three ADR-023 condition permutations, `emergencyPause` cooldown
edge cases, N2 mediator assignment + resolution, N3 vote escalation
with partial release (ADR-029 regression guard),
`triggerAutoRefundIfInactive` blocked on open dispute (ADR-031
regression guard), `EtaloDispute` sole-authority reputation
recording (ADR-030 regression guard), sibling-item isolation with
explicit treasury balance assertions. These explicit paths are not
reflected in the Foundry coverage summary above because forge
coverage only measures Solidity tests.

**The Foundry percentages are therefore a lower bound of the real
coverage.** In particular:

- `EtaloVoting` low Foundry coverage (4.44%) is expected: the
  invariant handler does not drive the voting contract directly
  (only Dispute does, via `escalateToVoting`). 13 Hardhat unit
  tests cover the Voting lifecycle (createVote, submitVote,
  finalizeVote, callback) end-to-end.
- `EtaloStake` 44% Foundry coverage is expected: tier 2 and tier 3
  deposits, eligibility checks, withdrawal cooldown / pause / resume
  paths, slash auto-downgrade paths, orphan drain are all covered
  by the 34 dedicated Hardhat unit tests.
- `EtaloDispute` 46% similarly: N2 mediator assign + resolve, N3
  escalation + voting, resolveFromVote callback are covered by the
  16 Dispute unit tests and 2 integration scenarios.

### Slither findings

Run command: `slither . --config-file slither.config.json` with
`forge` in `PATH` (Foundry auto-detection).

**High**: 0
**Medium**: 0
**Low**: 3 — documented below
**Informational**: 49 — documented below

#### Medium findings (originally 5, all fixed in Block 10)

All five Slither `reentrancy-no-eth` Medium findings were fixed
during Block 10 by enforcing strict CEI (ADR-032) across the
fund-moving functions in `EtaloStake` and `EtaloEscrow`. See
ADR-032 for rationale and scope.

#### Remaining Low findings

| Detector | Location | Justification |
|---|---|---|
| `reentrancy-events` | `EtaloStake.slashStake` (line 281) | Event `StakeSlashed` fires after the USDT transfer. `ReentrancyGuard` blocks reentry at the caller; event emission can't be exploited to forge state. Acceptable. |
| `reentrancy-benign` | `EtaloEscrow` various (helper paths) | Slither flags a benign pattern — state read/written after a non-critical external call. No fund-moving consequence. Acceptable with `nonReentrant` guards at public entries. |
| `calls-loop` | `EtaloEscrow.forceRefund`, `confirmGroupDelivery`, `triggerAutoRefundIfInactive` (loops with external calls) | All loops bounded by `MAX_ITEMS_PER_GROUP=20` and `MAX_ITEMS_PER_ORDER=50` from ADR-026. Gas cost of the longest possible loop is computable and bounded. Acceptable. |

#### Informational findings

| Detector | Count | Justification |
|---|---|---|
| `timestamp` | ~30 instances | All deadlines (`fundedAt + 14d`, `majorityReleaseAt`, `finalReleaseAfter`, stake cooldowns, pause auto-expire) use `block.timestamp`. The ~15-second manipulation window available to miners is negligible compared to our 48-hour to 90-day deadlines. Industry-standard usage. |
| `costly-loop` | 2 instances | `EtaloEscrow.createOrderWithItems` (`++_nextItemId` inside the item-creation loop) and `EtaloEscrow._releaseItemFully` (called inside `confirmGroupDelivery`'s item loop). Both bounded by ADR-026 caps. Removing the monotonic counter would complicate addressing. Acceptable. |
| `naming-convention` | 9 instances | `_addr` parameter naming on setters (`setReputationContract`, `setDisputeContract`, etc. in `EtaloStake`, `EtaloDispute`, `EtaloVoting`). Pure cosmetic — does not conform to mixedCase. Left for a future style-only pass. |
| `unused-state` | 1 instance | `EtaloDispute.LEVEL_NONE = 0` documents that a dispute in "level 0" state means "not initialized". Retained for readability; the enum-like constant block would be less self-describing without it. |

### Detectors excluded and rationale

The run uses the default Slither detector set with **no detectors
silenced by config**. Every finding above is either fixed or
documented inline with its justification, per the Block 10
checkpoint requirement.

For auditability if future CI ever silences specific detectors, the
following rationale shall accompany each exclusion:

- `reentrancy-events` — excluded-if-silenced because all fund-moving
  functions sit behind `ReentrancyGuard` and follow strict CEI per
  ADR-032. Events emitted in the Effects phase are read-only against
  state.
- `timestamp` — excluded-if-silenced because `block.timestamp`
  manipulation is bounded (~15s) and negligible against protocol
  deadlines ranging from 48 hours to 90 days.
- `naming-convention` — excluded-if-silenced because `_addr`
  parameter naming is a stylistic choice that does not affect
  security.

## Bug bounty (ADR-025 Phase 4)

Placeholder — Immunefi listing scheduled for post-mainnet
(target Q2 2027). Tiered rewards $500 – $10,000 per valid bug.

## Audit strategy reference

See `docs/DECISIONS.md` ADR-025 for the phased audit plan:

- **Phase 1** (April–December 2026, budget $0) — free tools
  (Slither, Aderyn eventually, Mythril if needed, Foundry
  invariants). Current phase. Delivered in Block 9 (Foundry
  invariants) and Block 10 (Slither + coverage).
- **Phase 2** (September 2026) — apply for Celo Foundation audit
  grant.
- **Phase 3** (Q4 2026 – Q1 2027) — audit competition or audit firm.
- **Phase 4** (post-mainnet) — permanent Immunefi bug bounty.
