# Etalo V2 — Audit Briefing Package

**Audience**: external audit firm, day 1 onboarding.
**Reading time**: 15–20 minutes.
**Document version**: 1.0 (2026-04-27, Sprint J8 Block 4).
**Branch**: `feat/pre-audit-v2`.
**Reference tag**: `v2.0.0-asset-generator-sepolia` (J7 closure; the J8 closure tag `v2.0.0-pre-audit-sepolia` will mark the audit handover commit).

This document is a **navigational onboarding kit**, not a deep-dive. The technical security analysis lives in `docs/THREAT_MODEL.md` (4,032 words, 25–30 min). Use this briefing to locate code, run the test suite, scan the ADR log, and contact the team. Every section that touches a security claim cross-references the relevant THREAT_MODEL.md section instead of duplicating it.

---

## 1. Welcome and executive summary

Etalo is a **non-custodial social-commerce escrow** for African informal sellers, deployed on Celo and surfaced inside the MiniPay wallet. Funds live in public smart contracts; admin power is structurally bounded by code (ADR-022 / Zenland / Circle Refund Protocol standard); disputes resolve through a permissionless three-level chain (N1 / N2 / N3) that always terminates in code-enforced resolution.

**V1 perimeter for this audit**: six smart contracts at ~2,420 LOC total — `EtaloReputation` (163), `EtaloStake` (425), `EtaloVoting` (136), `EtaloDispute` (416), `EtaloEscrow` (1146), `EtaloCredits` (135). Worst-case TVL is hardcoded to 50,000 USDT (ADR-026). The protocol moves USDT only.

**Lead contact**: Mike (solo developer, Belgium UTC+1/+2). See §7 for channel and cadence.

---

## 2. Audit scope

**In-scope** (mapped exhaustively in THREAT_MODEL.md §3 and §10):

- The six Solidity contracts listed above and their interfaces.
- Cross-contract interactions (wiring topology, modifier-based ACL).
- The eight Foundry invariants (`foundry-test/invariants/`).
- The ADR-022 non-custodial criteria — code-side verification.
- Architectural caps from ADR-026 (`MAX_TVL_USDT`, `MAX_ORDER_USDT`, `MAX_SELLER_WEEKLY_VOLUME`, `EMERGENCY_PAUSE_MAX`, etc.).

**Out of scope** (THREAT_MODEL.md §10): frontend (Next.js + Wagmi), backend (FastAPI indexer, reviewed for sole-authority pattern but not full audit), IPFS pinning (Pinata), the Anthropic API integration, MiniPay WebView, Twilio notifications. The 50,000 USDT cap bounds the financial impact of any in-scope vulnerability.

The five fix-driven ADRs already caught J4–J7 (ADR-029 → ADR-033) are listed in §9 and detailed in THREAT_MODEL.md §8. They are mentioned here so the audit firm understands the team's self-review methodology before scanning the code.

---

## 3. Repository tour

```
etalo/
├── packages/
│   └── contracts/
│       ├── contracts/                 # 6 .sol contracts in scope
│       │   ├── EtaloReputation.sol    # 163 LOC
│       │   ├── EtaloStake.sol         # 425 LOC
│       │   ├── EtaloVoting.sol        # 136 LOC
│       │   ├── EtaloDispute.sol       # 416 LOC
│       │   ├── EtaloEscrow.sol        # 1146 LOC
│       │   ├── EtaloCredits.sol       # 135 LOC
│       │   ├── interfaces/            # 5 interface .sol files
│       │   ├── types/EtaloTypes.sol   # shared enums + structs
│       │   └── test/                  # MockUSDT, MockEtaloDispute, MockEtaloEscrow
│       ├── test/                      # Hardhat unit tests (173 specs)
│       ├── foundry-test/invariants/   # 8 invariants (Invariants.t.sol + EtaloCreditsInvariant.t.sol)
│       ├── deployments/               # celo-sepolia-v2.json (full artifact)
│       ├── scripts/                   # deploy + smoke + verify scripts
│       └── slither.config.json        # Slither configuration (no detectors silenced)
└── docs/
    ├── DECISIONS.md                   # 38 ADRs (audit-relevant log)
    ├── SECURITY.md                    # invariants + addresses + Slither report
    ├── THREAT_MODEL.md                # technical threat model (Block 2 J8)
    ├── AUDIT_BRIEFING.md              # this file
    ├── SPEC_SMART_CONTRACT_V2.md      # state machines, function-by-function
    ├── SMART_CONTRACTS.md             # contract reference (legacy, partly superseded)
    ├── BACKEND.md                     # backend / indexer reference
    ├── FRONTEND.md                    # frontend reference (out of scope)
    └── PRICING_MODEL_CREDITS.md       # ADR-014 / ADR-037 credits anchor
```

