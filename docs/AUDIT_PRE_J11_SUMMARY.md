# Sprint J11 Pre-Audit — Synthesis (Actionable)

**Date** : 2026-05-05 (rev 2)
**Branch** : `docs/j11-pre-audit`
**Auditor** : Claude (Opus 4.7) orchestrating Pashov-equivalent solidity-auditor workflow + delegated subagents
**Sources** :
- `docs/audit/PASHOV_XRAY.md` (V2 threat model)
- `docs/audit/PASHOV_AUDIT_EtaloEscrow.md`
- `docs/audit/PASHOV_AUDIT_EtaloDispute.md` (POST-AUDIT UPDATE block — H-1 RESOLVED)
- `docs/audit/PASHOV_AUDIT_EtaloCredits.md`
- `docs/audit/PASHOV_AUDIT_EtaloReputation.md` (scan-only, lower priority)
- `docs/audit/H1_POST_FIX_VERIFICATION.md`
- celopedia `security-patterns.md` D.1-D.4 cross-cut

**Cumulative tally** (5 contracts in scope) :

| Severity | Count | Status |
|---|---|---|
| HIGH | 1 | RESOLVED (H-1, ADR-042) |
| MEDIUM | 4 | 1 mitigated, 1 V2-deferred, 2 pending triage |
| LOW | 17 | hygiene + observability + minor inefficiencies |
| Info | 33 | celopedia cross-cuts mostly N/A or documented |
| **Total** | **55** | — |

The 6 actionable sections below are the canonical input for the ADR-039 freelance human auditor. Per-contract narrative + audit method + V1 readiness preserved as appendices.

---

## 1. Findings par sévérité (cross-source table)

