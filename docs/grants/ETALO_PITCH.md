# Etalo — Master Pitch (Grants & Funding)

> **Reusable application doc.** Each section is self-contained for
> copy-paste into any program form. Per-program tailoring at the
> bottom in *Program adaptations*. `[TBD: Mike]` markers are where
> inventing would be dishonest — you need to fill those.
>
> *Last updated : 2026-05-22 (V3 — post-codebase reality check ;
> earlier drafts had several over-claims around audit + listing
> status that this version corrects).*

---

## Executive summary

| | |
|---|---|
| **What** | Non-custodial social-commerce Mini App for African sellers. USDT escrow + buyer protection, built on Celo, optimised for distribution through MiniPay's Mini App directory. |
| **Tagline** | *Your digital stall, open 24/7.* |
| **Stage** | Pre-mainnet. V2 contracts deployed and internally audited on Celo Sepolia (chain 11142220). Mainnet deploy is the active **sprint J12**. |
| **Target market** | Informal Instagram / WhatsApp / TikTok sellers in **Nigeria, Ghana, Kenya, South Africa** (V1, ADR-041 big-bang). |
| **Distribution** | MiniPay Mini App directory (intake submission queued for J12) + injected wallets (MetaMask / Valora extension) + WalletConnect for mobile-Chrome buyers without a wallet extension. Multi-wallet repositioning lives in ADR-052. |
| **Traction (verifiable today)** | Frontend + backend + indexer live at `etalo.xyz` ; V2 contracts on Sepolia (post-H-1 redeploy 2026-05-05) ; 53 ADRs tracked since J0 ; 5 self-audit reports + 2 pre-mainnet HIGH findings closed ; CIP-64 USDT fee abstraction wired and feature-flagged for the J12 mainnet flip ; multi-wallet support live ; MiniPay zero-click + silent reconnect compliant. |
| **Ask (this round)** | $20K USDT (Proof of Ship S2) **or** $25K (Prezenti Anchor). See *Ask* section. |
| **Why now** | Three concurrent shifts opened the door : Celo became an L2 (March 2025), CIP-64 fee abstraction matured, MiniPay opened a Mini App directory. The commerce-surface layer for non-crypto-native African sellers is the gap Etalo fills. |

---

## The problem

### Concrete user pain

A textile seller in Lagos posts a dress on Instagram. A buyer DMs at
11 PM. The seller is asleep — by morning, the buyer has moved on,
or the photo has fallen down the feed. When the buyer does reach the
seller, they negotiate on WhatsApp, pay via mobile money (corridor-
specific, often blocked between markets), and ship without escrow.
There is no chargeback, no neutral dispute path, no audit trail.

Multiply this by ~85% of African non-agricultural employment, which
the ILO categorises as informal (ILO/WIESO 2022 dataset). The
platform gap is structural, not niche.

### Why existing solutions don't cover this surface

- **Jumia / Konga (centralised marketplaces)** — list-fee + 15-30%
  commission models that price out informal sellers ; opaque dispute
  resolution ; payment locked to single-corridor card or mobile
  money.
- **WhatsApp Business** — strong messaging surface, zero payment
  primitive ; trust is negotiated manually each transaction.
- **Shopify / WooCommerce** — designed for the formal economy ;
  Shopify Africa pricing starts at $24-$79/mo, non-trivial for a
  seller doing $200/month.
- **Existing crypto marketplaces** — built for crypto-native users.
  "Connect Wallet" prompts, gas in CELO / ETH, raw 0x… addresses
  shown as the user identifier. Non-starters for the target.

### Why Etalo can ship into this gap

- **Stablecoin escrow** (USDT) gives buyer + seller a neutral third
  party that isn't a bank or a marketplace operator.
- **MiniPay-native distribution** sidesteps the "first you must learn
  what a wallet is" cliff — Opera Mini already shipped MiniPay to
  ~15M African phones via the Mini App directory.
- **CIP-64 fee abstraction** means the buyer never sees CELO and
  never sees the word "gas" — sub-cent network fees paid in the
  same USDT they're spending.
- **Non-custodial per the Zenland / Circle standard** (ADR-022) —
  funds live in public verifiable contracts, mediator power is
  structurally bounded by code.

---

## The product

### Three integrated surfaces (single Next.js app at `etalo.xyz`, ADR-035)

1. **Per-seller boutique** at `etalo.xyz/[handle]` and product page
   `etalo.xyz/[handle]/[slug]` — public-funnel storefront, no wallet
   required to browse. Buyers land from the seller's Instagram /
   TikTok bio link, see full catalog + cart + checkout. SSR + JSON-
   LD + per-product OG images for social-share distribution.