**Companion docs** (read in this order on day 1):

1. `THREAT_MODEL.md` — primary technical document.
2. `SECURITY.md` — runtime invariants + deployed addresses + Slither static-analysis report.
3. `DECISIONS.md` — full ADR log; §5 of this briefing summarizes audit relevance.
4. `SPEC_SMART_CONTRACT_V2.md` — state-machine reference for the order / item / dispute / stake FSMs.

---

## 4. Reproducibility instructions

**Prerequisites**: Node 20+, Foundry 1.5.1+, Slither 0.11.5, Python 3.11+ (for Slither). On Windows: WSL2 or PowerShell with `git bash` for the test commands; Linux/macOS native is the reference path.

```bash
git clone https://github.com/BacBacta/Etalo.git
cd Etalo
git checkout feat/pre-audit-v2
cd packages/contracts
npm install
```

**Compile**:

```bash
npx hardhat compile      # clean build expected, 0 warnings on the 6 in-scope contracts
```

**Hardhat unit tests** (expected: **173 passing**):

```bash
npx hardhat test
```

**Foundry invariant suite** (expected: **8 invariants, 0 reverts**, 102,400+ bounded actions cumulative):

```bash
forge test --match-path "**/invariants/**"
```

**Slither static analysis** (expected: **0 H / 0 M / 38 L / 12 I = 50 findings**, all justified inline):

```bash
slither . --config-file slither.config.json
```

**Forge coverage** (lower-bound — TypeScript Hardhat tests are not counted):

```bash
forge coverage --report summary
```

**Sepolia RPC**: configure a `.env` with `SEPOLIA_RPC_URL=https://lb.drpc.org/ogrpc?network=celo-sepolia&dkey=…`. Legacy / CIP-64 transactions only — EIP-1559 envelopes are rejected on Celo (CLAUDE.md rule 3). Public verified addresses are listed in §6 below.

---

## 5. ADR index commented (38 entries)

ADRs grouped by sprint phase. Each line: `ADR-XXX — title — audit relevance (1-line)`.

### V1 original (ADR-001 → ADR-012)

| ADR | Title | Audit relevance |
|---|---|---|
| 001 | React 19 accepted | Out of scope (frontend stack). |
| 002 | 3-tx checkout, `createAndFund` deferred V1.5 | UX trade-off, no contract-level impact V1. |
| 003 | CIP-64 fee-in-USDT deferred V1.5 | MiniPay constraint, no contract code change V1. |
| 004 | Frontend-driven order sync deferred V1.5 | Superseded by J5 indexer; historical context only. |
| 005 | Buyer country defaults to cross-border | UX default, no contract gate. |
| 006 | 1-confirmation finality on Celo Sepolia | Trust assumption documented THREAT_MODEL §2.2. |
| 007 | USDT mainnet `approve(0)` reset-to-zero quirk | Mainnet-only; `EtaloCredits` uses `SafeERC20`; legacy paths first-allowance. |
| 008 | WhatsApp notifications stored, not sent V1 | Out of scope (off-chain side channel). |
| 009 | MiniPay native deep-link deferred | Out of scope (frontend). |
| 010 | Raw IPFS `og:image` V1 | Out of scope (frontend). |
| 011 | `X-Wallet-Address` header temporary | Backend auth, deprecated by ADR-034. |
| 012 | Wagmi v2 retained over v3 | Out of scope (frontend). |

### V1 Boutique pivot (ADR-013 → ADR-026)

