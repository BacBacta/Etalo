# Audit — EtaloReputation.sol

**Date** : 2026-05-05
**Source** : packages/contracts/contracts/EtaloReputation.sol (163 lines)
**Method** : pashov scan-only pass (lower priority than full Pashov-equivalent — non-financial state contract per Sprint J11 audit charter)
**Auditor** : Claude Sonnet via subagent delegation (Sprint J11 Track B remainder)

---

## Executive summary

EtaloReputation is a **non-custodial state-only contract** that tracks
seller reputation: orders completed, orders disputed, disputes lost,
total volume, score (0-100), Top Seller badge, sanction status, and two
timestamps (`lastSanctionAt`, `firstOrderAt`). It performs no fund
transfers, holds no balance, has no `payable` entrypoint, and exposes a
deliberately small surface (5 state-changing externals + 3 views).

Access control follows a two-tier model: `onlyOwner` for sanction and
caller-allowlist administration; `onlyAuthorized` (allowlisted contracts
+ owner) for the three core writers (`recordCompletedOrder`,
`recordDispute`, `checkAndUpdateTopSeller`). The score formula is
algebraically bounded (max raw = 90, min = 0 after penalty saturation),
so the explicit `MAX_SCORE = 100` clamp is unreachable but harmless.

The scan surfaces no critical, high, or medium severity findings.
Findings are predominantly Low and Info: a missing `Active` status
guard on `recordDispute`, an absence of event emission on
`setAuthorizedCaller`, a semantic misnomer on `SellerSanctioned` when
`newStatus == Active`, and the unreachable `MAX_SCORE` clamp.

No fund-loss vector. No drainable issue. Celopedia D.1-D.4 risks are
all N/A (no CELO duality, no CIP-64 fee currency, no epoch-bound
accruals, no DeFi/bridge integrations).

## Summary

| Severity | Count |
|---|---|
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 3 |
| Info | 5 |

---

## Public + external function inventory

| # | Function | Visibility | Access | Role |
|---|---|---|---|---|
| 1 | `setAuthorizedCaller(caller, authorized)` | external | onlyOwner | Manage allowlist of contracts that can call the `onlyAuthorized` writers (typically Escrow, Dispute) |
| 2 | `applySanction(seller, newStatus)` | external | onlyOwner | Set sanction status; stamps `lastSanctionAt` and revokes Top Seller when transitioning to non-Active |
| 3 | `recordCompletedOrder(seller, orderId, amount)` | external | onlyAuthorized | Increment `ordersCompleted`, accumulate `totalVolume`, stamp `firstOrderAt` once, recompute score |
| 4 | `recordDispute(seller, orderId, sellerLost)` | external | onlyAuthorized | Increment `ordersDisputed` (and `disputesLost` if seller lost), recompute score |
| 5 | `checkAndUpdateTopSeller(seller)` | external | onlyAuthorized | Re-evaluate the 4-criterion Top Seller predicate, emit grant/revoke event on transition |
| 6 | `getReputation(seller)` | external view | open | Return full `SellerReputation` struct |
| 7 | `isTopSeller(seller)` | external view | open | Return Top Seller badge state |
| 8 | `getAutoReleaseDays(seller, isCrossBorder)` | external view | open | Return auto-release window: 7 days cross-border, 2 days intra Top Seller, 3 days intra default |

---

## Findings — High severity

None.

## Findings — Medium severity

None.

## Findings — Low severity

### L-1 · `recordDispute` does not enforce `status == Active`

- **Location** : `EtaloReputation.sol:74-84` (`recordDispute`)
- **Description** : `recordCompletedOrder` (line 62) requires
  `rep.status == SellerStatus.Active` before recording. `recordDispute`
  has no equivalent guard — disputes are recorded even for sellers
  whose status is `Suspended` or `Banned`. In normal flow the gating
  happens upstream (Escrow / Dispute won't call here for a banned
  seller), but the contract itself accepts the write.