| ID | Contract | Sev | Title | Source | Status | ADR / fix ref |
|---|---|---|---|---|---|---|
| **H-1** | EtaloDispute | **HIGH** | Unfunded dispute drain via N1 collusion (or N3 vote post-V2) | `PASHOV_AUDIT_EtaloDispute.md` §H-1 | **RESOLVED** | ADR-042 / commit `f8cf195` |
| M-1 | EtaloEscrow | MED | `resolveItemDispute` commission split misallocates fee to seller after partial release | `PASHOV_AUDIT_EtaloEscrow.md` §M-1 | V2-deferred | ADR-018 / ADR-041 (cross-border surface) |
| M-1 | EtaloDispute | MED | Reputation grief via unfunded order disputes | `PASHOV_AUDIT_EtaloDispute.md` §M-1 | **Mitigated transitively by ADR-042** | ADR-042 |
| M-2 | EtaloDispute | MED | Permissionless escalation after deadline allows grief on amicable resolutions | `PASHOV_AUDIT_EtaloDispute.md` §M-2 | Pending — J11+ triage | — (candidate : refundable dispute bond, see Info I-5 EtaloDispute) |
| M-3 | EtaloDispute | MED | `_disputeByItem` never reset, single-shot dispute per item | `PASHOV_AUDIT_EtaloDispute.md` §M-3 | Pending — product call J11+ | — |
| L-1 | EtaloEscrow | LOW | `transferFrom` missing balance-delta accounting (CIP-64 prep) | `PASHOV_AUDIT_EtaloEscrow.md` §L-1 | Pending | ADR-003 D.2 (recently added pattern) |
| L-2 | EtaloEscrow | LOW | `createOrderWithItems` calls external contracts before state writes (CEI inverse, no nonReentrant) | `PASHOV_AUDIT_EtaloEscrow.md` §L-2 | Pending | ADR-032 (CEI enforced V2) — gap to flag |
| L-3 | EtaloEscrow | LOW | `_calculateCommission` calls `reputation.isTopSeller` without `nonReentrant` and without try/catch | `PASHOV_AUDIT_EtaloEscrow.md` §L-3 | Pending | — |
| L-4 | EtaloEscrow | LOW | `legalHoldRegistry` writes do not gate against orders in terminal status | `PASHOV_AUDIT_EtaloEscrow.md` §L-4 | Pending | ADR-023 (forceRefund 3 conditions — orthogonal) |
| L-5 | EtaloEscrow | LOW | `markGroupArrived` accepts duplicate calls (no monotonic guard) | `PASHOV_AUDIT_EtaloEscrow.md` §L-5 | Pending | — (V2 cross-border surface, deferred) |
| L-6 | EtaloEscrow | LOW | Empty array branches in `confirmGroupDelivery` silently no-op | `PASHOV_AUDIT_EtaloEscrow.md` §L-6 | Pending | — |
| L-1 | EtaloDispute | LOW | `assignN2Mediator` does not verify mediator is still in `_mediatorsList` at call time | `PASHOV_AUDIT_EtaloDispute.md` §L-1 | Pending | — |
| L-2 | EtaloDispute | LOW | `escalateToVoting` snapshots voter list at escalation time, locks for 14d | `PASHOV_AUDIT_EtaloDispute.md` §L-2 | Pending | — (ADR candidate I-6 EtaloDispute) |
| L-3 | EtaloDispute | LOW | `resolveN1Amicable` accepts arbitrary `refundAmount` (cap is at Escrow layer) | `PASHOV_AUDIT_EtaloDispute.md` §L-3 | Pending | — |
| L-4 | EtaloDispute | LOW | `resolveN2Mediation` does not bound `slashAmount` at Dispute layer | `PASHOV_AUDIT_EtaloDispute.md` §L-4 | Pending | — |
| L-5 | EtaloDispute | LOW | Mediator list iteration in `escalateToVoting` is two-pass O(N²)-ish | `PASHOV_AUDIT_EtaloDispute.md` §L-5 | Pending | — (V3 vote V2-deferred per ADR-041) |
| L-1 | EtaloReputation | LOW | `recordDispute` lacks `Active` status guard (asymmetric vs. `recordCompletedOrder`) | `PASHOV_AUDIT_EtaloReputation.md` §L-1 | Pending | — |
| L-2 | EtaloReputation | LOW | `setAuthorizedCaller` no event emission (auditability gap for indexer) | `PASHOV_AUDIT_EtaloReputation.md` §L-2 | Pending | — |
| L-3 | EtaloReputation | LOW | `SellerSanctioned` event name misleading on rehabilitation (`newStatus == Active`) | `PASHOV_AUDIT_EtaloReputation.md` §L-3 | Pending | — |
| L-1 | EtaloCredits | LOW | Owner can pause credit purchases indefinitely (no time cap) | `PASHOV_AUDIT_EtaloCredits.md` §L-1 | Pending | — (centralization owner-bounded) |
| L-2 | EtaloCredits | LOW | `setBackendOracle` is dead code in V1 | `PASHOV_AUDIT_EtaloCredits.md` §L-2 | V1.5+ scope | ADR-037 (hybrid design) |
| L-3 | EtaloCredits | LOW | CEI ordering — event emitted before external `transferFrom` | `PASHOV_AUDIT_EtaloCredits.md` §L-3 | Pending | ADR-032 — gap to flag |

Info findings (33) listed in their respective per-contract audit files. Most are celopedia D.1-D.4 cross-cuts that resolve to "not applicable" (D.1, D.4) or "minor / documented" (D.2 Credits CIP-64, D.3 Reputation 90d cooldown vs ±15s validator drift = negligible).

---

## 2. Couverture des 4 risques Celo-specific (D.1-D.4)