| ADR | Title | Audit relevance |
|---|---|---|
| 013 | Proof of Ship submission deferred June 2026 | Project-management context, no code impact. |
| 014 | V1 pivot to multi-product Boutique model | Drives the ADR-015 hierarchy and `EtaloCredits` pricing. |
| 015 | Order / ShipmentGroups / Items hierarchy | Core data model — see THREAT_MODEL §3.5. |
| 016 | MiniPay dual-mode app | Out of scope (frontend). |
| 017 | 4×25% milestones removed for items+groups | Superseded by ADR-018, historical context. |
| 018 | Cross-border 20% / 70% / 10% release | Core release schedule — see THREAT_MODEL §1.3. |
| 019 | 7d intra / 14d cross-border auto-refund | Inactivity deadlines — `triggerAutoRefundIfInactive`. |
| 020 | 3-tier seller stake structure | Core stake gate — see THREAT_MODEL §3.2. |
| 021 | 14-day withdrawal cooldown + dispute freeze | `pauseWithdrawal` / `resumeWithdrawal` reference-counting. |
| 022 | Non-custodial positioning (Zenland / Circle) | The four criteria audited in scope — THREAT_MODEL §1.1. |
| 023 | `forceRefund` 3 codified conditions | Critical admin gate — THREAT_MODEL §3.5. |
| 024 | 3-treasury wallet split | `commissionTreasury` / `creditsTreasury` / `communityFund`, immutable on Credits. |
| 025 | Phased audit strategy | This audit is Phase 3; ADR-038 + Immunefi (Phase 4). |
| 026 | Hardcoded architectural limits | All caps in THREAT_MODEL §6 with .sol line numbers. |

### J4 contracts V2 — fix-driven cluster (ADR-027 → ADR-033)

| ADR | Title | Audit relevance |
|---|---|---|
| 027 | SPEC §12 canonical naming + `setStakeContract` wiring | Cosmetic naming consistency, no security impact. |
| 028 | Stake auto-downgrade + `topUpStake` + orphan drain | `_supportedTier` cascade — THREAT_MODEL §3.2. |
| 029 | **Self-audit fix** — N3 refund cap = `remainingInEscrow` | 2-line fix at `EtaloDispute.resolveFromVote:327-328`. |
| 030 | **Self-audit fix** — Dispute = sole authority for `recordDispute` | Eliminates J4 Block 8 double-count regression. |
| 031 | **Self-audit fix** — auto-refund blocked on `Disputed` items | Foundry `invariant_NoUnexpectedReverts:199` regression guard. |
| 032 | **Self-audit fix** — strict CEI on all fund-moving functions | 5 Slither Medium fixed; CEI everywhere + `ReentrancyGuard`. |
| 033 | **Self-audit fix** — orphan stake recovery (V1.5 patch shipped J8 Block 1) | `topUpStake` + `upgradeTier` relaxed to `stake > 0`. |

### J5–J8 sprints (ADR-034 → ADR-038)

| ADR | Title | Audit relevance |
|---|---|---|
| 034 | EIP-191 backend auth deprecated | Backend-side auth migration, no contract impact. |
| 035 | Single Next.js app at etalo.app | Out of scope (deployment architecture). |
| 036 | `X-Wallet-Address` extended to seller CRUD | Backend-side, extends ADR-011, no contract impact. |
| 037 | J7 architectural choices (Playwright + hybrid credits + 5 templates + EN/SW) | `EtaloCredits` design rationale — THREAT_MODEL §3.6. |
| 038 | Multisig strategy V1 / mainnet | V1 Sepolia single-key rehearsal; 2-of-3 Safe pre-mainnet. |

---

## 6. Deployment artifacts (Celo Sepolia)

**Network**: Celo Sepolia (chain ID `11142220`).
**Deploy date**: 2026-04-24 (V2 contracts) + 2026-04-26 (`EtaloCredits`).
**Mainnet**: TBD pre-J12 per ADR-038. Multisig and ownership rotation precede the first real-USDT transaction.

### Core contracts

