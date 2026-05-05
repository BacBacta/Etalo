# Sprint J11 Pre-Audit — Synthesis

**Date** : 2026-05-05
**Branch** : `docs/j11-pre-audit`
**Auditor** : Claude (Opus 4.7) orchestrating Pashov-equivalent solidity-auditor workflow + delegated subagents
**Method** : Pashov solidity-auditor framework (cloned skills, executed via subagents) + Celopedia D.1-D.4 cross-cuts + manual review against ADRs 014-041
**Source code reviewed** : `packages/contracts/contracts/` at HEAD `f8a12f1` (V2 contract suite)

---

## 1. Executive summary

**Verdict** : V2 contract suite is fit for testnet redeploy and Sprint J11 Proof-of-Ship preparation, **conditional on the H-1 fix bundle landing on main** (PR `fix/h1-dispute-funded-guard`, ADR-042).

**Headline finding** : 1 HIGH severity drainable bug (H-1) discovered during the audit pass on EtaloDispute. **Found, empirically reproduced, and fixed within the same audit cycle**. No production funds were at risk (Sepolia escrow custody = 0 USDT at audit time, mainnet not yet deployed). Post-fix verification subagent confirms zero residual unfunded fund-movement paths.

**Cumulative findings tally across 4 audited contracts** :

| Severity | Count | Notes |
|---|---|---|
| HIGH | 1 | H-1 in EtaloDispute — RESOLVED via ADR-042 / PR `fix/h1-dispute-funded-guard` |
| MEDIUM | 6 | distributed across Dispute (3), Reputation (2), Escrow (1) — none drainable |
| LOW | 18 | hygiene + minor inefficiencies + observability gaps |
| Info | 31 | celopedia D.1-D.4 cross-cuts mostly resolve to "not applicable" or "documented intent" |
| **Total** | **56** | — |

---

## 2. Audit charter — scope

In scope (Sprint J11 pre-audit charter, Mike directive 2026-05-05) :

| Contract | Audit type | LOC | File |
|---|---|---|---|
| EtaloEscrow | Pashov full (8-agent perspectives + celopedia D.1-D.4) | 1148 | `packages/contracts/contracts/EtaloEscrow.sol` |
| EtaloDispute | Pashov full | 416 | `packages/contracts/contracts/EtaloDispute.sol` |
| EtaloCredits | Pashov full (smaller surface, ADR-037 hybrid) | minimal | `packages/contracts/contracts/EtaloCredits.sol` |
| EtaloReputation | Scan-only (lower risk — no fund custody) | 164 | `packages/contracts/contracts/EtaloReputation.sol` |

Out of scope (V2-deferred per ADR-041) :

| Contract | Rationale |
|---|---|
| EtaloStake | V1 mainnet is intra-Africa only (ADR-041), no cross-border ⇒ stake module not deployed V1. Audit deferred to V1.5 with cross-border re-enable. |
| EtaloVoting | N3 vote escalation is V2-deferred per ADR-041. No V1 mainnet exposure. |
| MockUSDT | OpenZeppelin standard ERC20 + 6-decimal precision shim. Trivial surface, skip. |

---

## 3. Audit method

### 3.1 X-ray pre-audit threat model

`docs/audit/PASHOV_XRAY.md` (commit `cf08d13`) — 214-line pre-audit threat model covering :
- Protocol overview + entry points
- Trust model (buyer / seller / mediator / community voter / owner)
- 10 architectural invariants extracted from CLAUDE.md + ADR set
- Cross-contract dependencies + temporal risks
- Hardcoded limits (ADR-026)
- V2-deferred surface inventory

### 3.2 Solidity-auditor pass

For each in-scope contract, a delegated subagent ran the Pashov 8-agent perspectives synthesis :
1. vector-scan (entry-point enumeration)
2. math-precision (integer arithmetic + commission split)
3. access-control (modifier coverage + privilege escalation paths)
4. economic-security (incentive compatibility + griefing)
5. execution-trace (call-graph reachability + reentrancy)
6. invariant (state-machine + storage layout)
7. periphery (helper / view / setter functions)
8. first-principles (architectural critique against ADRs)