| Risk | Statut | Évidence dans audit files |
|---|---|---|
| **D.1 — CELO duality** (native CELO + ERC20 CELO conflict) | **N/A** across all 5 contracts | No `payable` entrypoint anywhere ; USDT-only (6 decimals MockUSDT V2 / Celo-native USDT mainnet 0x48065...) ; commission router uses USDT, not CELO. `EtaloEscrow.sol` immutable `usdt` var, no fallback to native. (`PASHOV_AUDIT_EtaloEscrow.md` §I-1, `PASHOV_AUDIT_EtaloCredits.md` §I-4 confirm.) |
| **D.2 — CIP-64 fee-currency drift** (USDT adapter for gas) | **Minor — documented** | Etalo never pays gas in USDT itself ; users do (MiniPay default). Risk : if USDT adapter changes balance semantics across CIP-64 epochs, `transferFrom` accounting could drift. **L-1 EtaloEscrow** flags missing balance-delta accounting as prep, **ADR-003** (D.2 pattern) recently added. Credits §I-4 monitors. **Action** : adopt balance-delta pattern across all `transferFrom` sites pre-mainnet (J11+ hygiene PR). |
| **D.3 — Epoch boundary** (post-L2, ±15s validator clock drift on `block.timestamp`) | **N/A — bounded by design** | All time-locks in V2 use day-scale or longer windows : `AUTO_RELEASE_INTRA = 3 days`, `AUTO_REFUND_INACTIVE = 7 days`, `EMERGENCY_PAUSE_MAX = 7 days`, `FORCE_REFUND_INACTIVITY_THRESHOLD = 90 days`, Reputation `lastSanctionAt` cooldown 90 days. ±15s drift is 5+ orders of magnitude smaller than the smallest window. (`PASHOV_AUDIT_EtaloEscrow.md` §I-3, `PASHOV_AUDIT_EtaloReputation.md` D.3 note confirm.) |
| **D.4 — Mento / Aave / bridges** | **N/A** | Etalo has no Mento / Aave / oracle / cross-chain bridge dependencies. USDT is the sole external asset. Credits has a `setBackendOracle` field reserved for V2 hybrid (currently dead code — see L-2 EtaloCredits). (`PASHOV_AUDIT_EtaloEscrow.md` §I-4, `PASHOV_AUDIT_EtaloCredits.md` §I-4 confirm.) |

---

## 3. Top 10 issues à triager pré-audit humain ADR-039

Classés par priorité H > M > L. Effort = rough estimate (junior dev).

| Rank | ID | Description | Effort | Triage |
|---|---|---|---|---|
| 1 | **H-1 (Dispute)** | Unfunded dispute drain — already fixed via 3-layer `require(order.fundedAt > 0)` | DONE | RESOLVED, listed for completeness ; auditor should verify the fix per `H1_POST_FIX_VERIFICATION.md` |
| 2 | M-2 (Dispute) | Permissionless escalation griefing | 4-6h | Fix proposed : restrict escalation to dispute parties only OR add refundable bond (ADR candidate I-5 Dispute). **Decision needed J11+** |
| 3 | M-3 (Dispute) | `_disputeByItem` never reset — single-shot dispute per item | 2-3h | **Product call** : is re-dispute desired ? Edge-case impact. If yes, reset on resolution + emit event. If no, document in spec |
| 4 | L-1 (Escrow) | `transferFrom` no balance-delta accounting (CIP-64 prep) | 2-4h × N sites | Adopt ADR-003 D.2 pattern across all `usdt.transferFrom` call sites in EtaloEscrow + EtaloCredits. Defensive vs. fee-on-transfer / future CIP-64 drift |
| 5 | L-2 (Escrow) | `createOrderWithItems` CEI inverse + no nonReentrant | 1-2h | Add `nonReentrant` modifier (already on the `usdt` interaction in `fundOrder`). External call to `stake.canCreateOrder` happens before state writes — flag per ADR-032 CEI principle |
| 6 | L-3 (Escrow) | `_calculateCommission` external call no nonReentrant + no try/catch | 1-2h | Wrap in try/catch with fallback to `COMMISSION_INTRA_BPS`. Reputation contract is owner-controlled but defense-in-depth |
| 7 | L-1 (Dispute) | `assignN2Mediator` no liveness check | 1h | Add `require(_mediatorsList[med], "Mediator not in list")` at call time |
| 8 | L-3 (Dispute) | `resolveN1Amicable` no `refundAmount` cap at Dispute layer | 0.5h | Add `require(refundAmount <= item.itemPrice)` mirror at Dispute layer (already at Escrow). Prevents bad UX on out-of-bounds proposals |
| 9 | L-1 (Reputation) | `recordDispute` no `Active` status guard (asymmetric vs `recordCompletedOrder`) | 0.5h | Decision : either add the guard for symmetry OR document the asymmetry as intentional (post-sanction dispute counter mutation) |
| 10 | L-1 (Credits) | Owner can pause indefinitely | 1h | Time-cap pause via `MAX_PAUSE_DURATION` constant (mirror `EMERGENCY_PAUSE_MAX = 7 days` from Escrow). ADR-026-style hardcoded limit |

