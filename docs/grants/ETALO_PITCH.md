# Etalo — Grant Application Pitch (Master Doc)

> Reusable 1-pager for grant applications. Each section is structured
> so you can copy-paste into Proof of Ship S2 (Mini App builders),
> Prezenti Anchor Round (milestone grants), and any future Celo
> funding program with minimal rewrites. Per-program tailoring notes
> live at the bottom in the *Program adaptations* section.
>
> Last updated : 2026-05-22 (pre-J12 mainnet).

---

## One-line pitch

**Etalo turns informal Instagram/WhatsApp/TikTok sellers across
Africa into a real 24/7 shop — with USDT escrow and buyer protection
on Celo, distributed natively through MiniPay.**

---

## Problem

300M+ informal African sellers run their business out of social
DMs : a buyer messages on WhatsApp at 3 AM, the seller's asleep,
the sale is lost. When the buyer does reach the seller, payment is
mobile-money-only (high friction across borders) and there's no
escrow — the buyer ships cash hoping the seller delivers, or vice
versa. Disputes are unmediated word-of-mouth ; chargebacks don't
exist.

The **stablecoin payment rail** exists (15M+ MiniPay wallets, 300M+
stablecoin txs, 60+ countries) but the **commerce surface that
makes it usable for non-crypto-native sellers** does not. Sellers
need a real boutique URL they can drop into their bio, a real cart,
real auto-release escrow — without ever touching the word "wallet"
or "smart contract".

---

## Solution

Etalo is a 3-pillar Mini App :

1. **Per-seller Boutique** at `etalo.app/[handle]` — a real public
   storefront with catalog, cart, grouped checkout. Buyers without
   MiniPay land here from the seller's Instagram bio link, see
   products, can pay.
2. **Dual-mode MiniPay app** — buyers shop, sellers manage orders,
   all in the same Mini App. Auto-connected, zero-click, no
   "Connect Wallet" button (per MiniPay best practices).
3. **Asset generator** (monetized) — credit-based product-photo
   enhancement (BiRefNet background removal + composite square crop).
   0.15 USDT/credit. Sellers post studio-quality photos from a phone.

USDT moves through a non-custodial **on-chain escrow** :
- Buyer funds, USDT held by `EtaloEscrow` contract on Celo
- Seller ships, 3-day auto-release timer starts
- Dispute path : juror-voting via `EtaloDispute` + `EtaloVoting`
- Hard caps prevent contract-level risk : `MAX_ORDER = 500 USDT`,
  `MAX_TVL = 50,000 USDT`, `MAX_SELLER_WEEKLY = 5,000 USDT` (ADR-026)

Non-custodial per the Zenland / Circle standard (ADR-022) — funds
live in public verifiable contracts ; mediator power is structurally
bounded.

---

## Why Celo, why MiniPay, why now