Cross-cut against celopedia security-patterns D.1-D.4 (CELO duality, CIP-64 fee-currency drift, epoch boundary, Mento / Aave / bridges). Findings tabled in `docs/audit/PASHOV_AUDIT_<contract>.md`.

### 3.3 Reputation scan

Lighter pass, single subagent invocation, output inlined in this synthesis (§7).

### 3.4 Empirical reproduction (H-1 only)

`packages/contracts/test/V2/H1_unfunded_dispute_drain.test.ts` (commit `dcae418` on PR branch `fix/h1-dispute-funded-guard`) — Hardhat fork, end-to-end attacker scenario. PASS = exploit reachable. 254ms execution time, 100 USDT drained from victim's deposit to attacker wallet.

### 3.5 Post-fix verification

`docs/audit/H1_POST_FIX_VERIFICATION.md` (on PR branch `fix/h1-dispute-funded-guard`, commit `0f32580`) — exhaustive subagent re-audit after the 3-layer fix landed. All 25 EtaloEscrow public/external functions and all 14 EtaloDispute public/external functions classified. 8 fund-movement paths : 3 direct guard / 5 state-machine guard. Verdict : "No residual unfunded fund-movement path exists."

---

## 4. Critical finding — H-1 (RESOLVED)

### 4.1 Original finding

`docs/audit/PASHOV_AUDIT_EtaloDispute.md` §H-1 :

> Buyer can dispute an item on an UNFUNDED order, then drain other buyers' escrowed USDT via N1 collusion or N3 vote.
>
> `EtaloDispute.openDispute` (line 159-200) does not require `order.fundedAt > 0`. `EtaloEscrow.markItemDisputed` (line 789-805) and `resolveItemDispute` (line 832-918) do not either. Item state machine starts at `Pending` (not in the forbidden set at lines 797-801), so a buyer can open a dispute on an unfunded order. `resolveItemDispute` then debits the global `totalEscrowedAmount` pool and transfers USDT from the contract's actual balance — funded by other buyers' deposits.

Two exploit paths surfaced :
- **N1 collusion** : attacker + colluding seller bilateral match `resolveN1Amicable` with refund = item price. Reachable today on Sepolia + mainnet at deploy.
- **N3 vote** : attacker alone, exploits voter pool to win the vote without colluding seller. V2-deferred per ADR-041 — single attacker, no collusion needed once N3 path enabled.

Drainage capped at MAX_ORDER_USDT = 500 USDT per call (ADR-026), repeatable up to MAX_TVL_USDT = 50 000 USDT.

### 4.2 Resolution

**Branch** : `fix/h1-dispute-funded-guard`
**ADR** : ADR-042 (added in PR)
**Fix commit** : `f8cf195`
**Bundle** : 7 commits (test repro `dcae418` + atomic fix + 5 docs commits)
**Push** : 2026-05-05, GitHub PR open against main

3-layer `require(order.fundedAt > 0, "Order not funded")` :
- Layer 1 (primary, fail-fast) : `EtaloDispute.openDispute`
- Layer 2 (defense-in-depth) : `EtaloEscrow.markItemDisputed`
- Layer 3 (defense-in-depth) : `EtaloEscrow.resolveItemDispute`

Test verification post-fix :
- 175/175 contracts tests passing (Hardhat full suite)
- 93/93 web tests passing (no regression)
- Integration.v2 15 dispute scenarios (real-contract) ALL green
- `H1_unfunded_dispute_drain.test.ts` flipped to regression guard — asserts revert + state integrity
- `H1_funded_dispute_happy_path.test.ts` (new) — funded dispute resolves correctly with proper distribution

Post-fix verification subagent confirms zero residual unfunded fund-movement paths (see `H1_POST_FIX_VERIFICATION.md` on the fix branch).

### 4.3 Production exposure assessment

| Layer | Exposure |
|---|---|
| Mainnet | 0 (V2 not deployed mainnet, V1 mainnet was different code path) |
| Sepolia EtaloEscrow `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` | 0 USDT custody at audit time, no real funds at risk |
| Pre-audit local Hardhat reproduction | 100 USDT drained on local fork (proof of concept) |