**Total triage effort** : ~15-25h junior-dev work, parallelizable. Realistic 1-2 sprint days bundle PR pre-mainnet.

---

## 4. Issues à signaler à l'auditeur humain (déjà connues + statut)

To save the ADR-039 freelance auditor's time, declare upfront :

### 4.1 H-1 RESOLVED — verify the fix, do not re-discover
- **Fix commit** : `f8cf195` (3-layer `require(order.fundedAt > 0)` in EtaloDispute.openDispute, EtaloEscrow.markItemDisputed, EtaloEscrow.resolveItemDispute)
- **Empirical reproduction** : `packages/contracts/test/V2/H1_unfunded_dispute_drain.test.ts` (regression guard, 240ms execution, asserts revert + state integrity post-fix)
- **Post-fix verification** : `docs/audit/H1_POST_FIX_VERIFICATION.md` — exhaustive subagent re-audit, all 25 EtaloEscrow + 14 EtaloDispute public/external functions classified, 0 residual unfunded fund-movement paths
- **ADR** : ADR-042 documents the fix rationale + 3-layer defense-in-depth strategy

### 4.2 V2-deferred surfaces (do not audit, will be re-audited V1.5)
Per ADR-041 V1 scope restriction (intra-Africa only, single 1.8% rate, no stake, no cross-border, no Top Seller, no N3 voting) :
- All cross-border progressive-release surfaces (`shipItemsGrouped` cross branch, `markGroupArrived`, `triggerMajorityRelease`, `triggerAutoRefundIfInactive` 14-day branch)
- All `EtaloStake` contract surface (not deployed V1 mainnet)
- All `EtaloVoting` contract surface (N3 vote V2-deferred)
- Top Seller commission (1.2%) + 2-day auto-release (V1.1+)

These are implemented in the V2 binary but **not exercised V1 mainnet**. Audit findings in V2-deferred surfaces tagged "V2 / V1.5 re-audit" — no need to fix V1.

### 4.3 ADR-026 hardcoded limits — confirmed intact
The H-1 fix bundle's post-fix verification subagent confirmed all 6 hardcoded limits remain intact :
- `MAX_TVL_USDT = 50_000` (50_000 × 10^6 raw)
- `MAX_ORDER_USDT = 500`
- `MAX_SELLER_WEEKLY_VOLUME = 5_000`
- `EMERGENCY_PAUSE_MAX = 7 days`
- `EMERGENCY_PAUSE_COOLDOWN = 30 days`
- `FORCE_REFUND_INACTIVITY_THRESHOLD = 90 days`

Auditor should verify these values appear in the deployed bytecode (CLAUDE.md rule 11). Any suggested fix that tries to make them configurable is **rejected** by repo rule.

### 4.4 ADR-023 forceRefund 3 conditions — confirmed intact
Per CLAUDE.md rule 12, `forceRefund` requires :
1. Dispute contract inactive (`address(dispute) == address(0)`)
2. 90+ days inactivity (`block.timestamp > order.fundedAt + 90 days`)
3. Registered legal hold (`legalHoldRegistry[orderId] != bytes32(0)`)

Post-fix verification confirmed all three at lines 695-706 of `EtaloEscrow.sol`. Auditor should not propose relaxation.

