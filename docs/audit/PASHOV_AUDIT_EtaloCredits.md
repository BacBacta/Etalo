# Audit — EtaloCredits.sol

**Date** : 2026-05-05
**Source** : packages/contracts/contracts/EtaloCredits.sol (135 lines)
**Method** : pashov 8-agent perspectives + celopedia D.1-D.4 + manual review against ADR-014 / 024 / 026 / 032 / 037
**Auditor** : Claude Sonnet via subagent delegation (Sprint J11 pre-audit prep)

---

## Executive summary

EtaloCredits is a deliberately minimal **event-only on-chain ledger**
for the V1 Boutique pillar 3 asset generator (ADR-037 hybrid credits).
Per ADR-037, only the USDT → credits *purchase* lives on-chain; welcome
bonus, monthly free grant, and consumption are tracked off-chain by the
backend ledger. The contract surface is therefore reduced to four
externals: `purchaseCredits`, `pause`, `unpause`, `setBackendOracle`.

The contract is **structurally simple and audit-friendly**: no fund
custody (transfer is a pass-through to `creditsTreasury`), no per-wallet
mapping, no time arithmetic, no oracle reads. The pashov 8-agent vector
scan surfaces no critical or high-severity findings. The findings below
are predominantly Info / Low and concern (a) a documentation drift
between `docs/PRICING_MODEL_CREDITS.md` §5.2 and the actual deployed
shape, (b) a couple of forward-compat notes for V1.5 CIP-64 wiring, and
(c) the unbounded `pause` duration relative to the Escrow `EMERGENCY_PAUSE_MAX`
cap.

No CRITICAL drainable issue. No HIGH severity. No fund-loss vector.

---

## Findings — High severity

None.

## Findings — Medium severity

None.

## Findings — Low severity

### L-1 · Owner can pause credit purchases indefinitely (no time cap)

**Location** : `EtaloCredits.sol:114-121`

```solidity
function pause() external onlyOwner {
    _pause();
}

function unpause() external onlyOwner {
    _unpause();
}
```

**Observation** : Unlike `EtaloEscrow` (where ADR-026 hardcodes
`EMERGENCY_PAUSE_MAX = 7 days` and a 30-day cooldown, see PASHOV_XRAY.md
§7), EtaloCredits has no upper bound on the duration of a paused state
and no cooldown between pauses. An owner key compromise or a
misbehaving owner could brick `purchaseCredits` for arbitrary time.

**Impact** : Sellers cannot top up paid credits while paused. Welcome
bonus + 5 free/month continue to work (off-chain ledger), and existing
purchased credits continue to consume (off-chain ledger), so the impact
is bounded to *new top-ups*. Severity Low because (a) no fund-loss
risk, (b) revenue impact only on prolonged misuse, (c) ADR-038 V1
single-key Sepolia is testnet.