2. **Marketplace + cart + checkout** — `/marketplace` with country
   filter chips (NGA / GHA / KEN, ZAF added in J12) and Tabler
   category icons. Inline checkout (ADR-050) writes the delivery
   address directly into `Order.delivery_address_snapshot` JSONB
   (no separate address-book row required) — sessionStorage
   pre-fill of the last-used address handles the repeat-checkout
   case.
3. **Seller dashboard + asset generator** — `/seller/dashboard` with
   Overview / Products / Orders / Profile tabs ; in-flow "Enhance
   photo · 1 credit" button on AddProductForm (ADR-049 pivot) using
   BiRefNet bg-removal + Pillow composite to a 2048×2048 white
   square. 0.15 USDT/credit, welcome 3 credits. Deferred V1.5 :
   5-template marketing pack (UI flagged off behind
   `NEXT_PUBLIC_ENABLE_MARKETING_TAB=false`).

### The escrow flow (V1)

```
Buyer funds order      →  USDT held by EtaloEscrow on Celo (3 txs: 
                          approve → createOrderWithItems → fundOrder)
Seller ships group     →  Marks shipped on-chain, 3-day auto-release
                          timer starts per item (ADR-041 intra-only)
Buyer confirms         →  Immediate release ; OR
Buyer doesn't act      →  Permissionless auto-release after 3 days ; 
                          anyone can trigger
Buyer disputes (rare)  →  On-chain dispute primitives (N1 amicable,
                          N2 mediator, N3 community vote) exist in 
                          EtaloDispute + EtaloVoting ; V1 buyer UI 
                          ships `OpenDisputeButton` (dispute trigger 
                          + N1 message thread). Full N2/N3 juror UI 
                          is V1.5 scope.
Force refund           →  Owner-callable but gated by 3 codified 
                          conditions (ADR-023) — dispute contract 
                          inactive + 90+ days inactivity + legal hold 
                          registry. Cannot be triggered ad-hoc.
```

### Architecture choices that bound risk

- **Hard caps (ADR-026, hardcoded)** : `MAX_ORDER = 500 USDT`,
  `MAX_TVL = 50,000 USDT`, `MAX_SELLER_WEEKLY = 5,000 USDT`,
  `EMERGENCY_PAUSE_MAX = 7 days`. These cap the worst-case exploit
  blast radius below $50K — the right posture for V1 mainnet before
  a firm audit ; lifted in V1.5+ as the audit-and-insurance surface
  matures.
- **3 separated treasuries (ADR-024)** : `commissionTreasury`,
  `creditsTreasury`, `communityFund` are distinct on-chain wallets,
  never merged, individually addressable in events. A rugpull
  pattern that merges-then-drains is structurally impossible.
- **V2 invariant : indexer-sole-writer** — the indexer is the only
  process that writes to on-chain mirror tables (orders, items,
  shipment_groups, disputes, stakes, reputation_cache). Single-
  machine Fly.io deployment (`auto_stop_machines=off`, `min=max=1`)
  makes this enforceable. API handlers can only append to off-chain
  JSONB columns. Eliminates a whole class of split-brain bugs.
- **`forceRefund` 3-condition gate (ADR-023)** : even the contract
  owner cannot drain an active order. Three conditions must all
  hold simultaneously and at least one is verifiable off-chain
  (legal hold registry). Concrete trust mechanism, not just a
  promise.

---

## What's actually shipped vs deferred (honest scoreboard)

### Shipped to V1