### 4.5 Test infrastructure caveat — Path A vs Path B
Per `docs/FOLLOWUPS_J11.md` FU-J11-001, the H-1 incident exposed a test-mock drift risk : `MockEtaloEscrow.sol` did not model `fundedAt`, so unit tests on `EtaloDispute.test.ts` did not catch H-1 (only the `Integration.v2.test.ts` real-escrow tests would have, but they didn't exercise the unfunded path). Path A workaround applied : Mock extended with `fundedAt`. Path B (eliminate Mock entirely, route all tests through real escrow) is queued FU-J11-001 follow-up. Auditor should be aware that Mock-based tests are not the source of truth for V2 invariants ; `Integration.v2.test.ts` is.

---

## 5. Findings rejetés (violations CLAUDE.md rules 11/12 ou ADR-026)

| Finding | Source | Rejection reason |
|---|---|---|
| **None to date** | — | Pashov-equivalent subagents did not propose any fix violating ADR-026 hardcoded limits (rule 11) or ADR-023 forceRefund 3 conditions (rule 12). Subagents were briefed on these constraints upfront in their delegation prompt. |

If the human auditor proposes a fix that touches the hardcoded constants, ADR-023 conditions, or treasury 3-wallet separation (ADR-024), it should be **rejected on rule-violation grounds without further analysis**. These are codified architectural invariants, not negotiable.

A potential gray area : I-12 EtaloEscrow notes the interpretation of ADR-023 condition #1 as "`address(dispute) == 0`" — this is documented intent, not a finding to fix. Auditor confirms the literal interpretation is correct.

---

## 6. Recommandations pour J11 audit pratique

### 6.1 Scope suggested for the ADR-039 freelance auditor

**Primary** :
- Verify H-1 fix : `EtaloDispute.openDispute`, `EtaloEscrow.markItemDisputed`, `EtaloEscrow.resolveItemDispute` (3 sites, 3 layers). Cross-check `H1_POST_FIX_VERIFICATION.md` enumeration is complete.
- Triage M-2 + M-3 EtaloDispute (escalation griefing + `_disputeByItem` re-dispute semantics).
- Sanity-check 7-contract V1 binary (V1-pruned per ADR-041) once produced.

**Secondary** (if budget allows) :
- ADR-032 CEI compliance sweep : confirm L-2 EtaloEscrow + L-3 EtaloCredits are the only CEI gaps, no others lurking.
- ADR-003 D.2 balance-delta sweep : confirm all `usdt.transferFrom` sites adopt the pattern consistently.
- Reputation symmetry : decide on L-1 EtaloReputation `recordDispute` Active gate.

**Out of scope (do not audit)** :
- V2-deferred surfaces (cross-border, stake, voting, Top Seller) — re-audit V1.5
- MockUSDT (OZ standard ERC20)
- Pashov XRAY threat model (already done internally)

### 6.2 Estimation timeline

Per ADR-039 audit budget (~$600-1100, 3-5 freelance days + AI-assisted review ~$100-300) :

| Phase | Estimated time | Deliverable |
|---|---|---|
| Setup + briefing read | 4h | Auditor reads this synthesis + 5 PASHOV_AUDIT_*.md files + ADR-022/023/026/041/042 |
| H-1 fix verification | 4h | Re-walk the 3 layers, run the H-1 test (PASS = correct revert), spot-check `H1_POST_FIX_VERIFICATION.md` claims |
| M-2 + M-3 triage + recommendation | 8h | Written recommendation per finding, fix sketch if applicable |
| Top 10 sweep | 8h | One-liner verdict per finding (accept-as-is / fix path / out-of-scope) |
| Slither + AI-assisted run + report | 8h | Olympix or SolidityScan output review, integration with Pashov findings |
| Final report | 4h | Markdown deliverable for `docs/audits/v1-freelance-review.md` per ADR-039 |
| **Total** | **~36h (4-5 days)** | — |

### 6.3 Pré-conditions

| Item | Status | Comment |
|---|---|---|
| Sepolia stable | ✅ DONE | V2 redeploy post-H-1 executed 2026-05-05 (block 24720376+). New addresses live, indexer-state reset ops pending Mike DB session |
| H-1 fix landed on main | ✅ DONE | PR #7 merged 2026-05-05 |
| design-system-v5 merged on main | ✅ DONE | PR #9 merged 2026-05-05 (HomeRouter polished + multi-signal MiniPay detection now on main) |
| FU-J11-001 (test infra around real escrow) | ⏳ Pending | Defers Path A workaround risk ; not blocking but lowers post-audit residual concern |
| V1-pruned binary built per ADR-041 overrides | ⏳ Pending Sprint J11+ | Auditor should ideally review V1 binary, not full V2 (since V2-deferred surfaces are not in V1 mainnet scope) |

### 6.4 Format suggéré pour le rapport auditeur

`docs/audits/v1-freelance-review.md` should include :
1. Executive summary (1-2 paragraphs)
2. Findings table with severity + status (matches our §1 format)
3. Per-finding write-up (Pashov 1-page format)
4. Comparison vs. our pre-audit findings (which were already known, which are new)
5. Sign-off : "V1 mainnet acceptable / blocked / acceptable-with-conditions"

---

## Appendix A — Per-contract narrative synthesis

Lift-and-shift from rev 1 of this synthesis (commit predecessor). For per-finding detail consult the standalone `PASHOV_AUDIT_*.md` files in `docs/audit/`.

### A.1 EtaloEscrow (20 findings, 0 H / 1 M / 6 L / 13 Info)

#### Medium

- **M-1** : `resolveItemDispute` commission split misallocates fee to seller when item had prior partial release. Affects cross-border 20% ship-release branch only — **entirely V2-deferred per ADR-041** (no cross-border in V1 mainnet). **No V1 mainnet impact.** Fix planned with cross-border re-enablement in V2.

#### Low (6)

L-1 to L-6 — hygiene + minor (`transferFrom` no balance-delta accounting / CEI inverse on `createOrderWithItems` / `_calculateCommission` external call without `nonReentrant` / `legalHoldRegistry` no terminal-status guard / `markGroupArrived` no monotonic guard / empty array branches in `confirmGroupDelivery` silently no-op).

None drainable, none privilege-escalating.

#### Info (13)

I-1 to I-13 — celopedia D.1-D.4 cross-cuts mostly resolve to "not applicable" (no `payable`, no Mento / Aave / bridges, no epoch boundary post-L2). Some informational notes : V2-deferred surfaces interspersed with V1 paths (I-9), gas optimization opportunities (I-10), `OrderStatus.Disputed` enum dead state (I-11), ADR-023 condition #1 interpretation (I-12), V2 reentrancy surface from owner-controlled reputation contract (I-13).

### A.2 EtaloDispute (18 findings, 1 H RESOLVED / 3 M / 5 L / 9 Info)

#### High — H-1

**RESOLVED.** See §1 above.

#### Medium (3)

- **M-1** : Reputation grief — a single buyer can flood a real seller with disputes on unfunded orders, polluting their reputation cache without any economic stake. **Mitigated transitively by the H-1 fix** (now requires `fundedAt > 0` to open a dispute). Re-evaluate post-PR-merge.
- **M-2** : `escalateToMediation` and `escalateToVoting` permissionless after deadline allow third parties to grief in-progress amicable resolutions. Mitigation candidate : restrict escalation to dispute parties only ; or add a small refundable bond. Triage Sprint J11+.
- **M-3** : `_disputeByItem[orderId][itemId]` is never reset, so a single item disputed and resolved can never be disputed again. Edge-case impact (re-dispute is rare in practice, the order is typically Refunded or Released after resolution). Triage Sprint J11+ ; product call on whether re-dispute is desired.

#### Low (5)

L-1 to L-5 — `assignN2Mediator` no liveness check / `escalateToVoting` voter list snapshot semantics / `resolveN1Amicable` no `refundAmount` cap at Dispute layer (Escrow caps it) / `resolveN2Mediation` no `slashAmount` cap at Dispute layer / mediator list iteration O(N²)-ish.

#### Info (9)

I-1 to I-9 — setter same-address re-set / `assignN2Mediator` overwrite / dispute reputation event flag / no cancel-proposal path / 2 ADR candidates (refundable dispute bond, N3 voter snapshot doc) / celopedia cross-cuts / deployment ordering risk / `slashAmount` N1 semantics.

### A.3 EtaloReputation (8 findings, 0 H / 0 M / 3 L / 5 Info — scan-only)

Reference : `docs/audit/PASHOV_AUDIT_EtaloReputation.md`

#### Low (3)

L-1 (recordDispute lacks `Active` status guard, asymmetric vs `recordCompletedOrder`) / L-2 (`setAuthorizedCaller` no event emission, auditability gap) / L-3 (`SellerSanctioned` event name misleading on rehabilitation `newStatus == Active`).

#### Info (5)

I-1 to I-5 — `MAX_SCORE = 100` clamp unreachable (algebraic max = 90), `firstOrderAt` set-once correct per ADR-020, `applySanction(Active)` does not auto-trigger Top Seller re-evaluation (note for V1.1), Solidity 0.8.24 default overflow checks, score formula edge case `ordersCompleted == 0` early-return.

#### Verdict

**Fit for V2 testnet deployment as-is.** No HIGH or MEDIUM findings, LOWs are observability/hygiene, Infos are mostly documented intent. Triage to a doc-pass or post-Proof-of-Ship cleanup PR — non-blocking.

### A.4 EtaloCredits (9 findings, 0 H / 0 M / 3 L / 6 Info)

Reference : `docs/audit/PASHOV_AUDIT_EtaloCredits.md`

#### Low (3)

- **L-1** : Owner can pause credit purchases indefinitely (no time cap). Centralization footprint, owner-bounded.
- **L-2** : `setBackendOracle` is dead code in V1 (oracle pattern reserved for V2 hybrid expansion per ADR-037). Centralization footprint visible but unused.
- **L-3** : CEI ordering — event emitted *before* the external `transferFrom`. Hygiene only ; purchase amount comes from buyer wallet to creditsTreasury, no reentrancy into Credits contract.

#### Info (6)

I-1 to I-6 — spec drift between `PRICING_MODEL_CREDITS.md` §5.2 and deployed contract / welcome bonus + monthly free grant NOT on-chain (per ADR-037) / no per-purchase cap / CIP-64 minor / `block.timestamp` in event payload / constructor `_admin == address(0)` not validated.

#### Verdict

**Minimal contract, minimal surface.** ADR-037 hybrid design intentionally keeps EtaloCredits thin (most logic off-chain in backend ledger). No blockers.

### A.5 Out-of-scope items

#### A.5.1 EtaloStake (V2-deferred per ADR-041)

V1 mainnet is intra-Africa only — no cross-border seller stake required. EtaloStake contract is not deployed V1. Audit deferred to V1.5 with cross-border re-enable.

#### A.5.2 EtaloVoting (V2-deferred per ADR-041)

N3 vote escalation is V2-deferred. If H-1 had been deployed AND N3 enabled, a single attacker could have drained without colluding seller. Both are gated by ADR-041 V1 scope freeze + ADR-042 fundedAt guard, so the combined risk is double-mitigated.

#### A.5.3 MockUSDT

OpenZeppelin standard ERC20 + 6-decimal precision shim. Trivial surface, no audit needed.

---

## Appendix B — Audit method

### B.1 X-ray pre-audit threat model

`docs/audit/PASHOV_XRAY.md` (commit `68e127b` on this branch) — 214-line pre-audit threat model covering :
- Protocol overview + entry points
- Trust model (buyer / seller / mediator / community voter / owner)
- 10 architectural invariants extracted from CLAUDE.md + ADR set
- Cross-contract dependencies + temporal risks
- Hardcoded limits (ADR-026)
- V2-deferred surface inventory

### B.2 Solidity-auditor pass

For each in-scope contract (EtaloEscrow, EtaloDispute, EtaloCredits), a delegated subagent ran the Pashov 8-agent perspectives synthesis :
1. vector-scan (entry-point enumeration)
2. math-precision (integer arithmetic + commission split)
3. access-control (modifier coverage + privilege escalation paths)
4. economic-security (incentive compatibility + griefing)
5. execution-trace (call-graph reachability + reentrancy)
6. invariant (state-machine + storage layout)
7. periphery (helper / view / setter functions)
8. first-principles (architectural critique against ADRs)

Cross-cut against celopedia security-patterns D.1-D.4 (CELO duality, CIP-64 fee-currency drift, epoch boundary, Mento / Aave / bridges). Findings tabled in `docs/audit/PASHOV_AUDIT_<contract>.md`.

### B.3 Reputation scan

Lighter pass (single subagent, single perspective), output as standalone `docs/audit/PASHOV_AUDIT_EtaloReputation.md`. Lower priority justified : non-financial state contract, no fund custody, exposure bounded by owner-controlled allowlist.

### B.4 Empirical reproduction (H-1 only)

`packages/contracts/test/V2/H1_unfunded_dispute_drain.test.ts` (commit `dcae418` on `fix/h1-dispute-funded-guard`, now merged on main) — Hardhat fork, end-to-end attacker scenario. PASS = exploit reachable. 254ms execution time, 100 USDT drained from victim's deposit to attacker wallet.

### B.5 Post-fix verification

`docs/audit/H1_POST_FIX_VERIFICATION.md` (on main since PR #7 merge, commit `0f32580`) — exhaustive subagent re-audit after the 3-layer fix landed. All 25 EtaloEscrow public/external functions and all 14 EtaloDispute public/external functions classified. 8 fund-movement paths : 3 direct guard / 5 state-machine guard. Verdict : "No residual unfunded fund-movement path exists."

---

## Appendix C — V1 mainnet readiness assessment

Per ADR-041 V1 scope (intra-Africa only, single 1.8% commission rate, no stake, no cross-border, no Top Seller discount, no voting), the V1 mainnet binary deploys :

- EtaloEscrow (V1-pruned : drop cross-border + stake + Top Seller surfaces, ~30-40% LOC reduction per SPEC §0)
- EtaloDispute (V1-pruned : N3 vote disabled, only N1 amicable + N2 mediator)
- EtaloReputation (full)
- EtaloCredits (full)

### C.1 Blockers for V1 mainnet

| # | Item | Status |
|---|---|---|
| 1 | H-1 fix merged + ADR-042 landed | ✅ DONE (PR #7 merged 2026-05-05) |
| 2 | Sepolia V2 redeploy with fix | ✅ DONE (PR #8 merged 2026-05-05, FU-J11-002 ops complete) |
| 3 | V1 binary build (apply ADR-041 spec overrides) | ⏳ Pending Sprint J11+ |
| 4 | V1-pruned audit pass | ⏳ Pending — re-run audit on V1 binary, expect zero new findings since V1 ⊆ V2 |
| 5 | ADR-039 freelance audit + AI-assisted review | ⏳ Pending — schedule per §6.2 above |

### C.2 Non-blockers (queue for cleanup PR)

- All M (M-2, M-3 Dispute, M-1 Escrow V2-deferred), L (17), and Info (33) findings except those explicitly tagged as blocking
- Documentation drift items (mostly Info)

---

## Appendix D — Linked artifacts

| Artifact | Path | Branch (post-merge state on main) |
|---|---|---|
| X-ray threat model | `docs/audit/PASHOV_XRAY.md` | `docs/j11-pre-audit` (rebased) |
| EtaloEscrow audit | `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` | `docs/j11-pre-audit` (rebased) |
| EtaloDispute audit | `docs/audit/PASHOV_AUDIT_EtaloDispute.md` | `main` (already merged via H-1 PR with POST-AUDIT UPDATE) and `docs/j11-pre-audit` (rebased copy) |
| EtaloCredits audit | `docs/audit/PASHOV_AUDIT_EtaloCredits.md` | `docs/j11-pre-audit` (rebased) |
| EtaloReputation scan | `docs/audit/PASHOV_AUDIT_EtaloReputation.md` | `docs/j11-pre-audit` (this branch) |
| H-1 reproduction test | `packages/contracts/test/V2/H1_unfunded_dispute_drain.test.ts` | `main` |
| H-1 happy-path test | `packages/contracts/test/V2/H1_funded_dispute_happy_path.test.ts` | `main` |
| H-1 post-fix verification | `docs/audit/H1_POST_FIX_VERIFICATION.md` | `main` |
| ADR-042 | `docs/DECISIONS.md` §ADR-042 | `main` |
| FU-J11-001 (test infra consolidation) | `docs/FOLLOWUPS_J11.md` | `main` |
| FU-J11-002 (Sepolia redeploy) | `docs/FOLLOWUPS_J11.md` | `main` (DONE) |
| Pashov skills (cloned) | `C:/Users/Oxfam/AppData/Local/Temp/pashov-skills/` | external |

---

**End of synthesis.** Next action : Mike opens PR `docs/j11-pre-audit → main` for review + merge.