**ADR-026 status** : ADR-026 caps apply to Escrow specifically ("MAX_TVL
50,000 USDT", "MAX_ORDER 500 USDT", etc.). Credits is not enumerated.
This is intentional — credits is not a custody contract — but the pause
duration cap is an *operational* safety, not a custody safety, so
extending it to Credits would be coherent.

**Constraint check** : Adding a `MAX_CREDITS_PAUSE` would not bypass
CLAUDE.md rule 11 (it would *add* a cap, not remove one) and would not
require an ADR-026 amendment since rule 11 forbids *bypassing* not
*adding* limits. Candidate for an Info-level ADR addition (flagged
below in Info / Notes).

**Recommendation** : Defer to V1.1 alongside any Credits hardening pass.
Acceptable as-is for Sepolia + bounded V1 mainnet risk envelope.

### L-2 · `setBackendOracle` is dead code in V1 (centralisation footprint)

**Location** : `EtaloCredits.sol:42, 129-134`

```solidity
address public backendOracle;
...
function setBackendOracle(address newOracle) external onlyOwner {
    require(newOracle != address(0), "Zero oracle");
    address oldOracle = backendOracle;
    backendOracle = newOracle;
    emit BackendOracleSet(oldOracle, newOracle);
}
```

**Observation** : The slot is declared, the setter exists, an event is
emitted — but no contract function reads `backendOracle`. The docstring
states "V1 = setter only — no contract logic consumes this". This is
deliberate forward-compat scaffolding for V1.5 (per the docstring on
line 39-41, "V1.5+ may add an oracle-callable hook").

**Impact** : Two minor concerns.

1. *Misleading expectation* : an integrator reading the ABI may assume
   the oracle is wired. Mitigation already in place: explicit docstring.
2. *Unbounded oracle* : when V1.5 wires the oracle, the setter has no
   timelock and no zero-address recovery (the require keeps it
   non-zero, so once set the slot can never go back to zero — the
   contract has no `clearBackendOracle`). For V1 this is academic since
   nothing reads the slot.

**Recommendation** : Acceptable as V1 scaffolding. Before V1.5 wires
the oracle path, add (a) a delete/clear branch (set to zero in
emergency), (b) a 24-48h timelock or a 2-step `proposeBackendOracle` /
`acceptBackendOracle` pattern. Out of scope V1.

### L-3 · CEI ordering — event emitted *before* the external transferFrom

**Location** : `EtaloCredits.sol:101-108`

```solidity
emit CreditsPurchased(
    msg.sender,
    creditAmount,
    usdtAmount,
    block.timestamp
);

usdt.safeTransferFrom(msg.sender, creditsTreasury, usdtAmount);
```

**Observation** : The order is "Emit → External call" rather than the
canonical "Effects (state writes + events) → Interactions (external
call)". For a contract with state, this is exactly the CEI pattern. For
EtaloCredits which has *no* state to mutate inside `purchaseCredits`,
the ordering is mechanically equivalent to "log → call".

**Why this is safe** :
- Solidity logs are part of the transaction; if `safeTransferFrom`
  reverts, the entire transaction (including the log) reverts. The
  off-chain indexer therefore never observes a `CreditsPurchased` event
  for a failed purchase. ✓
- nonReentrant guards against any callback-driven re-entry. ✓
- USDT (V2 MockUSDT, OZ ERC20 with no transfer hooks) cannot trigger a
  callback during `transferFrom`. ✓
- Even on real USDT mainnet (Tether on Celo), the contract has no
  callback receiver and no further state to corrupt. ✓

**Why it deserves a note** : the docstring on line 86-90 says "the only
external call is the USDT transferFrom and it happens after the event
is emitted from the call ordering's perspective (reentry would still be
cheap-no-op since no state mutates here, but nonReentrant + a single
external call keeps the pattern consistent with V2)". The phrasing is
accurate but a future contributor adding state writes may forget to
move them above the `emit`. Conservative ordering (emit AFTER state
writes AND before external call) is the safer template.

**Impact** : Zero today. Risk is forward-compat: any future state
addition (e.g. on-chain consumption ledger when V1.5 wires the oracle)
must place writes between event and external call, or move the emit
below the writes.

**Recommendation** : Add an inline `// CEI: emit must precede external
call; future state writes must go above this line` marker. Acceptable
as-is.

## Findings — Info / Notes

### I-1 · Spec drift between PRICING_MODEL_CREDITS.md §5.2 and deployed contract

**Location** : `docs/PRICING_MODEL_CREDITS.md:147-174` vs
`EtaloCredits.sol:22-135`

The pricing doc shows a contract sketch with:

```solidity
uint256 public constant MIN_PURCHASE = 5;
mapping(address => uint256) public purchasedCredits;
function purchaseCredits(uint256 amount) external {
    require(amount >= MIN_PURCHASE, "Minimum 5 credits");
    ...
    purchasedCredits[msg.sender] += amount;
    ...
}
```

The deployed contract:

- has **no `MIN_PURCHASE`** constant. Any `creditAmount > 0` is
  accepted (line 97).
- has **no `purchasedCredits` mapping**. Per-wallet purchase totals are
  reconstructed from `CreditsPurchased` events by the off-chain
  indexer.
- additionally has **`creditsTreasury` immutable** (line 31), whereas
  PRICING doc §7.3 sketches a `setCreditsTreasury(address)` setter.

The deployed shape is **strictly more conservative** than the spec
sketch:

- No `MIN_PURCHASE` enforcement — frontend already enforces 5-credit
  minimum (per PRICING doc §3.3 and §5.1 step 3); the on-chain check
  would be defense-in-depth. Removing it slightly increases edge-case
  surface (a user could call `purchaseCredits(1)` directly and pay
  150_000 USDT raw = 0.15 USDT for 1 credit). This is a *feature*, not
  a bug, since the off-chain ledger can credit any amount > 0.
- Immutable treasury is stricter than a setter (no key-compromise
  rugpull vector). Aligned with ADR-024 spirit (treasury separation
  hardness).
- Event-only ledger (no per-wallet mapping) is the canonical
  ADR-037 hybrid pattern; the indexer is the source of truth.

**Recommendation** : Reconcile the docs.

1. Update `docs/PRICING_MODEL_CREDITS.md` §5.2 contract sketch to
   match the deployed shape (immutable treasury, no MIN_PURCHASE
   on-chain, event-only ledger).
2. Update §7.3 to remove the `setCreditsTreasury` sketch or note that
   immutable was chosen for V1 hardness.
3. Optionally, consider adding `MIN_PURCHASE` on-chain in V1.1 if a
   raw `purchaseCredits(1)` call ever appears in seller telemetry as
   accidental UX (extremely unlikely given MiniPay popup friction).

### I-2 · Welcome bonus + monthly free grant — NOT on-chain (per ADR-037)

**Location** : `EtaloCredits.sol` whole file (no welcome / monthly logic)

The pashov first-principles agent asks: "Can a wallet claim 10 welcome
bonus credits multiple times by re-onboarding ?" and "Free monthly
grant timing manipulation (block.timestamp dependence)?".

Both questions are **N/A on-chain by ADR-037 design**. The hybrid
credits architecture deliberately keeps welcome bonus (10) and monthly
free (5) entirely in the backend `seller_credits_consumption` ledger to
avoid wallet popups for grants the seller didn't explicitly initiate.

The replay surface therefore lives in the backend, not the contract.
Out of scope for this Solidity audit, but the audit-relevant
implications:

- INV-D from the user prompt ("if welcome bonus is one-shot,
  `claimedWelcome[wallet]` flag prevents replay") is a **backend
  invariant**, not an on-chain one. The on-chain invariant set
  collapses to INV-A (credits never negative — vacuously true since no
  on-chain balance) and INV-C (`creditsTreasury USDT >= sum(USDT paid
  for credits)` — exact-equal by construction since the contract pulls
  exactly `creditAmount * USDT_PER_CREDIT` and pushes 1:1 to treasury).
- INV-B (`total credits issued = purchased + welcome + monthly`) is a
  *backend* invariant since welcome and monthly do not exist on-chain.

**Recommendation** : Backend audit pass (Sprint J11 backend security
review per `PASHOV_XRAY.md` §11) must verify the `claimed_welcome`
column on `sellers` table has a UNIQUE constraint (or boolean
single-flip) and the monthly grant uses a deterministic
`(seller_id, year, month)` UNIQUE constraint. Track in the backend
audit deliverable, not here.

### I-3 · No per-purchase cap — creditsTreasury accumulates unbounded

**Location** : `EtaloCredits.sol:92-109`

The pashov vector scan asks whether ADR-026 architectural limits apply.
ADR-026 hardcodes caps on Escrow (`MAX_TVL`, `MAX_ORDER`,
`MAX_SELLER_WEEKLY`), not on Credits. Credits is *revenue*, not
*custody*: USDT paid for credits is non-refundable and lands directly
in `creditsTreasury` (an EOA / multisig per ADR-024) on the same
transaction. There is no escrow accounting to bound.

In principle, a malicious actor with deep USDT reserves could call
`purchaseCredits(2**100)` and burn arbitrary USDT into
`creditsTreasury`. The actor pays themselves; the treasury benefits.
This is an irrational attack (the attacker is the victim). The only
realistic risk is a Solidity overflow: `2**256 / 150_000 ≈ 7.7 × 10^71`
credits before `creditAmount * USDT_PER_CREDIT` overflows — unreachable
under any USDT-balance scenario.

**Recommendation** : No action. Document choice (it is already implicit
via ADR-024 separation logic).

### I-4 · CIP-64 fee-currency drift (D.2) — minor for Credits

**Location** : `EtaloCredits.sol:108`

Per celopedia security-patterns.md §2 and PASHOV_XRAY.md cross-ref:
when a user pays gas in USDT (CIP-64 fee-currency tx, planned V1.5 per
ADR-003), the user's *post-tx* USDT balance is reduced by both
`usdtAmount` AND the gas fee paid in USDT.

For EtaloCredits, the drift is **on the user side, not the treasury
side**:

- The contract pulls a fixed `usdtAmount = creditAmount * 150_000`
  from `msg.sender` to `creditsTreasury`. Both legs of the
  `transferFrom` are arithmetic-exact.
- The CIP-64 gas fee is paid by `msg.sender` to the validator pool via
  the fee-currency adapter (`0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`
  on mainnet per CLAUDE.md), entirely outside the contract's call
  graph.
- `creditsTreasury` accounting therefore remains exact: every
  `CreditsPurchased(buyer, creditAmount, usdtAmount, ts)` event
  corresponds to exactly `usdtAmount` raw USDT delivered to treasury.

The user-side drift matters for UX, not for accounting integrity:
under CIP-64, the seller must approve `usdtAmount + estimatedGas` to
avoid a double-popup. This is a frontend / wagmi config concern, not a
contract bug.

Contrast Escrow: Escrow has the balance-delta drift risk because
`fundOrder` pulls `totalAmount` AND immediately splits it into
buyer/seller/treasury allocations whose sum must equal `totalAmount`.
Credits has no split — pulls X, pushes X — so no drift.

**Recommendation** : When V1.5 wires CIP-64 gas-pay-USDT, the frontend
approval helper must add a gas-buffer to the USDT approval. Track in
V1.5 frontend audit, not here.

### I-5 · `block.timestamp` in event payload — informational only

**Location** : `EtaloCredits.sol:51-56, 105`

`CreditsPurchased.timestamp` is `block.timestamp` at emission. Validators
can manipulate this within the standard ±15s tolerance (Celo block
time ~5s). The off-chain indexer should treat this field as
indicative, not authoritative — the canonical source-of-truth
timestamp is the block timestamp from the transaction receipt.

**Impact** : None. The field is a convenience for off-chain consumers;
neither the backend ledger nor any on-chain logic reads it back.

**Recommendation** : Indexer should use `Block.timestamp` from receipt,
not the event payload. Probably already the case but worth confirming
in the J5 indexer audit.

### I-6 · `_admin == address(0)` not validated in constructor

**Location** : `EtaloCredits.sol:69-78`

```solidity
constructor(
    address _usdt,
    address _creditsTreasury,
    address _admin
) Ownable(_admin) {
    require(_usdt != address(0), "Zero USDT address");
    require(_creditsTreasury != address(0), "Zero treasury address");
    ...
}
```

The constructor checks `_usdt != 0` and `_creditsTreasury != 0` but
not `_admin != 0`. Validation is in fact provided by OpenZeppelin
Ownable v5 (`Ownable(address(0))` reverts with `OwnableInvalidOwner`),
so the contract cannot be deployed with a zero-address admin. The
behavior is correct; the explicit check is just absent for symmetry
with the other two requires.

**Impact** : Zero. Defense-in-depth nit only.

**Recommendation** : Optionally add `require(_admin != address(0), "Zero
admin");` for symmetry. Acceptable as-is.

---

## Pashov 8-agent perspectives — explicit verdict per agent

| Agent | Finding | Verdict |
|---|---|---|
| Vector scan | Reentrancy on transferFrom | nonReentrant + USDT no-callback → safe |
| Vector scan | Front-running purchase | Not exploitable (attacker pays own USDT for own credits) |
| Vector scan | Welcome bonus replay | N/A on-chain (off-chain per ADR-037) — backend audit |
| Vector scan | Monthly grant timing | N/A on-chain (off-chain per ADR-037) — backend audit |
| Access control | Mint authority | Anyone with USDT (open by design — economic rate-limit via 0.15 USDT/credit) |
| Access control | Burn authority | N/A (consumption is off-chain) |
| Access control | Welcome / monthly grant | N/A on-chain |
| Access control | Treasury withdrawal | N/A — treasury is just an EOA / multisig recipient (immutable) |
| Economic | Pricing math | `creditAmount * 150_000` exact, no remainder, no rounding |
| Economic | Free credits gaming | N/A on-chain |
| Economic | Welcome one-shot | N/A on-chain — backend invariant |
| Economic | Direct push vs pull | Direct push to treasury — non-custodial-by-pass-through ✓ |
| Invariants | INV-A balance ≥ 0 | Vacuously true (no on-chain balance) |
| Invariants | INV-B issuance accounting | Backend invariant only |
| Invariants | INV-C treasury backing | Exact-equal by construction (pull X, push X) |
| Invariants | INV-D welcome flag | Backend invariant |
| Math precision | USDT 6 decimals | `USDT_PER_CREDIT = 150_000` (= 0.15 × 10^6) ✓ |
| Math precision | Overflow | `2^256 / 150_000` upper bound unreachable; Solidity 0.8.24 reverts on overflow ✓ |
| Math precision | Floor/ceil on remainder | No remainder by construction |
| Execution trace | First interaction → welcome bonus | N/A on-chain (off-chain) |
| Execution trace | Buy 100 credits | approve(15 USDT) → purchase(100) → emit + transferFrom → treasury += 15 USDT ✓ |
| Execution trace | Asset generator burn | N/A on-chain |
| Execution trace | Monthly grant | N/A on-chain |
| Periphery | USDT.transferFrom | Single external call, nonReentrant, post-emit ✓ |
| Periphery | creditsTreasury | Passive recipient (immutable EOA / multisig) ✓ |
| Periphery | Callbacks / hooks | None |
| First principles | Free credits I shouldn't have | Cannot be obtained on-chain (only paid path) ✓ |
| First principles | Drain treasury without debit | Impossible (treasury only receives, no withdraw fn) ✓ |
| First principles | Block another user's bonus | N/A (bonus is off-chain) |
| First principles | Emit invalid balance for indexer | Indexer must validate `usdtAmount == creditAmount × USDT_PER_CREDIT` defense-in-depth (the contract enforces it but indexer should not trust event payload alone) |

---

## Celopedia D.1-D.4 cross-check

| Risk | Status | Verdict |
|---|---|---|
| **D.1 CELO duality** | No payable functions | ✓ Compliant. `purchaseCredits` is non-payable. Constructor non-payable. Pause / unpause / setBackendOracle non-payable. Contract cannot receive CELO. |
| **D.2 CIP-64 fee-currency drift** | Fixed-amount transferFrom | Drift exists user-side under CIP-64 (V1.5), but treasury accounting remains exact. Less severe than Escrow. See I-4. |
| **D.3 Epoch boundary effects** | No validator state | N/A — no time-windowed accruals on-chain. |
| **D.4 Mento / Aave / bridge** | No DeFi interactions | N/A — single ERC20 transferFrom only. |

---

## Conformance with Etalo constraints

- **ADR-024 treasury separation (creditsTreasury)** : ✓ verified at
  `EtaloCredits.sol:31` (`address public immutable creditsTreasury`)
  and at line 108 (sole destination of the transferFrom). The
  treasury is **immutable**, which is *stricter* than the
  PRICING_MODEL_CREDITS.md §7.3 sketch suggesting a `setCreditsTreasury`
  setter (see I-1). The immutable choice is preferable for ADR-024
  separation hardness.
- **ADR-014 pricing 0.15 USDT/credit + 5 free/month + 10 welcome bonus** :
  - 0.15 USDT/credit verified at `EtaloCredits.sol:36`
    (`USDT_PER_CREDIT = 150_000` = 0.15 × 10^6).
  - 5 free/month + 10 welcome bonus : intentionally **off-chain** per
    ADR-037 hybrid credits decision. Not implemented on-chain. See I-2.
- **CLAUDE.md rule 2 USDT 6 decimals** : ✓ verified at
  `EtaloCredits.sol:36` (`USDT_PER_CREDIT = 150_000` reflects 6
  decimals) and line 99 (`creditAmount * USDT_PER_CREDIT` produces raw
  6-decimal units).
- **CLAUDE.md rule 6 ReentrancyGuard on fund-moving fns** : ✓
  `purchaseCredits` is `nonReentrant` (line 94).
- **CLAUDE.md rule 11 ADR-026 hardcoded limits** : N/A — Credits is
  not a custody contract; ADR-026 caps apply to Escrow. See I-3 for
  the rationale and L-1 for a candidate addition (operational pause
  cap, not a custody cap).
- **CLAUDE.md rule 13 treasury 3-wallet separation** : ✓ creditsTreasury
  is set at construction and immutable; cannot be merged with
  `commissionTreasury` or `communityFund`.
- **ADR-032 CEI strict** : ✓ semantically (no state to write); see L-3
  for the forward-compat note about preserving the pattern when state
  is added.
- **ADR-037 hybrid credits architecture** : ✓ event-only on-chain
  ledger; no welcome / monthly / consumption logic on-chain.

---

## V1.5 forward-compat notes

- **CIP-64 fee-currency drift on credits purchase** : when V1.5 enables
  USDT-paid gas, the frontend approval helper must add a gas-buffer to
  the USDT approval to avoid double-popups. Treasury accounting
  remains exact (see I-4). No contract change required.
- **Backend oracle wiring** : if V1.5 adds `recordConsumption(seller,
  amount)` per the docstring on line 39-41, add (a) timelock or
  2-step setter on `setBackendOracle`, (b) zero-address recovery
  branch (currently the slot can never be cleared once set, only
  rotated). See L-2.
- **MIN_PURCHASE on-chain** : if accidental `purchaseCredits(1)` calls
  appear in telemetry, add `MIN_PURCHASE = 5` constant for
  defense-in-depth. See I-1.
- **Pause duration cap** : align with Escrow `EMERGENCY_PAUSE_MAX = 7
  days` + 30-day cooldown if owner-key compromise becomes a realistic
  concern post-mainnet. See L-1.

---

## ADR candidates to flag (for human auditor decision)

These are **not new ADRs** — flagged per audit constraints — for the
human auditor / Mike to decide whether to formalize:

1. **ADR candidate (Info-level)** : explicitly document in DECISIONS.md
   that `creditsTreasury` is `immutable` in EtaloCredits (deviation
   from PRICING_MODEL_CREDITS.md §7.3 setter sketch). Either update the
   pricing doc to match, or add a brief ADR rationale ("immutable
   chosen over setter for treasury-separation hardness; setter
   acceptable on commissionTreasury since Escrow has multiple split
   destinations").
2. **ADR candidate (Low-level)** : add `EMERGENCY_PAUSE_MAX_CREDITS`
   constant (e.g. 7 days, mirroring Escrow) to bound owner pause
   duration on EtaloCredits. Rationale: operational safety, not
   custody. Defer V1.1.
3. **ADR candidate (Low-level)** : add `MIN_PURCHASE_CREDITS = 5`
   on-chain check to mirror PRICING_MODEL_CREDITS.md §3.3. Defense-in-
   depth — frontend already enforces. Defer V1.1 unless telemetry
   flags accidental sub-5 purchases.

---

## Summary table

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 3 | L-1 (pause cap), L-2 (oracle dead code), L-3 (CEI ordering forward-compat) |
| Info | 6 | I-1 (spec drift), I-2 (welcome off-chain), I-3 (no per-purchase cap), I-4 (CIP-64 user-side drift), I-5 (event timestamp), I-6 (admin zero-address) |

---

## Cross-references

- pashov-skills `solidity-auditor` 8-agent framework
- celopedia-skills `security-patterns.md` D.1-D.4
- `docs/audit/PASHOV_XRAY.md` (§9 EtaloCredits attack surface ranking)
- `docs/PRICING_MODEL_CREDITS.md` §3 (credit model), §5.2 (contract sketch — drift), §7 (treasury architecture)
- `docs/DECISIONS.md` ADR-014 (V1 Boutique + credits 0.15 USDT) +
  ADR-024 (3 separated treasuries) + ADR-026 (hardcoded limits — Escrow only) +
  ADR-032 (CEI strict) + ADR-037 (Sprint J7 hybrid credits + on-chain
  purchase / off-chain consumption)
- `CLAUDE.md` Critical rules 2 (USDT 6 decimals), 6 (ReentrancyGuard),
  11 (hardcoded limits), 13 (treasury separation)