| Contract | Address | CeloScan | Blockscout | Sourcify |
|---|---|---|---|---|
| `MockUSDT` (V2 test-only) | `0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3` | [src](https://sepolia.celoscan.io/address/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3#code) | [src](https://celo-sepolia.blockscout.com/address/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3) |
| `EtaloReputation` | `0x2a6639074d0897c6280f55b252B97dd1c39820b7` | [src](https://sepolia.celoscan.io/address/0x2a6639074d0897c6280f55b252B97dd1c39820b7#code) | [src](https://celo-sepolia.blockscout.com/address/0x2a6639074d0897c6280f55b252B97dd1c39820b7#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0x2a6639074d0897c6280f55b252B97dd1c39820b7) |
| `EtaloStake` | `0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417` | [src](https://sepolia.celoscan.io/address/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417#code) | [src](https://celo-sepolia.blockscout.com/address/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417) |
| `EtaloVoting` | `0x335Ac0998667F76FE265BC28e6989dc535A901E7` | [src](https://sepolia.celoscan.io/address/0x335Ac0998667F76FE265BC28e6989dc535A901E7#code) | [src](https://celo-sepolia.blockscout.com/address/0x335Ac0998667F76FE265BC28e6989dc535A901E7#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0x335Ac0998667F76FE265BC28e6989dc535A901E7) |
| `EtaloDispute` | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` | [src](https://sepolia.celoscan.io/address/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE#code) | [src](https://celo-sepolia.blockscout.com/address/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE) |
| `EtaloEscrow` | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` | [src](https://sepolia.celoscan.io/address/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb#code) | [src](https://celo-sepolia.blockscout.com/address/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb) |
| `EtaloCredits` | `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` | [src](https://sepolia.celoscan.io/address/0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d#code) | [src](https://celo-sepolia.blockscout.com/address/0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d#code) | [src](https://sourcify.dev/server/repo-ui/11142220/0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d) |

### Treasuries (ADR-024 — three-wallet separation)

| Role | Address |
|---|---|
| `commissionTreasury` | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| `creditsTreasury` | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| `communityFund` | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

Full deployment metadata (constructor args, setter event tx hashes, mint receipt, ghost-tx note for setter #7) lives in `packages/contracts/deployments/celo-sepolia-v2.json`. Deploy total: 6 deploys + 17 inter-contract setters + 1 mint = 24 transactions, ~0.66 CELO.

---

## 7. Communication channel and cadence

**Primary channel**: email — `swappilot.exchange@gmail.com`
- Signal on request for urgent / synchronous discussion (DM the email above to exchange Signal handles).

**Cadence**: async preferred. Response window 24–48 hours on working days (Belgium UTC+1 / UTC+2). Working week Monday–Friday; weekends are best-effort.

**Repo access**: read-only GitHub collaborator on `BacBacta/Etalo` available on demand — request with the GitHub username at engagement kickoff. Push access remains with Mike.

**Status updates**: weekly check-in cadence proposed during the audit window; ad-hoc when a finding requires synchronous clarification.

---

## 8. Known limitations checklist

Telegraphic format: each item is a deliberate V1 boundary already documented elsewhere — they are not findings.

- **ADR-038** — V1 Sepolia ownership = deployer single-key EOA. 2-of-3 Safe deferred to mainnet pre-J12. Hardware wallet pending.
- **ADR-033 V1.5** — `topUpStake` / `upgradeTier` orphan-stake recovery shipped J8 Block 1 on `feat/pre-audit-v2`. Sepolia not redeployed; diff visible in this branch.
- **ADR-034** — EIP-191 backend auth deprecated. `lib/eip191.ts` + `app/auth.py` flagged for removal pre-Proof-of-Ship.
- **ADR-002** — single-tx `createAndFund` checkout deferred V1.5 (MiniPay does not bundle).
- **ADR-003** — CIP-64 fee-in-USDT deferred V1.5 (separate adapter contract needed).
- **ADR-007** — USDT mainnet `approve(0)` reset-to-zero quirk handled in `EtaloCredits`; legacy paths first-allowance only.
- **ADR-022** — non-custodial criteria locked V1; multisig sub-decision superseded by ADR-038 for the Sepolia phase.
- **ADR-026** — architectural caps immutable V1; lifting any cap requires redeploy with explicit user communication.
- **ADR-036** — backend reads use `X-Wallet-Address` header in V1; SIWE / EIP-4361 sessions deferred V1.5+.
- **Indexer** — 25 event handlers remain to wire (Dispute lifecycle + Stake withdrawal pause/resume), WebSocket subscriptions and reorg-erase detection deferred V1.5.
- **KYC / AML** — compliance layer deferred V2+; V1 ships with no on-protocol identity gate.
- **Out-of-scope surface** — frontend, backend (FastAPI), IPFS pinning, Anthropic API, MiniPay WebView, Twilio. See THREAT_MODEL.md §10.

---

## 9. Self-audit findings recap

Five fix-driven ADRs caught between Sprint J4 and Sprint J7, all before external audit. Full bug / fix / regression-guard analysis lives in THREAT_MODEL.md §8.

- **ADR-029 (J4 Block 8)** — N3 vote `refundAmount` uncapped vs `remainingInEscrow`.
- **ADR-030 (J4 Block 8)** — `recordDispute` double-counted via Escrow + Dispute paths.
- **ADR-031 (J4 Block 9 Foundry)** — `triggerAutoRefundIfInactive` ignored `Disputed` items, producing orphan disputes.
- **ADR-032 (J4 Block 10 Slither)** — five `reentrancy-no-eth` Medium findings, refactored to strict CEI.
- **ADR-033 (J4 Block 12 testnet smoke)** — post-slash recovery gap; V1.5 patch shipped J8 Block 1.

**Methodology**: STOP → diagnose → fix → ADR → regression guard. The pattern is the reason no `forceRefund` or `emergencyPause` invariant escaped the J4–J7 self-audit.

---

## 10. FAQ — anticipated questions

**Q1. Why are cross-contract refs settable instead of `immutable`?**
Deployment ordering forces forward references that no constructor can satisfy in a single transaction (Reputation must exist before Stake; Escrow must exist before Dispute can `setEscrow`). Setters are called once at deploy time, every setter emits an event, and ownership transfers to the multisig pre-mainnet (ADR-038). After ownership transfer, every setter call becomes a governance action — the boundaries are effectively immutable for V1's lifetime. See THREAT_MODEL.md §4.5.

**Q2. Why no multisig in V1 Sepolia?**
The lead developer does not yet own a hardware wallet (acquisition planned Q3 2026). A 2-of-3 Safe with two software keys held by the same person is theatre, not defense. ADR-038 codifies the deferral: V1 Sepolia stays on the deployer EOA (testnet, no real-USDT exposure); the 2-of-3 Safe is deployed on Celo mainnet pre-J12 with the hardware wallet as a load-bearing signer.

**Q3. Why is `EtaloEscrow` so large (1146 LOC, 21,465 bytes runtime)?**
The contract orchestrates orders, items, groups (ADR-015 hierarchy), the cross-border 20/70/10 release schedule (ADR-018), forceRefund (ADR-023), legalHold registry, emergencyPause (ADR-026), and the auto-refund permissionless triggers. Optimizer is set to 200 runs (clarity-favoring trade-off). Runtime size is **87.3% of the Spurious Dragon 24,576-byte limit** (margin ~3.04 KB) — comfortable for V1; any V1.5 feature will trigger the size guard test (`test/size-guard.test.ts`).

**Q4. Why USDT 6 decimals everywhere instead of normalizing to 18?**
Native USDT precision on Celo mainnet (and the MockUSDT V2 mirror on Sepolia) is 6 decimals. Normalizing internally to 18 would multiply storage cost on every order amount and require reverse normalization at every transfer boundary. The 6-decimal convention is preserved end-to-end; the frontend handles display formatting. See ADR-007 for the SafeERC20 mainnet quirk.

**Q5. How is the non-custodial claim verified on-chain?**
ADR-022 lists four publicly verifiable criteria: (1) funds in public smart contracts on Celo, (2) source verified on three independent explorers (CeloScan, Blockscout, Sourcify — see §6), (3) admin power structurally bounded by code (`forceRefund` requires three conditions per ADR-023, `emergencyPause` has 7-day auto-expiry + 30-day cooldown per ADR-026, every admin function emits an event), (4) disputes terminate through a permissionless three-level chain (N1 / N2 / N3) — see THREAT_MODEL.md §1.1 for the full criteria and §3 for per-contract code-side verification.
