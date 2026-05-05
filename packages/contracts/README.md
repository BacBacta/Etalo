# Etalo Smart Contracts — Solidity 0.8.24 + Hardhat

Non-custodial USDT escrow + reputation + dispute resolution for the Etalo MiniPay marketplace on Celo.

Funds live in public smart contracts ; mediator power is structurally bounded by code (Zenland / Circle non-custodial standard, see ADR-022).

## Contracts

| Contract | Role | V1 status |
|---|---|---|
| **EtaloEscrow** | Per-seller boutique orders + USDT escrow lifecycle (intra-Africa V1) | Live Sepolia V2 |
| **EtaloReputation** | Seller score tracking + badges (`new_seller`, `active`, `suspended`) | Live Sepolia V2 |
| **EtaloDispute** | N1/N2/N3 dispute escalation with `forceRefund` codified gates (ADR-022, ADR-023) | Live Sepolia V2 |
| **EtaloCredits** | Asset generator credits ledger (0.15 USDT/credit per ADR-014, J7 sprint) | Live Sepolia V2 |
| **EtaloStake** | Cross-border seller stake tiers | **DEFERRED V2** per ADR-041 (V1 intra-only, no stake) |
| **EtaloVoting** | Dispute level 3 community jury | **DEFERRED V2** per ADR-041 |

Architectural limits hardcoded (ADR-026) : `MAX_ORDER = 500 USDT`, `MAX_TVL = 50_000 USDT`, `MAX_SELLER_WEEKLY = 5_000 USDT`, `EMERGENCY_PAUSE_MAX = 7 days`.

## Sepolia testnet addresses (V2 — current dev target)

| Contract | Address |
|---|---|
| MockUSDT | `0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3` |
| EtaloReputation | `0x2a6639074d0897c6280f55b252B97dd1c39820b7` |
| EtaloStake (V2 deferred) | `0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417` |
| EtaloVoting (V2 deferred) | `0x335Ac0998667F76FE265BC28e6989dc535A901E7` |
| EtaloDispute | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` |
| EtaloEscrow | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` |
| EtaloCredits (J7) | `0xb201a5F0D471261383F8aFbF07a9dc6584C7B60d` |

Treasury wallets (separated per ADR-024) :

| Wallet | Address |
|---|---|
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

## Mainnet addresses (Celo — V1 production target Q2 2027)

| Contract | Address |
|---|---|
| USDT token | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |
| USDT adapter (gas fees) | `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` |
| Etalo contracts | TBD — deploy Sprint J12 mainnet launch |

## Critical rules (do not break)

1. USDT has 6 decimals — never use `parseEther` / `formatEther`
2. NEVER use EIP-1559 transactions — MiniPay only accepts legacy + CIP-64 (type 0x7b)
3. Every contract function moving funds must use ReentrancyGuard
4. `forceRefund` gated by THREE codified conditions (ADR-023) : dispute contract inactive + 90+ days order inactivity + registered legal hold

## Dev workflow

```bash
pnpm install                              # or npm ci
npx hardhat compile
npx hardhat test                          # Hardhat unit tests
npx hardhat coverage                      # Coverage report
forge test --match-path 'test/**/*.t.sol' # Foundry invariants
```

## Deploy

Deployment scripts live in `scripts/deploy-*.ts`. See [`../../docs/DEPLOY_RUNBOOK.md`](../../docs/DEPLOY_RUNBOOK.md) for the full deployment + verification procedure (Sepolia + Mainnet).

## Audit + security

- Threat model + audit firm briefing : [`../../docs/SECURITY.md`](../../docs/SECURITY.md)
- ADR-022 — Non-custodial positioning rationale : [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md)
- ADR-023 — `forceRefund` codified gates : [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md)
- ADR-024 — 3 separated treasury wallets : [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md)
- ADR-026 — Architectural hardcoded limits : [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md)
- ADR-041 — V1 scope intra-only + 4-market big bang : [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md)

## Pointers

- Repo root [README](../../README.md) — project overview + tech stack + sprint status
- [`../../docs/SMART_CONTRACTS.md`](../../docs/SMART_CONTRACTS.md) — comprehensive contracts technical reference
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI agent context with full address tables + critical rules