- **Impact** : A misbehaving authorized caller (or one with a stale
  view of the seller's status) could continue to push `ordersDisputed++`
  / `disputesLost++` against a banned account. Since `disputesLost`
  permanently disqualifies Top Seller, this is mostly self-consistent
  with the punishment, but it diverges from the symmetric guard on
  completion. Severity Low because (a) no fund risk, (b) all current
  authorized callers (Escrow, Dispute) check the lifecycle upstream.
- **Suggested fix direction** : Either (a) add `require(rep.status ==
  SellerStatus.Active, ...)` for symmetry, or (b) document explicitly
  that disputes can be recorded against any status (which is the
  current behavior) and that this is intentional — banned sellers'
  in-flight disputes still need a final outcome recorded.
- **Confidence** : Medium. Not certain whether the asymmetry is
  intentional design (in-flight dispute resolution after ban) or an
  oversight; behavior is observable but harmless either way.

### L-2 · `setAuthorizedCaller` emits no event

- **Location** : `EtaloReputation.sol:38-41`
- **Description** : Granting or revoking authorized-caller status is a
  privileged operation that changes which contracts can mutate seller
  reputation. The function updates `isAuthorizedCaller[caller]` without
  emitting any event. Indexers and audit tooling cannot observe
  authorization changes without state-diff scanning.
- **Impact** : Operational transparency is reduced. If an attacker
  compromises the owner key and silently allowlists their own contract,
  there is no on-chain log to alert monitoring. No fund-loss path
  because the contract has no funds, but reputation could be
  manipulated (false `recordCompletedOrder` to inflate score).
- **Suggested fix direction** : Add `event AuthorizedCallerSet(address
  indexed caller, bool authorized)` and emit on every state change.
  Strictly additive to the ABI, no compatibility break.
- **Confidence** : High. Standard practice for privileged setters
  (compare to `BackendOracleSet` in EtaloCredits).

### L-3 · `SellerSanctioned` event semantically misleading when `newStatus == Active`

- **Location** : `EtaloReputation.sol:43-57` (`applySanction`)
- **Description** : `applySanction` accepts any `SellerStatus`,
  including `Active`. When the owner lifts a sanction (Suspended →
  Active or Banned → Active), the function emits
  `SellerSanctioned(seller, Active)` — the event name reads as a
  punishment but the payload encodes a rehabilitation. Indexers must
  read the `newStatus` field to disambiguate.
- **Impact** : Off-chain consumers that filter/alert on
  `SellerSanctioned` topic alone will fire false positives on
  rehabilitation. No on-chain consequence; pure observability concern.
- **Suggested fix direction** : Either rename the event to a
  status-neutral `SellerStatusChanged`, or split into two events
  (`SellerSanctioned` for non-Active transitions, `SellerReinstated`
  for transition back to Active). Strictly additive if a second event
  is introduced.
- **Confidence** : High. Clear semantic mismatch.

## Findings — Info / Notes

### I-1 · `MAX_SCORE = 100` clamp is unreachable

- **Location** : `EtaloReputation.sol:18, 154-159` (`_recalculateScore`)
- **Description** : The score formula is `SCORE_BASE (50) +
  completionBonus (≤30, since `ordersCompleted * 30 / totalOrders ≤ 30`
  when `ordersDisputed = 0`) + volumeBonus (≤10, since `min(orders,
  100) * 10 / 100 ≤ 10`) - disputePenalty (≤40)`. The maximum raw
  positive score before subtraction is `50 + 30 + 10 = 90`. After any
  positive `disputePenalty`, the score only decreases. Therefore
  `rep.score > MAX_SCORE` (100) is unreachable; the clamp on lines
  157-159 is dead code.
- **Impact** : None — defensive clamp that costs ~30 gas per
  recalculation but never triggers.
- **Suggested fix direction** : Remove the unreachable branch, or
  document that it exists as a defense-in-depth invariant in case the
  formula is later widened (e.g. a future bonus that could push raw
  above 100). The latter is preferable for forward-compat.
- **Confidence** : High. Trivially verifiable from the formula
  bounds.

### I-2 · `recordDispute` increments `ordersDisputed` regardless of outcome — by design

- **Location** : `EtaloReputation.sol:74-84`
- **Description** : `ordersDisputed` increments for every dispute,
  whether the seller wins or loses. The score formula uses
  `totalOrders = ordersCompleted + ordersDisputed` as denominator for
  the completion-rate bonus. Therefore even a dispute the seller wins
  *dilutes* the seller's completion rate (and therefore the
  `completionBonus`). This is a design choice (sellers who attract
  disputes — even spurious ones — should see their score gently
  decrease), but it deserves to be documented because it is
  non-obvious.
- **Impact** : Mild incentive distortion. A legitimate seller who
  wins all their disputes still loses score relative to a seller who
  has no disputes at all. For Top Seller eligibility, only
  `disputesLost == 0` is checked (line 99), so the badge gate is
  unaffected; only the underlying score number is affected.
- **Suggested fix direction** : Either (a) accept the current
  behavior as a "noise penalty" and document, or (b) only increment
  `ordersDisputed` when `sellerLost == true` (collapsing it into
  `disputesLost`). Option (b) would simplify the score model. Either
  is consistent with ADR-020.
- **Confidence** : High that the behavior is as described; unknown
  whether intentional.

### I-3 · `checkAndUpdateTopSeller` is permissioned (`onlyAuthorized`) — could be `external` open

- **Location** : `EtaloReputation.sol:93-110`
- **Description** : The function is a pure re-evaluation of an
  on-chain predicate against on-chain state. Anyone could call it
  without harming the contract or the seller (they would simply
  trigger an event the system would have triggered anyway when the
  next authorized writer fires). The current `onlyAuthorized` gate
  ensures only Escrow / Dispute can refresh the badge, which avoids
  a denial-of-service-by-spam (gas burn) and centralizes the timing,
  but adds operational coupling.