- **Celo as L2** (since March 2025) — sub-cent fees, 1s blocks,
  CIP-64 fee abstraction means buyers pay gas in USDT (not CELO they
  don't have). The whole UX is invisibly Web2-feeling.
- **MiniPay as distribution** — 15M wallets pre-installed on Opera
  Mini across Africa, with a Mini App directory. Etalo doesn't
  need to acquire users from scratch ; we ride the wallet's existing
  pipe to the exact target demographic.
- **Now** — Mento stablecoins + USDT/USDC adapter for fee
  abstraction matured this cycle. Pre-2025 the UX gap (CELO-for-gas
  prompt) was a non-starter for non-crypto users ; that gap is
  closed and the moat shifts to product/merchant onboarding —
  exactly the layer Etalo is building.

---

## Traction (as of 2026-05-22)

- **V2 contracts** deployed and audited on Celo Sepolia
  ([Pashov audit reports](https://github.com/BacBacta/Etalo/tree/main/docs/audit)
  on Escrow / Dispute / Stake / Reputation / Credits). Post-redeploy
  H-1 (ADR-042) addresses live at `etalo.xyz`.
- **Frontend live** at https://etalo.xyz — public boutique surface
  + Mini App surface in a single Next.js app (ADR-035). MiniPay
  detection, silent reconnect (no popup), WalletConnect Phase 2 for
  non-injected mobile Chrome users.
- **Backend live** on Fly.io ([etalo-api.fly.dev](https://etalo-api.fly.dev))
  — FastAPI + Celo indexer (sole writer to on-chain mirror tables per
  V2 invariant), backed by Supabase Postgres.
- **Pre-mainnet security pass** (2026-05-22) closed 2 HIGH-severity
  findings (XSS via JSON-LD ; delivery-address spoof on funded
  orders) before mainnet deploy.
- **MiniPay submission readiness** : 11 of the 14 Stage 2 checklist
  items already satisfied (zero-click connect, no signed messages,
  no raw addresses, MiniPay copy compliance, 360×640 viewport,
  contracts audited, Add Cash deeplink, ToS/Privacy pages, app
  branding, support channel, single-tx-flow optimisations).
- **CIP-64 fee abstraction wired** (`asTxOptions` wrapper, USDT
  adapter `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`) — env-gated
  for the J12 mainnet flip.

---

## Roadmap

| Sprint | What ships | Date |
|---|---|---|
| **J12** (now) | Mainnet contract deploy, frontend chain switch, Celoscan verification, multisig ownership transfer | 2026-Q2 |
| **J12 listing** | MiniPay intake form + first-call + Stage 2 readiness form → live in MiniPay discovery | 2026-Q2 / Q3 |
| **V1 launch** | 4-market big-bang : NGA, GHA, KEN, ZAF (ADR-041) | 2026-Q3 |
| **V1.5** | Top-Seller program (1.2% rate), CIP-64 always-on, photo-enhancement asset gen monetisation | 2026-Q4 |
| **V2** | Cross-border (ADR-019), seller stake (ADR-021), full reputation surface | 2027-H1 |

---

## Team

**Mike (solo dev)** — based in Belgium, Cameroonian roots. Full-stack
+ smart contract. Speaks French, English, and the lived experience of
the African informal commerce target market.

Plan for V1.5+ : 1 community manager (Africa-based), 1 dispute juror
coordinator. Until then, Mike's own time is the constraint — which is
why this grant matters now.

---

## Ask

### For Proof of Ship S2 ($20K USDT, monthly cohort, MiniPay focus)

- **Use of funds** :
  - 60% — runway (full-time on Etalo through Q3 launch + initial
    seller onboarding handholding)
  - 25% — first-1000-sellers acquisition (subsidised onboarding,
    photo enhancement credits, WhatsApp community manager)
  - 15% — mainnet ops (multisig HW wallets, monitoring tooling
    Tenderly Pro, indexer hosting reserve)
- **Shipping commitments** for the cohort cycle :
  - Month 1 : J12 mainnet live + MiniPay intake submitted
  - Month 2 : First 100 seller boutiques live, first 1000 buyer
    transactions
  - Month 3 : Top-Seller program V1.5 + cross-border V2 scoping
- **Reputation hooks** : public stats page (`/stats`) surfacing
  DAU/MAU, tx volume per stablecoin, failed-tx rate, retention —
  reviewable by program judges every month.

### For Prezenti Anchor Round ($25K, milestone-based, 4-6 week review)

- **Milestone 1** ($10K, by Aug 2026) : J12 mainnet live, all V2
  contracts deployed + ownership transferred to multisig, first 50
  seller boutiques operational across 4 markets.
- **Milestone 2** ($10K, by Oct 2026) : 1000 cumulative on-chain
  buyer transactions, < 5% dispute rate, MiniPay official listing
  approved.
- **Milestone 3** ($5K, by Dec 2026) : Top-Seller program V1.5
  shipped, monthly recurring sellers > 200, public stats dashboard
  live for ecosystem visibility.

### For Celo Builder Fund ($25K cUSD, investment-flavoured)

Hold off until V1 launch traction (1000+ sellers, $50K+ monthly
volume). Builder Fund makes sense as a Series A-flavoured
follow-on, not a seed.

---

## Links

- **Live app** : https://etalo.xyz (Celo Sepolia until J12 mainnet)
- **Backend** : https://etalo-api.fly.dev
- **Code** : https://github.com/BacBacta/Etalo (private)
- **Pashov audits** : `docs/audit/PASHOV_AUDIT_*.md` in repo
- **Pre-mainnet ops checklist** : `docs/audit/PRE_MAINNET_OPS.md`
- **ADR log** : `docs/DECISIONS.md` (50+ architectural decisions
  tracked since J0)
- **MiniPay submission status** : pre-intake, target submission
  post-J12 mainnet (sequence rationale in
  `docs/audit/PRE_MAINNET_OPS.md`)

---

## Program adaptations

When pasting into a specific program's form, tweak :

### Proof of Ship S2
- Emphasise **shipping cadence + measurable Mini-App-specific
  metrics** (DAU, conversion, retention). The program rewards
  observable progress, not future promises.
- Foreground the *MiniPay-listing-readiness* angle. Other applicants
  may not have done the 14-item Stage 2 audit ; that's a moat.
- Frame the ask as month-by-month deliverables, not a lump sum.

### Prezenti Anchor
- Emphasise **milestones + 4-6 week review fit** : your milestones
  are concrete (mainnet deploy, tx counts, listing approval), each
  reviewable in that window.
- Highlight the *community* dimension : 4-market intra-Africa launch
  serves a community Celo wants to grow.
- Use ADR-026 hard caps + Pashov audit as the technical maturity
  signal.

### Future Celo Foundation / regional programs
- Lean into the **African operator + non-crypto-native target market**
  angle — that combo is rare in the Celo grants pipeline and is a
  differentiator the team specifically tracks.

---

*Maintenance : update Traction section after each major sprint, swap
links/dates in Roadmap as they slip, and adjust dollar splits in Ask
section to match the current runway burn rate.*