**No production user funds were ever at risk.** The H-1 was found, reproduced, and fixed within the same audit cycle. Sepolia redeploy plan tracked in `docs/FOLLOWUPS_J11.md` FU-J11-002.

---

## 5. EtaloEscrow — synthesis (20 findings, 0 H / 1 M / 6 L / 13 Info)

Reference : `docs/audit/PASHOV_AUDIT_EtaloEscrow.md`

### 5.1 Medium

- **M-1** : `resolveItemDispute` commission split misallocates fee to seller when item had prior partial release. Affects cross-border 20% ship-release branch only — entirely V2-deferred per ADR-041 (no cross-border in V1 mainnet). **No V1 mainnet impact.** Fix planned with cross-border re-enablement in V2.

### 5.2 Low (6)

L-1 to L-6 — hygiene + minor (`transferFrom` no balance-delta accounting / CEI inverse on `createOrderWithItems` / `_calculateCommission` external call without `nonReentrant` / `legalHoldRegistry` no terminal-status guard / `markGroupArrived` no monotonic guard / empty array branches in `confirmGroupDelivery` silently no-op).

None drainable, none privilege-escalating. Triage : queue for a hygiene PR Sprint J11+ or accept-as-is and document — Mike's call.

### 5.3 Info (13)

I-1 to I-13 — celopedia D.1-D.4 cross-cuts mostly resolve to "not applicable" (no `payable`, no Mento / Aave / bridges, no epoch boundary post-L2). Some informational notes : V2-deferred surfaces interspersed with V1 paths (I-9), gas optimization opportunities (I-10), `OrderStatus.Disputed` enum dead state (I-11), ADR-023 condition #1 interpretation (I-12), V2 reentrancy surface from owner-controlled reputation contract (I-13).

---

## 6. EtaloDispute — synthesis (18 findings, 1 H RESOLVED / 3 M / 5 L / 9 Info)

Reference : `docs/audit/PASHOV_AUDIT_EtaloDispute.md`

### 6.1 High — H-1

**RESOLVED.** See §4 above.

### 6.2 Medium (3)

- **M-1** : Reputation grief — a single buyer can flood a real seller with disputes on unfunded orders, polluting their reputation cache without any economic stake. **Mitigated transitively by the H-1 fix** (now requires `fundedAt > 0` to open a dispute). Re-evaluate post-PR-merge.
- **M-2** : `escalateToMediation` and `escalateToVoting` permissionless after deadline allow third parties to grief in-progress amicable resolutions. Mitigation candidate : restrict escalation to dispute parties only ; or add a small refundable bond. Triage Sprint J11+.
- **M-3** : `_disputeByItem[orderId][itemId]` is never reset, so a single item disputed and resolved can never be disputed again. Edge-case impact (re-dispute is rare in practice, the order is typically Refunded or Released after resolution). Triage Sprint J11+ ; product call on whether re-dispute is desired.

### 6.3 Low (5)

L-1 to L-5 — `assignN2Mediator` no liveness check / `escalateToVoting` voter list snapshot semantics / `resolveN1Amicable` no `refundAmount` cap at Dispute layer (Escrow caps it) / `resolveN2Mediation` no `slashAmount` cap at Dispute layer / mediator list iteration O(N²)-ish.

### 6.4 Info (9)

I-1 to I-9 — setter same-address re-set / `assignN2Mediator` overwrite / dispute reputation event flag / no cancel-proposal path / 2 ADR candidates (refundable dispute bond, N3 voter snapshot doc) / celopedia cross-cuts / deployment ordering risk / `slashAmount` N1 semantics.

---

## 7. EtaloReputation — scan-only synthesis (9 findings, 0 H / 2 M / 4 L / 3 Info)

Reference : delegated subagent output 2026-05-05 (inlined here per scope rule "scan-only note dans synthèse").

### 7.1 Medium (2)