- **Impact** : Operational. If neither Escrow nor Dispute call
  `checkAndUpdateTopSeller` for a given seller (for example, after a
  sanction is lifted via `applySanction(seller, Active)`), the seller
  will not regain the Top Seller badge until the next order or dispute
  resolution. There is no permissionless re-evaluation path.
- **Suggested fix direction** : Either (a) keep current behavior and
  ensure `applySanction` (when reinstating to Active) calls the
  re-evaluation internally — currently it does not, so a reinstated
  Top Seller stays demoted until the next event; or (b) make
  `checkAndUpdateTopSeller` open-permissionless. Option (a) is more
  conservative.
- **Confidence** : High that there is no automatic re-grant on
  reinstatement; the `applySanction` body only revokes (line 51-53),
  never re-evaluates.

### I-4 · `applySanction` allows arbitrary status transitions (Banned → Active)

- **Location** : `EtaloReputation.sol:43-57`
- **Description** : Owner can transition from any status to any
  status, including reversing a `Banned` decision back to `Active`.
  No state-machine guard. This is consistent with the function being
  an admin escape hatch (ADR-020 doesn't mandate ban irreversibility),
  but a future ADR mandating "ban is final" would need additional
  guarding.
- **Impact** : None today — this is the documented behavior. Flagged
  for future-proofing only.
- **Suggested fix direction** : If V1.5 / V2 introduces an
  irreversible-ban policy, add a check that prevents transitions out
  of `Banned`. No change required today.
- **Confidence** : High.

### I-5 · Celopedia D.1-D.4 explicit verdict

| Risk | Status | Verdict |
|---|---|---|
| **D.1 CELO duality** | No payable functions | N/A — contract cannot receive CELO; pure state contract |
| **D.2 CIP-64 fee-currency drift** | No fund transfer | N/A — gas paid by `msg.sender` is independent of contract logic |
| **D.3 Epoch boundary effects** | Time arithmetic limited to `lastSanctionAt + 90 days` cooldown comparison | Negligible — 90-day window dwarfs validator timestamp manipulation tolerance (±15s); a Top Seller cooldown decided 15s early/late is operationally irrelevant |
| **D.4 Mento / Aave / bridge** | No DeFi integration | N/A |

---

## Out-of-scope notes

- **Backend authorized-caller bookkeeping** : the integrity of the
  reputation state depends on (a) Escrow correctly calling
  `recordCompletedOrder` exactly once per released item, (b) Dispute
  correctly calling `recordDispute` exactly once per resolution, (c)
  the J5 indexer reflecting these events without double-counting. None
  of these guarantees live in EtaloReputation itself; they belong to
  the audit of Escrow (already done) + Dispute (already done) + the
  indexer (Sprint J11 Track C).
- **Sanction lifecycle policy** : whether `Banned` should be reversible
  is a product / governance decision, not a contract invariant. ADR-020
  is silent on this point. Out of scope.
- **Score formula tuning** : the choice of `30 + 10 - 40` ranges
  (max +40, max -40) is a product calibration decision. The contract
  faithfully implements ADR-020's preserved-V1 formula. Out of scope.
- **Event topology for indexer** : `OrderRecorded`,
  `DisputeRecorded`, `TopSellerGranted/Revoked`, `SellerSanctioned`,
  `ScoreUpdated` are all `indexed seller` and adequate for the J5
  subgraph. Out of scope here.

---

## Conclusion

EtaloReputation is a **structurally simple, audit-friendly state
contract** with a small surface, clear access-control model, and
algebraically bounded math. The scan surfaces no high or medium
findings: there is no fund custody, no reentrancy surface, no DeFi /
bridge / oracle integration, and no time-windowed accrual that could
be abused via validator timestamp manipulation.

The three Low findings (missing `Active` guard on `recordDispute`,
absent event on `setAuthorizedCaller`, misleading `SellerSanctioned`
event name on rehabilitation) are operational / observability
concerns that can be addressed in a V1.1 hardening pass without
disrupting current callers. The Info findings document design choices
(unreachable score clamp, dispute-count semantics, permissioned
re-evaluation) that the human auditor / Mike may want to formalize in
DECISIONS.md but require no immediate change.

Verdict: **acceptable as-is for Sepolia and bounded V1 mainnet
deployment**, with the L-1 to L-3 items recommended for the next
non-urgent hardening pass.

---

## Cross-references

- pashov-skills `solidity-auditor` (single-perspective scan-only mode
  per Sprint J11 audit charter for non-financial contracts)
- celopedia-skills `security-patterns.md` D.1-D.4
- `docs/DECISIONS.md` ADR-020 (cross-border tiering + Top Seller
  criteria + 90-day post-sanction cooldown)
- `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` (caller-side guarantees on
  `recordCompletedOrder`)
- `docs/audit/PASHOV_AUDIT_EtaloDispute.md` (caller-side guarantees on
  `recordDispute`)
- `CLAUDE.md` Critical rule 6 (ReentrancyGuard required on fund-moving
  functions — N/A here, no funds)