| Capability | Surface | Status |
|---|---|---|
| Self-service seller onboarding | `CreateShopForm` | ✅ Live |
| Public boutique pages with SSR + JSON-LD + OG images | `/[handle]` + `/[handle]/[slug]` | ✅ Live |
| Marketplace + country / category filter chips | `/marketplace` | ✅ Live |
| Cart + 3-tx checkout (approve / create / fund) | `CheckoutFlow` | ✅ Live |
| Inline delivery-address (ADR-050) with recipient_name + area + country-specific labels | `InlineDeliveryAddressForm` | ✅ Live |
| Buyer order list + detail | `/orders`, `/orders/[id]` | ✅ Live |
| Confirm delivery / claim refund buttons | `ConfirmDeliveryButton`, `ClaimRefundButton` | ✅ Live |
| Seller dashboard (Overview / Products / Orders / Profile) | `/seller/dashboard` | ✅ Live |
| Photo enhancement (BiRefNet + Pillow composite) | `enhance-photo` endpoint + AddProductForm | ✅ Live |
| Credit purchase via EtaloCredits | `BuyCreditsDialog` | ✅ Live (Sepolia, ready for mainnet) |
| MiniPay zero-click auto-connect + silent reconnect | `useMinipay`, `SilentReconnectGate` | ✅ Live |
| Multi-wallet : injected (MetaMask, Valora extension) + WalletConnect | `ConnectWalletButton`, `wagmi-config` | ✅ Live (ADR-052, PR #32) |
| CIP-64 USDT fee abstraction | `lib/tx.ts:asTxOptions()` | ✅ Wired, gated by `NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED` — flip at J12 mainnet |
| Dispute trigger from buyer | `OpenDisputeButton` | ✅ Live |
| Dispute backend (photos, message threads) | `routers/disputes.py` | ✅ Live |
| Admin dispute resolution path | `routers/admin.py` | ✅ Live (operator surface, V1) |

### Built into contracts but UI deferred V1.5

| Capability | Why deferred | Trigger to ship |
|---|---|---|
| N1 amicable settlement UI | Low-complexity dispute path, V1 uses message thread + admin path | Volume signal (>5 disputes/month) |
| N2 mediator UI | No mediator panel yet, admin acts as mediator V1 | V1 dispute-rate data + mediator approval flow |
| N3 community-vote UI | EtaloVoting contract deployed Sepolia but vote-cast surface not built | Stake-weighted voter base requires Top Seller program V1.1 |
| Seller stake tier UX | ADR-041 deferred V2 (no stake required for V1 sellers) | V2 cross-border activation |
| 5-template marketing pack | ADR-049 pivot to photo-enhancement-only | Data on photo-enhancement adoption + V1.5 marketing budget |

### V1.5+ explicit deferrals

- **Cross-border transactions** (ADR-041) — V1 intra-Africa only.
  Cross-border contracts and UI exist in branch history but are not
  wired in V1.
- **Top Seller program** (1.2% rate ; deferred V1.1) — single 1.8%
  rate V1.
- **WhatsApp notifications** (Twilio integration) — backend service
  exists as a stub returning `{"status": "stub"}`. Tracked as
  FU-J11-007 for V1.5.
- **MiniPay phone-number country auto-detection** — MiniPay does not
  yet expose phone country to Mini Apps. Stubbed pending MiniPay
  team response.

### Known transitional tech debt (gated before mainnet)

- **`ENFORCE_JWT_AUTH=false` on Sepolia backend** (ADR-046) —
  current testnet posture explicitly allows X-Wallet-Address header
  spoofing. **Hard requirement to flip to `true` before J12 mainnet
  deploy.** Documented in ADR-046 and the J12 sprint checklist.
- **Single-key contract ownership** (deployer EOA) — V2 contracts
  on Sepolia owned by the deployer EOA. Pre-mainnet operational
  task : transfer ownership to a 2/3 (or 3/5) Safe multisig per
  `docs/audit/PRE_MAINNET_OPS.md`. Hardware wallets are part of the
  grant ask.

This scoreboard is the honest version — claim more, you lose
credibility with reviewers who'll find the gap in 5 minutes ;
claim this, you show you know what you've built and what's next.

---

## Market sizing

> All numbers are public-source estimates or order-of-magnitude
> approximations. Treat as the floor of a serious conversation.

### TAM — African informal commerce
- **~85%** of African non-agricultural employment is informal
  (ILO/WIESO 2022 dataset)
- **~300M+** people earn primarily from informal commerce across
  the continent (UN-Habitat)
- **e-commerce TAM Africa (all segments)** ≈ **$46B by 2025**
  (Statista, May 2024 update). Most of this is currently outside
  formal e-commerce metrics — it happens in DMs.

### SAM — MiniPay-reachable in V1 markets (NGA + GHA + KEN + ZAF)
- MiniPay wallet installs across V1 markets : the majority of the
  ~15M global total is concentrated in NGA + KEN + ZAF per Opera
  Mini's African distribution map.
- Buyer side : every MiniPay wallet holder is a candidate buyer.
- Seller side : addressable smartphone-using informal sellers in V1
  markets number in the low millions, not thousands.

### SOM — realistic 18-month capture (illustrative model)
- 1000 active sellers × $200/month avg GMV × 18 months ≈ **$3.6M
  cumulative GMV**
- × 1.8% commission ≈ **~$65K cumulative protocol revenue** over
  18 months.
- Order-of-magnitude check : a moderate single-city seller cohort
  (Lagos + Nairobi + Accra) seeded via WhatsApp community channels
  can plausibly reach 1000 sellers by month 12. The bottleneck is
  acquisition + handholding cost per seller — which is what the
  grant funds.

[TBD: Mike — replace 1000 / $200 with your own model if you have
concrete waitlist or pilot-cohort numbers.]

---

## Competitive landscape

| | Marketplaces (Jumia) | WhatsApp DMs (status quo) | Shopify | Crypto-native marketplaces | **Etalo** |
|---|---|---|---|---|---|
| Buyer protection / escrow | ✅ centralised | ❌ | ✅ centralised + PSP | ⚠ depends | ✅ on-chain, non-custodial |
| Seller fees | ~15-30% commission | 0 + payment friction | $24-79/mo + 2-3% | varies | **1.8% V1 → 1.2% top tier V1.1** |
| Cross-border within Africa | locked per country | broken (mobile-money corridors) | card-only | UX cliff | Intra-Africa V1 ; cross-border V2 (ADR-041) |
| Onboarding cost (seller) | review-gated | 0 (DM) | $24+/mo upfront | wallet-setup wall | 0 (auto-MiniPay) + 3 welcome credits |
| Distribution surface | own marketing | seller's network | own marketing | own marketing | **MiniPay directory + multi-wallet** |
| Built for non-crypto users | n/a | n/a | n/a | ❌ | ✅ primary design constraint |
| Architecture audit-friendly | n/a | n/a | n/a | varies wildly | ADR-tracked, hard-capped, indexer-sole-writer V2 invariant |

The defensible position : **MiniPay-directory distribution +
non-crypto-native UX + crypto-native settlement guarantees**. None
of the other columns can copy that without rebuilding.

---

## Traction (verifiable today)

### Execution discipline
- **53 ADRs since J0** (`docs/DECISIONS.md`, 2026-04-22 → 2026-05-22).
  Each major pivot has its own ADR with rationale, supersedes
  link, and date. Recent examples : ADR-014 (single-product → V1
  Boutique multi-item), ADR-041 (V1 scope restriction to intra-
  Africa), ADR-049 (5-template marketing pack → photo-enhancement-
  only), ADR-050 (address-book → inline checkout, after `recipient_
  name` was identified as a courier hard requirement African
  couriers refuse packages without), ADR-052 (drop "MiniPay
  exclusive" posture, add multi-wallet).
- **Solo-developer cadence visible in PR log** : 17 PRs merged in
  the 7 days preceding this pitch update (PRs #31-#47), covering
  security fixes, mobile UX, fee abstraction wiring, grants doc,
  and ops checklist.

### Code + infrastructure
- **V2 contracts deployed Sepolia** (post-H-1 redeploy 2026-05-05,
  ADR-042) — addresses + sources in
  `packages/contracts/deployments/celo-sepolia-v2.json`. Mainnet
  redeploy is the active J12 sprint.
- **Frontend live** at https://etalo.xyz — public boutique surface
  + Mini App surface in a single Next.js 14 app (ADR-035).
- **Backend live** at https://etalo-api.fly.dev — FastAPI + Celo
  indexer (sole writer to on-chain mirror tables), Fly.io region
  `jnb` (Johannesburg, co-located with Vercel `cpt1`), Supabase
  Postgres, auto-deploys via `.github/workflows/deploy-backend.yml`.

### Security posture
> Honest framing — none of this is a firm audit, all of it is
> internal work product. The deliberate posture pre-V1.5 is :
> internal audit + Slither + Foundry invariants + hard caps to
> bound blast radius + transparent self-found-bug log. A paid firm
> audit is in the V1.5 scope (ADR-039), funded by these grants.

- **5 internal audit reports** in `docs/audit/PASHOV_*.md`,
  produced via the Pashov-methodology skill set running as a
  Claude Sonnet sub-agent. Covers Escrow / Dispute / Reputation /
  Credits + XRAY threat model. **NOT** a paid audit by Pashov
  Audit Group ; the file names reflect the methodology used.
- **Foundry invariant testing** : 8 invariants over 102,400+
  bounded actions, tracked in `packages/contracts/test/`.
- **Slither 0.11.5** static analysis : 50 findings, 0 HIGH / 0
  MEDIUM / 38 LOW / 12 INFO.
- **1 real HIGH found and fixed pre-mainnet** : H-1 `markItemDisputed`
  on unfunded orders (ADR-042). Exploitation reproduced in 254 ms
  on a local fork ; 3-layer defense-in-depth fix shipped ; clean
  Sepolia redeploy 2026-05-05 (USDT custody verified at 0 at
  deprecation, so no defensive drain was required).
- **2 additional HIGH closed in pre-mainnet pass** (2026-05-22, PR
  #43) : XSS via JSON-LD on boutique pages ; delivery-address spoof
  on funded orders. Both shipped before any J12 mainnet activity.
- **Hard caps (ADR-026)** : worst-case exploit blast radius bounded
  to $50K TVL until V1.5 firm audit lifts the cap.

### MiniPay-readiness
- **Compliant patterns already implemented** : zero-click connect
  (no "Connect Wallet" button inside MiniPay), silent reconnect via
  `eth_accounts` RPC (no surprise permission popup, PR #38), no
  EIP-191 / signed-message backend auth (ADR-034), no raw 0x…
  addresses shown as primary user identifier, MiniPay copy
  compliance (Network fee / Deposit / Withdraw / Stablecoin), Add
  Cash deeplink on insufficient balance, 360×640 mobile viewport.
- **CIP-64 USDT fee abstraction wired** (PR #45, 2026-05-22) —
  `asTxOptions()` wrapper + USDT adapter
  `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`. Currently env-
  gated, flips on at J12 mainnet.
- **Status with MiniPay team** : intake form **not yet submitted**.
  Sprint J12 plan is mainnet deploy first, screenshots + PageSpeed
  capture from mainnet, then intake submission. Submitting from
  Sepolia would burn the first-impression budget per MiniPay
  guidance.

### Product traction
> Pre-mainnet, no real GMV yet. The intellectually honest answer.
> The grants fund the path from technical maturity (where we are)
> to user-side traction (the next step).

- Active sellers on Sepolia testflows : [TBD: Mike]
- Waitlist signups : [TBD: Mike]
- Pilot conversations with WhatsApp seller communities : [TBD: Mike]

---

## Go-to-market

### Acquisition strategy

**Phase 0 — Pre-launch (now → J12 mainnet)**
- WhatsApp / Telegram communities for African e-commerce sellers
  [TBD: Mike — specific communities you're already in / will join]
- Direct outreach to 50-100 known informal sellers via personal +
  diaspora network
- Goal : 30-50 sellers ready to onboard the moment mainnet ships

**Phase 1 — V1 launch (J12 → +3 months)**
- 4-market big-bang (NGA / GHA / KEN / ZAF, ADR-041)
- **MiniPay directory listing** submission post-J12 (intake first,
  Stage 2 readiness form after the first call with MiniPay)
- Free welcome credits (3 photo enhancements) remove the "what do
  I do first" friction
- Hands-on onboarding for the first 100 sellers — typically a
  10-min WhatsApp video call walking them through their boutique +
  first product
- Goal : 500 active sellers, 5000 cumulative buyer transactions

**Phase 2 — V1.5 growth (+3-9 months)**
- Top Seller program (1.2% commission for sellers above volume +
  rating + low-dispute thresholds, ADR-041 V1.1 target)
- Marketing pack reactivation (5-template asset generator, ADR-049
  V1.5+ code already in repo behind a feature flag)
- Referral loops : 1 free credit per converted seller
- Goal : 2000 active sellers

### Channels we will NOT rely on
- Paid social ads at scale — informal sellers don't trust ads, they
  trust other sellers. Word-of-mouth + community manager is the
  channel that fits.
- Influencer marketing — would burn credibility with the cohort.

---

## Unit economics

### Per-seller monthly economics (V1, 1.8% rate)

| Metric | Conservative | Base | Optimistic |
|---|---|---|---|
| Avg sales / month / seller | $100 | $200 | $500 |
| Commission (1.8%) | $1.80 | $3.60 | $9.00 |
| Asset-gen revenue (3-5 credits/mo × $0.15) | $0.45 | $0.75 | $1.50 |
| **Monthly revenue / seller** | **$2.25** | **$4.35** | **$10.50** |

Implied breakeven seller counts at three cost structures :

| Monthly OpEx | Breakeven sellers (base) |
|---|---|
| $500/mo (solo, minimal infra) | ~115 |
| $2K/mo (1 community manager added) | ~460 |
| $5K/mo (2 CMs + indexer scaling) | ~1150 |

Etalo isn't high-margin SaaS — it's a thin commission layer on a
payment rail. Strategic play : **volume + reputation**, not margin
per seller. The grant funds the months between launch and the
1000-seller breakeven.

### Treasury split (ADR-024)

Revenue routes to three separated wallets, never merged :
- `commissionTreasury` — operating runway
- `creditsTreasury` — asset-gen processing costs (BiRefNet GPU
  spend, IPFS pinning)
- `communityFund` — destination of `forceRefund`'d outstanding
  balances after the 90-day inactivity window (ADR-023) ; also
  seeded with a share of commission post-V1.5 to fund ecosystem
  grants of our own

---

## Team

### Mike (solo founder, full-stack)

- **Background** : full-stack engineer with smart-contract
  experience. [TBD: Mike — your prior roles / shipping history.
  One or two anchor projects help anchor the credibility.]
- **Identity + market fit** : based in Belgium, Cameroonian roots,
  speaks French + English + the lived experience of the African
  informal commerce target market. The operator-market-fit anchor
  is intentional and load-bearing for the go-to-market story.
- **Hands-on scope** : has personally shipped the smart contracts
  (Solidity 0.8.24 + Hardhat + OpenZeppelin) ; the indexer (Python
  + AsyncWeb3) ; the API (FastAPI + SQLAlchemy 2.x async) ; the
  frontend (Next.js 14 App Router + Wagmi v2 + Viem v2 +
  shadcn/ui + Tailwind) ; the MiniPay + WalletConnect integration ;
  and the internal audit + pre-mainnet security pass.

### Why solo today (and what the grant unlocks)

Pre-mainnet, single-operator is a feature : every decision is ADR-
tracked, the codebase has one consistent voice, no coordination
tax on the 53 architectural choices already made. Post-J12, the
bottleneck shifts to seller onboarding + community management,
which the grant funds : **1 Africa-based community manager** for
the V1 markets + **1 part-time dispute coordinator** as transaction
volume grows.

### Advisors / community

[TBD: Mike — any advisors, mentors, ecosystem connections worth
naming. Even "regular working sessions with X from Celo ecosystem
team" carries weight.]

---

## Roadmap (next 12 months)

### Sprint J12 — Mainnet deploy (Q2 2026, in progress)
- Mainnet contracts deployed (Escrow / Dispute / Stake / Voting /
  Reputation / Credits) ; addresses recorded in
  `packages/contracts/deployments/celo-mainnet.json`
- Frontend chain switch (chainId 42220)
- All contracts verified on Celoscan mainnet
- `ENFORCE_JWT_AUTH=true` on backend (ADR-046 hard gate)
- Contract ownership transferred to 2/3 (or 3/5) Safe multisig per
  `docs/audit/PRE_MAINNET_OPS.md`
- `NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED=true` flipped in Vercel
  → users on mainnet start paying gas in USDT via the adapter
- MiniPay intake form submitted to https://minipay.to/mini-apps

### Q3 2026 — V1 launch
- MiniPay Stage 2 readiness form completed post first-call
- MiniPay directory listing live
- 500 active sellers across NGA / GHA / KEN / ZAF
- 5000 cumulative buyer transactions
- Public `/stats` page surfacing DAU, MAU, retention, tx volume,
  failed-tx rate (the KPIs MiniPay reviewers check for continued
  listing)

### Q4 2026 — V1.5 growth
- Top Seller program activation (1.2% rate for qualifying sellers)
- 5-template marketing pack reactivation (ADR-049 V1.5)
- Referral loops
- Firm smart-contract audit engagement (ADR-039 V1.5 budget) — the
  Pashov-methodology self-audit + grant track record makes the
  firm-audit conversation cheaper to land
- Goal : 2000 active sellers

### Q1-Q2 2027 — V2
- Cross-border activation (ADR-019 cross clause + ADR-020 + ADR-021)
- Full N1/N2/N3 dispute juror UI shipped (contracts deployed since
  V1)
- Seller stake tier UX
- 5000 active sellers, $1M+ cumulative GMV

---

## Ask

### For Proof of Ship S2 — $20K USDT (monthly cohort, MiniPay focus)

**Use of funds**

| Bucket | % | $ | Reasoning |
|---|---|---|---|
| Solo founder runway | 60% | $12K | ~3 months of full-time on Etalo through Q3 launch ; covers personal living at an African / European blended baseline so the founder isn't pulled into consulting |
| First 1000 sellers acquisition | 25% | $5K | Subsidised onboarding (free welcome credits batch), part-time WhatsApp community manager (~$300/mo for 4 months across NGA / KEN), $2K for hands-on first-100-sellers video onboarding |
| Mainnet operations | 15% | $3K | 3 Ledger Nano S Plus for the Safe multisig signers ($240), Tenderly Pro monitoring 1 year ($200), Fly.io scale-up budget for indexer + DB ($2K reserve) |

**Cohort shipping commitments**
- **Month 1** : J12 mainnet live + ENFORCE_JWT_AUTH flipped on +
  multisig owned + fee abstraction flipped on + MiniPay intake
  submitted + first 10 boutiques live with real products
- **Month 2** : MiniPay first-call complete + Stage 2 readiness
  form submitted + first 100 boutiques + first 1000 buyer
  transactions + public `/stats` page deployed
- **Month 3** : Listing approved + 500 active sellers + V1.5 Top
  Seller program scoped

**Reputation hooks reviewable monthly**
- Public `/stats` page (DAU, MAU, retention, tx volume per
  stablecoin, network fees paid, failed-tx rate, tx counts per
  contract method) — fresh, no wallet required
- All deployed contracts verified on Celoscan with sample tx links
  per method
- Sprint cadence visible in PR log + ADR log (53 → ?? by end of
  cohort)

### For Prezenti Anchor Round — $25K (milestone-based, 4-6 week review)

**Milestone 1** ($10K, by 31 Aug 2026)
- J12 mainnet contracts live, ownership transferred to Safe multisig
- All 6 contracts verified on Celoscan mainnet
- Backend on mainnet with `ENFORCE_JWT_AUTH=true`
- First 50 boutiques operational across all 4 V1 markets
- Public `/stats` page deployed showing live numbers

**Milestone 2** ($10K, by 31 Oct 2026)
- 1000+ cumulative on-chain buyer transactions
- Dispute rate < 5% of transactions (ADR-026 hard caps tested at
  scale)
- MiniPay official directory listing approved
- 500+ active sellers month-over-month

**Milestone 3** ($5K, by 31 Dec 2026)
- Top Seller V1.5 program shipped
- 2000+ active sellers / month
- $500K+ cumulative GMV
- 1 community manager + 1 part-time dispute coordinator in role
- Firm smart-contract audit engagement signed (ADR-039 V1.5 path)

### For Celo Builder Fund — $25K cUSD (investment-flavoured, defer)

Hold off until post-V1 launch traction (1000+ active sellers,
$50K+ monthly GMV, <5% dispute rate sustained over 6 months, MiniPay
listing >6 months old). Builder Fund makes sense as a Series-A-
flavoured follow-on with potential Verda Ventures further
investment, not a seed.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Smart-contract bug not caught by internal audit | Medium | High | Hard caps (ADR-026) bound worst-case to $50K TVL ; H-1 self-found and fixed pre-mainnet (ADR-042) is precedent ; firm audit budgeted V1.5 |
| Single-key compromise of deployer | Medium | High | Multisig transfer is a J12 mainnet-deploy gate (`PRE_MAINNET_OPS.md`) ; hardware-wallet-only signers ; optional 48h TimelockController on highest-risk setters |
| MiniPay listing rejected at intake | Medium | High | 11 compliant patterns already implemented (zero-click connect, no signed messages, copy compliance, viewport, etc.) ; explicit "don't submit half-built" discipline ; intake submission gated on J12 mainnet + screenshots + PageSpeed |
| Seller acquisition slower than model | Medium | Medium | Grant funds buy 6-12 months at conservative scenario ; community-manager hire is the scaling lever |
| Dispute juror surface quality (V1.5 path) | Medium | Medium | EtaloVoting stake-weighted design ; admin acts as mediator V1 ; small TVL caps prevent juror-fraud incentive from being large enough to game the panel |
| `ENFORCE_JWT_AUTH=false` not flipped pre-mainnet | Low | High | Documented in ADR-046 as hard gate ; J12 sprint checklist line item ; backend has the JWT path implemented, only needs the env flag flip |
| Celo L2 / RPC instability | Low | Medium | Multiple RPC providers wired (Forno + dRPC fallback) ; indexer re-org safe per ADR-032 ; degraded-mode fallback shipped |
| Fee abstraction adapter contract misbehaviour | Low | High | Env-flag kill switch (`NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED=false`) flips back to legacy tx without a code revert |
| Single-operator team risk | Medium | Medium | All ADRs documented + auditor-ready codebase ; grant funds first community manager who can take over support / onboarding if founder is temporarily unavailable |

---

## Why now

Three concurrent shifts make Etalo viable now in a way it wasn't
in 2023-2024 :

1. **Celo became an L2 (March 2025)** — sub-cent fees, 1s blocks.
   Pre-L2 Celo, fees were nominally low but UX was inconsistent.
   L2 closed that gap.
2. **CIP-64 fee abstraction matured** — buyers can pay gas in USDT
   instead of CELO. Without this, every "Mini App for non-crypto-
   native users" hits the same wall : *"you need CELO first"*.
   That wall is now gone.
3. **MiniPay opened the Mini App directory** — pre-installed wallets
   on Opera Mini across Africa, with public discovery. Distribution
   to the exact target demographic shifted from "borderline
   impossible" to "submit an intake form when ready".

A 24-month window for a category-defining African MiniPay commerce
app is open. Whoever ships first into the listing with audit-
discipline contracts + non-crypto-native UX + operator-market-fit
wins outsized share of MiniPay's organic distribution. Etalo is at
the front of that queue.

---

## Appendix

### Live URLs
- App : https://etalo.xyz (Celo Sepolia until J12 mainnet)
- API : https://etalo-api.fly.dev
- Source : https://github.com/BacBacta/Etalo (private —
  [TBD: Mike — decision on going public for grants visibility])
- Twitter : [TBD: Mike — register `@etalo_app` if not done]
- Farcaster : [TBD: Mike]

### V2 contract addresses (Celo Sepolia, post-H-1 redeploy 2026-05-05)

| Contract | Address |
|---|---|
| EtaloEscrow | `0xAeC58270973A973e3FF4913602Db1b5c98894640` |
| EtaloDispute | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` |
| EtaloStake | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` |
| EtaloVoting | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` |
| MockUSDT (V2 testnet) | `0xea07db5d3D7576864ac434133abFE0E815735300` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

Mainnet addresses published to
`packages/contracts/deployments/celo-mainnet.json` post J12.

### Audit + decision trail

- `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` — internal escrow audit
  (Pashov methodology, Claude Sonnet sub-agent)
- `docs/audit/PASHOV_AUDIT_EtaloDispute.md`
- `docs/audit/PASHOV_AUDIT_EtaloReputation.md`
- `docs/audit/PASHOV_AUDIT_EtaloCredits.md`
- `docs/audit/PASHOV_XRAY.md` — threat model
- `docs/audit/PRE_MAINNET_OPS.md` — operational hardening checklist
  (multisig transfer, monitoring, SLA)
- `docs/audit/H1_POST_FIX_VERIFICATION.md` — H-1 bug fix verification
- `docs/audit/SAMPLE_TXS.md` — sample on-chain tx hashes per
  user-facing method
- `docs/DECISIONS.md` — 53 ADRs since J0 (J0 = 2026-04-22)
- `docs/PRE_MAINNET_QA.md` — performance + latency baseline
- `docs/AUDIT_BRIEFING.md` — phased audit strategy

---

## Program adaptations

### Proof of Ship S2 — what to foreground

- **Shipping cadence** : the cohort rewards observable monthly
  delivery. Highlight Month 1 / Month 2 / Month 3 deliverables in
  *Ask* ; tie them to the cohort review cycle.
- **MiniPay-listing readiness** as differentiator : 11 compliant
  patterns already implemented pre-intake. Most cohort entrants
  haven't done that audit yet.
- **Measurable Mini-App-specific KPIs** : DAU, MAU, retention, tx
  volume per stablecoin, failed-tx rate. Public `/stats` page
  reviewable each month.
- **Total ask** : $20K, 60/25/15 split (runway / acquisition / ops).

### Prezenti Anchor Round — what to foreground

- **Crisp milestones** : each fits the 4-6 week review cadence
  (mainnet → 1000 tx + listing → V1.5 + 2000 sellers).
- **Community + 4-market intra-Africa launch** angle : Celo wants
  to grow the African community ; V1 is structurally a community-
  building event (50+ initial sellers hand-onboarded).
- **Technical maturity signal** : 53 ADRs + Pashov-methodology
  audit + ADR-026 hard caps + V2 indexer-sole-writer invariant +
  pre-mainnet ops checklist.
- **Total ask** : $25K split $10K / $10K / $5K across 3 milestones.

### Celo Builder Fund — what to foreground (when ready, post-V1)

- Investment thesis : Etalo is the commerce-surface layer
  MiniPay-the-rail plugs into to become the African e-commerce
  default. Long horizon, large market, defensible operator fit.
- Required traction before applying : 1000+ active sellers, $50K+
  monthly GMV, <5% dispute rate over 6 months, MiniPay listing
  >6 months old.
- Verda Ventures follow-on conversation as the upside structure.

### Generic adaptation rules

- **Trim ruthlessly to one page** when asked. Executive summary box
  + Ask section + the relevant traction subsection are usually
  enough.
- **Keep the Risks section** even when not asked — reviewers notice
  its absence and read its presence as maturity.
- **Update Traction first** before each application. Stale numbers
  are a credibility killer.
- **Never invent numbers** — every `[TBD: Mike]` is honest gap, not
  TODO. Real "pre-launch, 0 sellers + serious audit + readiness
  story" beats fake 100-seller traction every time.
- **Lead with discipline, not surcharm** — the 53-ADR cadence + the
  H-1 self-found-and-fixed story + the indexer-sole-writer
  invariant land better than vague "we're rigorous" claims. Show
  the artifacts.

---

*End of master pitch. Maintenance owner : Mike. Next update :
post-J12 mainnet (swap traction numbers, drop Sepolia caveats,
add real GMV / seller count).*