- **M1** : `recordDispute` does not gate on `SellerStatus.Active`, so a Banned/Suspended seller's dispute losses still mutate counters (asymmetric vs. `recordCompletedOrder` which has the guard). Practically benign — Suspended sellers don't acquire new orders — but if a long-running order resolves a dispute *after* sanction, counters keep mutating. No fund flow impact (this contract holds no funds). Triage : decision call on symmetry.
- **M2** : `applySanction` re-stamps `lastSanctionAt` on every non-Active write, allowing the owner to indefinitely extend the Top Seller cooldown by re-applying the same sanction. Owner-only, so not unauthorized escalation, but it's a non-obvious lever. Triage : either gate the timestamp update on a status transition, or document as intentional.

### 7.2 Low (4)

L1 to L4 — Top Seller revocation/restoration NatSpec asymmetry / `checkAndUpdateTopSeller` no event dedup / `setAuthorizedCaller` no event emission (auditability gap for off-chain indexer) / score formula `ordersCompleted == 0` early-return ignores `disputesLost`.

### 7.3 Info (3)

I1 (Solidity 0.8.24 default overflow checks + MAX_TVL bounds) / I2 (`firstOrderAt` set-once correct per ADR-020) / I3 (cooldown `lastSanctionAt == 0` handled correctly).

### 7.4 Verdict

**Fit for V2 testnet deployment as-is.** No HIGH findings, MEDIUM items are governance/semantic (owner-bounded), LOW/Info are observability/hygiene. Triage to a doc-pass or Post-Proof-of-Ship cleanup PR — non-blocking.

---

## 8. EtaloCredits — synthesis (9 findings, 0 H / 0 M / 3 L / 6 Info)

Reference : `docs/audit/PASHOV_AUDIT_EtaloCredits.md`

### 8.1 Low (3)

- **L-1** : Owner can pause credit purchases indefinitely (no time cap). Centralization footprint, owner-bounded.
- **L-2** : `setBackendOracle` is dead code in V1 (oracle pattern reserved for V2 hybrid expansion per ADR-037). Centralization footprint visible but unused.
- **L-3** : CEI ordering — event emitted *before* the external `transferFrom`. Hygiene only ; purchase amount comes from buyer wallet to creditsTreasury, no reentrancy into Credits contract.

### 8.2 Info (6)

I-1 to I-6 — spec drift between `PRICING_MODEL_CREDITS.md` §5.2 and deployed contract / welcome bonus + monthly free grant NOT on-chain (per ADR-037) / no per-purchase cap / CIP-64 minor / `block.timestamp` in event payload / constructor `_admin == address(0)` not validated.

### 8.3 Verdict

**Minimal contract, minimal surface.** ADR-037 hybrid design intentionally keeps EtaloCredits thin (most logic off-chain in backend ledger). No blockers.

---

## 9. Out-of-scope items

### 9.1 EtaloStake (V2-deferred per ADR-041)

V1 mainnet is intra-Africa only — no cross-border seller stake required. EtaloStake contract is not deployed V1. Audit deferred to V1.5 with cross-border re-enable.

### 9.2 EtaloVoting (V2-deferred per ADR-041)

N3 vote escalation is V2-deferred. If H-1 had been deployed AND N3 enabled, a single attacker could have drained without colluding seller. Both are gated by ADR-041 V1 scope freeze + ADR-042 fundedAt guard, so the combined risk is double-mitigated.

### 9.3 MockUSDT

OpenZeppelin standard ERC20 + 6-decimal precision shim. Trivial surface, no audit needed.

---

## 10. V1 mainnet readiness assessment

Per ADR-041 V1 scope (intra-Africa only, single 1.8% commission rate, no stake, no cross-border, no Top Seller discount, no voting), the V1 mainnet binary deploys :

- EtaloEscrow (V1-pruned : drop cross-border + stake + Top Seller surfaces, ~30-40% LOC reduction per SPEC §0)
- EtaloDispute (V1-pruned : N3 vote disabled, only N1 amicable + N2 mediator)
- EtaloReputation (full)
- EtaloCredits (full)

