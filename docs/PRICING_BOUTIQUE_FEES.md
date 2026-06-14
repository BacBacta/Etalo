# Boutique fees — pricing model (ADR-059)

**Status:** V1. One-time fee only. No subscription.
**Anchor ADR:** ADR-059 (amends ADR-024 treasury, refines ADR-041).

## The fee

| Fee | Amount | When | Recurrence |
|-----|--------|------|------------|
| Boutique creation | **1 USDT** (`CREATION_FEE = 1_000_000`, 6 decimals) | Once, when a wallet opens its first boutique | One-shot per wallet — never recurring |

There is **no monthly/maintenance fee**. A recurring "1.5 USDT/month"
subscription was proposed and **dropped** (ADR-059): Etalo is
non-custodial, so a monthly charge would be a *push* payment the seller
must remember to make or fall into a suspended state — unacceptable
churn/friction for informal sellers. A single one-time fee keeps the
anti-spam / skin-in-the-game intent without the recurring trap, and
keeps ADR-041's "no subscription" stance literally true.

This is separate from:
- the **1.8% order commission** (ADR-041), and
- **credits** for photo enhancement (0.15 USDT/credit, ADR-049,
  `docs/PRICING_MODEL_CREDITS.md`).
- the **network fee** (Celo gas), paid in USDT via MiniPay by the payer.

## How it's collected

On-chain, mirroring `EtaloCredits`:

- `EtaloBoutiqueBilling.payCreationFee()` pulls 1 USDT via
  `SafeERC20.safeTransferFrom(seller → commissionTreasury)`, sets
  `creationPaid[seller] = true` (one-shot guard), emits
  `CreationFeePaid(seller, timestamp)`.
- Treasury = **`commissionTreasury`** (ADR-059 amends ADR-024 — boutique
  fees share the commission slot; on mainnet that's the 2-of-3 Safe).
- `Ownable` + `Pausable` + `ReentrancyGuard`. Contract carries **no
  date** — the promo window is enforced off-chain.

## Free window — Proof of Ship

"Creation is free, and free for 2 months" is a **global** promo enforced
off-chain by one config value:

- Backend `FEES_ENFORCED_FROM` (ISO 8601, tz-aware) +
  `NEXT_PUBLIC_FEES_ENFORCED_FROM`.
- While `now < FEES_ENFORCED_FROM`: boutique creation is free, the
  contract is never called. Set this to **submission date + 60 days** at
  launch.
- Empty/unset (default) = **fees not enforced** (free indefinitely) —
  the safe default so nobody is charged before the date is set.

## Enforcement flow (after the free window)

1. `POST /onboarding/complete` calls `require_creation_fee_paid` (ADR-059
   gate). If enforced and the wallet has no `boutique_billing` row with
   `creation_paid_at`, it returns **402 `creation_fee_required`** (with
   `fee_usdt`). No User/SellerProfile row is written.
2. Frontend (`CreateShopForm`) catches the 402 → shows the one-time fee
   panel → `useBoutiqueCreationFee` runs `approve` + `payCreationFee`.
3. The indexer mirrors `CreationFeePaid` into `boutique_billing`
   (sole writer, invariant #14).
4. Frontend retries onboarding with a short backoff to absorb indexer
   lag; once the mirror row exists, the gate passes and the boutique is
   created.

There is **no read-only / suspension** state anywhere — ADR-059 dropped
the only feature that needed one (the monthly fee). An unpaid wallet
simply can't *create* a boutique once fees are enforced; existing
boutiques are never gated.

## Deployment

- Contract: `packages/contracts/contracts/EtaloBoutiqueBilling.sol`
  (+ 18 Hardhat tests).
- Sepolia: `npx tsx scripts/deploy-boutique-billing-sepolia.ts` (records
  the address in `deployments/celo-sepolia-v2.json`), then set
  `NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS` + `ETALO_BOUTIQUE_BILLING_ADDRESS`.
- Mainnet: a **Safe operation** (not broadcast by an agent).
  `commissionTreasury` arg = the Safe. After deploy, set the two address
  env vars (Vercel + Fly) and `FEES_ENFORCED_FROM` /
  `NEXT_PUBLIC_FEES_ENFORCED_FROM` to submission-date + 60 days.

## Config summary

| Key | Where | Meaning |
|-----|-------|---------|
| `etalo_boutique_billing_address` / `NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS` | Fly / Vercel | Contract address (empty until deployed → indexer skips, no fee UI) |
| `fees_enforced_from` / `NEXT_PUBLIC_FEES_ENFORCED_FROM` | Fly / Vercel | Free-window cutoff (ISO 8601). Empty = free |