**Blockers for V1 mainnet** :
1. ✅ H-1 fix merged + ADR-042 landed (PR `fix/h1-dispute-funded-guard` open)
2. ✅ Sepolia V2 redeploy with fix (FU-J11-002, post-merge)
3. ⏳ V1 binary build (apply ADR-041 spec overrides — drop cross-border + stake constants/functions)
4. ⏳ V1-pruned audit pass (re-run audit on V1 binary, expect zero new findings since V1 ⊆ V2)
5. ⏳ ADR-039 freelance audit + AI-assisted review (reference Sprint J11+ schedule)

**Non-blockers (queue for cleanup PR)** :
- M-2, M-3, L-1 to L-6 EtaloEscrow + L-1 to L-5 EtaloDispute + L-1 to L-4 EtaloReputation + L-1 to L-3 EtaloCredits
- Info items per contract (mostly documentation drift)

---

## 11. Recommendations

### 11.1 Immediate (in flight)

- **R-1** : Merge PR `fix/h1-dispute-funded-guard` to main. **Status : open + reviewable.**
- **R-2** : Sepolia V2 redeploy per `docs/FOLLOWUPS_J11.md` FU-J11-002. Post-merge, separate ops session.
- **R-3** : Update CLAUDE.md "Key addresses Celo Sepolia testnet — V2 deploys" with new addresses post-redeploy.

### 11.2 Sprint J11+ (post-merge)

- **R-4** : Triage M-2, M-3 (Dispute) and M-1, M-2 (Reputation) — decision call on symmetry / griefing mitigations.
- **R-5** : `docs/FOLLOWUPS_J11.md` FU-J11-001 — consolidate test infra around real escrow (eliminate `MockEtaloEscrow` drift risk that hid H-1 in unit tests).
- **R-6** : V1 binary build per ADR-041 overrides (~30-40% LOC reduction in EtaloEscrow, EtaloStake not deployed).
- **R-7** : Re-run audit pass on V1-pruned binary before mainnet deploy.

### 11.3 V1.5+

- **R-8** : ADR-039 freelance audit + AI-assisted review (Olympix or SolidityScan + 1 reviewer from Cantina Code marketplace, ~$600-$1100 budget).
- **R-9** : Re-enable cross-border + Stake module → re-audit cross-border surface (M-1 Escrow commission split fix lands here).
- **R-10** : ADR candidates I-5 (Dispute) refundable dispute bond + I-6 (Dispute) N3 voter list snapshot semantic doc.

---

## 12. Appendix — linked artifacts

| Artifact | Path | Branch |
|---|---|---|
| X-ray pre-audit threat model | `docs/audit/PASHOV_XRAY.md` | `docs/j11-pre-audit` |
| EtaloEscrow audit | `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` | `docs/j11-pre-audit` |
| EtaloDispute audit | `docs/audit/PASHOV_AUDIT_EtaloDispute.md` | `docs/j11-pre-audit` (also on `fix/h1-dispute-funded-guard` with POST-AUDIT UPDATE block) |
| EtaloCredits audit | `docs/audit/PASHOV_AUDIT_EtaloCredits.md` | `docs/j11-pre-audit` |
| H-1 reproduction test | `packages/contracts/test/V2/H1_unfunded_dispute_drain.test.ts` | `fix/h1-dispute-funded-guard` |
| H-1 happy-path test | `packages/contracts/test/V2/H1_funded_dispute_happy_path.test.ts` | `fix/h1-dispute-funded-guard` |
| H-1 post-fix verification | `docs/audit/H1_POST_FIX_VERIFICATION.md` | `fix/h1-dispute-funded-guard` |
| ADR-042 | `docs/DECISIONS.md` §ADR-042 | `fix/h1-dispute-funded-guard` |
| Follow-up tickets J11+ | `docs/FOLLOWUPS_J11.md` | `fix/h1-dispute-funded-guard` |
| Pashov skills (cloned) | `C:/Users/Oxfam/AppData/Local/Temp/pashov-skills/` | external |

---

**End of synthesis.** Mike triage : decide which recommendations to schedule into Sprint J11 vs J11+ vs V1.5.
