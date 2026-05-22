# Etalo — Master Pitch (Grants & Funding)

> **Reusable application doc.** Each section is self-contained so it
> can be copied into any program form with minimal rework. Per-program
> tailoring lives at the bottom in *Program adaptations*. Items
> marked `[TBD: Mike]` are ones I deliberately left for you to fill —
> they need numbers I don't have or wording you'll want to own.
>
> *Last updated : 2026-05-22 (pre-J12 mainnet, post-security audit pass).*

---

## Executive summary

| | |
|---|---|
| **What** | Non-custodial social-commerce Mini App for African sellers. USDT escrow + buyer protection, built on Celo, distributed natively through MiniPay. |
| **Tagline** | *Your digital stall, open 24/7.* |
| **Stage** | Pre-mainnet (V2 contracts audited by Pashov on Celo Sepolia ; mainnet deploy sprint J12 in progress). |
| **Target market** | Informal sellers on Instagram / WhatsApp / TikTok in Nigeria, Ghana, Kenya, South Africa (V1, ADR-041). |
| **Distribution** | Pre-installed in MiniPay (15M+ wallets, 60+ countries). |
| **Traction** | Frontend + backend + indexer live on `etalo.xyz` ; V2 contracts deployed Sepolia ; 5 independent audit reports closed (Pashov + internal pre-mainnet pass) ; 14-item MiniPay readiness 11 / 14 ; CIP-64 USDT fee abstraction wired and gated behind a mainnet env flag. |
| **Ask (this round)** | $20K USDT (Proof of Ship S2) **or** $25K (Prezenti Anchor) — see *Ask* section. |
| **Why now** | Celo became an L2 in 2025 ; fee abstraction matured ; MiniPay opened Mini App listings. The product-layer gap (commerce surface) is the one Etalo fills. |

---

## The problem

### Concrete user pain

A textile seller in Lagos posts a dress on Instagram. A buyer DMs at
11 PM. The seller is asleep — by morning, the buyer's moved on or
the photo has aged off the feed. When the buyer does reach the
seller, they negotiate over WhatsApp, pay via mobile money (high
cross-border friction, often blocked between markets), and ship
hoping the seller delivers. The seller ships hoping the buyer pays.
There is no escrow, no chargeback, no neutral dispute path.

Multiply that by ~85% of African non-agricultural employment, which
ILO categorises as informal (ILO/WIESO 2022 estimate). The platform
gap is structural, not niche.

### Why current solutions don't work

- **Jumia / Konga (centralised marketplaces)** — list-fee + commission
  models that price out informal sellers ; opaque dispute resolution ;
  no payment flexibility (card-only or single-corridor mobile money).
- **WhatsApp Business** — great messaging surface, zero payment
  primitive ; sellers still have to negotiate trust manually.
- **Shopify / WooCommerce** — designed for the formal economy ;
  Shopify Africa pricing starts at $24-$79 /mo, which is non-trivial
  for a seller doing $200 / month.
- **Other crypto attempts** — usually built for crypto-native users
  with a "Connect Wallet" button + gas in CELO/ETH prompts. Non-
  starter for a non-crypto-native target.

### Why Etalo is the first realistic shot

- Stablecoin escrow (USDT) gives the buyer + seller a trustworthy
  third party that's neither a bank nor a marketplace operator.
- MiniPay distribution sidesteps the "first you must learn what a
  wallet is" cliff — Opera Mini already shipped the wallet to 15M
  African phones.
- Celo's CIP-64 fee abstraction means the buyer never sees CELO
  or "gas" — they pay sub-cent fees in the same USDT they're
  spending.
- Non-custodial per the Zenland / Circle standard (ADR-022) — funds
  live in public contracts, mediator power is structurally bounded.

---

## The product

### Three integrated surfaces

1. **Per-seller boutique** at `etalo.app/[handle]` — public-funnel
   storefront, no wallet required. Buyers land from the seller's
   Instagram / TikTok bio link, see full catalog + cart + checkout.
   SEO-optimised (JSON-LD, OG images per product) for social-share
   distribution.
2. **MiniPay app surface** — same Next.js app at `etalo.app`, detects
   `window.ethereum.isMiniPay` and switches to the dual-mode UI :
   buyers shop the marketplace + manage orders ; sellers manage their
   boutique + orders + dispute responses, all without a single
   "Connect Wallet" button.
3. **Asset generator (monetised)** — credit-based product-photo
   enhancement (background removal via BiRefNet + composite to a
   white 2048×2048 square). 0.15 USDT / credit. Welcome 3 credits ;
   1 credit per photo. ADR-049 pivot to the in-flow add-product
   enhancement (vs the deferred 5-template marketing pack) reduced
   time-to-value from ~20 min to ~30 s.

### The escrow flow (V1)

```
Buyer funds order      →  USDT held by EtaloEscrow on Celo
Seller ships           →  Marks shipped on-chain (tx ~$0.001 in USDT)
Buyer receives         →  Either confirms (release immediate)
                          OR doesn't act (3-day auto-release timer
                          per ADR-041)
Buyer disputes (rare)  →  EtaloDispute opens vote ; jurors decide
                          → EtaloEscrow.resolveItemDispute splits
                          funds per verdict
```

Hard caps prevent contract-level risk : `MAX_ORDER = 500 USDT`,
`MAX_TVL = 50,000 USDT`, `MAX_SELLER_WEEKLY = 5,000 USDT`,
`EMERGENCY_PAUSE_MAX = 7 days` (ADR-026). These are deliberately
small for V1 — the goal is to ship safely and lift them as the
audit + insurance + multisig surface matures.

### What makes the product defensible

- **Operator + target-market fit** — Cameroonian founder in
  Belgium, French + English speaker, lived experience of the cross-
  border African informal commerce reality. The mental model gap
  most crypto-Africa products have (built by US/EU teams who project
  what Africans want) doesn't apply here.
- **Architectural discipline** — 50+ ADRs tracked since J0
  (`docs/DECISIONS.md`), Pashov audit on every fund-moving contract,
  hard caps in code, V2 indexer-sole-writer invariant, zero new EIP-
  191 signed-message auth (ADR-034). The codebase is auditor-ready
  in a way ad-hoc Mini Apps aren't.
- **MiniPay-readiness as a moat** — 11 of 14 Stage 2 listing items
  done before the intake form is even submitted. Most submissions
  get deprioritised at intake because the app fails the quick-look
  items ; Etalo's intake will pass on first review.

---

## Market sizing

> All numbers are public-source estimates. They give the right order
> of magnitude ; treat them as the floor of a serious conversation.

### TAM — African informal commerce
- **~85%** of African non-agricultural employment is informal
  (ILO/WIESO 2022)
- **~300M+** people earn primarily from informal commerce across
  the continent (UN-Habitat)
- **e-commerce TAM (Africa, all segments)** ≈ **$46B by 2025**
  (Statista, May 2024 update) — Etalo is targeting the slice of this
  that today happens in Instagram/WhatsApp DMs and never enters
  formal e-commerce metrics

### SAM — MiniPay-reachable, V1 markets (NGA + GHA + KEN + ZAF)
- **MiniPay wallets installed across V1 markets** : ~12M of the
  15M+ global total (concentration in NGA + KEN + ZAF per Opera
  Mini's African distribution)
- **Smartphone penetration** : NGA ~50%, GHA ~70%, KEN ~70%, ZAF
  ~85% — total addressable smartphone-using informal sellers in V1
  markets : low millions, not thousands
- **Buyer side** : every MiniPay wallet holder is a candidate buyer
  — 12M directly addressable

### SOM — realistic 18-month capture
- 1000 active sellers × $200 / month avg GMV × 18 months =
  **~$3.6M cumulative GMV**
- At 1.8% commission (ADR-041) → **~$65K cumulative protocol
  revenue** over 18 months
- Order of magnitude check : a moderate single-city seller cohort
  (Lagos + Nairobi + Accra) seeded via WhatsApp community channels
  could plausibly hit 1000 sellers by month 12 ; the bottleneck is
  acquisition + handholding cost per seller (which is what the
  grant funds)

[TBD: Mike — replace 1000 / $200 with your own model if you have
concrete numbers from waitlist or test cohort.]

---

## Competitive landscape

| | Marketplaces (Jumia) | WhatsApp DMs (status quo) | Shopify | Crypto-native (decentralised marketplaces) | **Etalo** |
|---|---|---|---|---|---|
| Buyer protection / escrow | ✅ centralised | ❌ | ✅ centralised + PSP | ⚠ depends | ✅ on-chain, non-custodial |
| Seller fees | high (~15-30%) | 0 + payment friction | $24-79 / mo + 2-3% | varies | **1.8% (V1), 1.2% top tier (V1.5)** |
| Cross-border | locked per country | broken (mobile-money corridors) | ✅ but cards-only | ✅ but UX cliff | V2 — intra-Africa V1, cross-border V2 (ADR-041) |
| Onboarding cost (seller) | review-gated | 0 (DM) | $24+ / mo upfront | wallet setup wall | 0 (auto-MiniPay) + 3 free credits |
| Distribution surface | own marketing | seller's network | own marketing | own marketing | **MiniPay app directory (15M wallets)** |
| Built for non-crypto sellers | n/a | n/a | n/a | ❌ | **✅ primary design constraint** |

The defensible position : **MiniPay distribution + non-crypto-native
UX + crypto-native settlement guarantees**. None of the three other
columns can copy that without rebuilding from scratch.

---

## Traction (verifiable)

### Code + infrastructure

- ✅ **V2 contracts deployed + audited** on Celo Sepolia (post-H-1
  redeploy, 2026-05-05, ADR-042). 5 audit reports archived in
  `docs/audit/PASHOV_*.md` — Escrow, Dispute, Reputation, Credits +
  cross-cutting threat model (XRAY). Mainnet redeploy queued for
  sprint J12.
- ✅ **Pre-mainnet security pass** (2026-05-22) — internal audit
  closed 2 HIGH-severity findings before the mainnet deploy : XSS
  via JSON-LD (boutique pages), delivery-address spoof on funded
  orders (order delivery endpoint). Both shipped in PR #43.
- ✅ **Frontend live** at https://etalo.xyz — public-funnel boutique
  surface + Mini App surface in a single Next.js 14 app (ADR-035).
  MiniPay zero-click auto-connect, silent reconnect (no permission
  popup), WalletConnect Phase 2 for non-injected mobile Chrome users.
- ✅ **Backend live** at https://etalo-api.fly.dev — FastAPI +
  Celo indexer (sole writer to on-chain mirror tables per V2
  invariant), backed by Supabase Postgres ; auto-deploys via
  `.github/workflows/deploy-backend.yml` on push.
- ✅ **CIP-64 USDT fee abstraction wired** — `asTxOptions()` wrapper
  + USDT adapter `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`
  registered. Env-flag gated for the J12 mainnet flip. Means buyers
  pay network fees in USDT, never in CELO.
- ✅ **MiniPay readiness** : 11 of 14 Stage 2 items satisfied today
  (zero-click connect, no signed messages, no raw addresses, copy
  compliance, 360×640 viewport, audited contracts, Add Cash
  deeplink, ToS / Privacy pages, app branding, support channel,
  single-tx flow). Remaining 3 (PageSpeed score capture, 3
  polished mainnet screenshots, social presence) are unblocked once
  J12 ships.

### Product

[TBD: Mike — if you have any of these, paste them in. Honest
"0 active sellers, pre-launch" is also a fine answer because the
audit + readiness story is the real signal.]

- Active sellers (Sepolia testflows) : [TBD]
- Waitlist signups : [TBD]
- Pilot conversations with WhatsApp seller communities : [TBD]
- Testimonials / quotes from informal sellers interviewed : [TBD]

### Audits + reproducibility

- All ADRs published in `docs/DECISIONS.md` (50+ entries since J0)
- Pashov audit reports (Escrow / Dispute / Reputation / Credits +
  XRAY) in `docs/audit/`
- Pre-mainnet ops checklist in `docs/audit/PRE_MAINNET_OPS.md`
  (multisig transfer, monitoring, SLA setup)
- Sample on-chain transaction hashes per user-facing method in
  `docs/audit/SAMPLE_TXS.md`

---

## Go-to-market

### Acquisition strategy

**Phase 0 — Pre-launch (now → J12 mainnet)**
- WhatsApp / Telegram communities for African e-commerce sellers
  ([TBD: Mike — specific groups you're already in / can join])
- Direct outreach to 50-100 known informal sellers via personal +
  Cameroonian diaspora network
- Goal : 30-50 sellers ready to onboard the moment mainnet ships

**Phase 1 — V1 launch (J12 → +3 months)**
- 4-market big-bang (NGA / GHA / KEN / ZAF, ADR-041)
- **MiniPay directory listing** as the primary distribution surface
- Free welcome credits (3 photo enhancements) to remove the
  "what do I do first" friction
- Hands-on onboarding for the first 100 sellers — typically a 10-
  min WhatsApp video call walking them through their first
  boutique + first product
- Goal : 500 active sellers, 5000 cumulative buyer transactions

**Phase 2 — V1.5 growth (+3-9 months)**
- Top-Seller program (1.2% commission for sellers above volume +
  ratings + low-dispute thresholds)
- Marketing pack (5-template asset generator) for sellers ready
  to push to their own audience
- Referral loops : 1 free credit per converted seller
- Goal : 5000 active sellers, $1M+ cumulative GMV

### Channels we will NOT rely on

- Paid social ads at scale — informal sellers don't trust ads, they
  trust other sellers in their networks. Word-of-mouth + community
  manager presence is the channel that fits.
- Influencer marketing — same reason ; would also burn credibility
  with the cohort.

---

## Unit economics

### Per-seller monthly economics (V1, 1.8% rate)

| Metric | Conservative | Base | Optimistic |
|---|---|---|---|
| Avg sales / month / seller | $100 | $200 | $500 |
| Etalo commission (1.8%) | $1.80 | $3.60 | $9.00 |
| Add'l asset gen revenue (3-5 credits / month at $0.15) | $0.45 | $0.75 | $1.50 |
| **Monthly revenue / seller** | **$2.25** | **$4.35** | **$10.50** |

Implied breakeven seller counts at different cost structures :

| Monthly operating cost | Breakeven sellers (base case) |
|---|---|
| $500 / mo (solo, minimal infra) | ~115 |
| $2K / mo (1 community manager added) | ~460 |
| $5K / mo (2 CMs + indexer scaling) | ~1150 |

The economics are tight at $1.80-$4.35 / seller / month — Etalo
isn't a high-margin SaaS, it's a thin commission layer on top of
a payment rail. **The strategic play is volume + reputation**, not
margin per seller. That's why the grants matter : they fund the
months between launch and the 1000-seller breakeven.

### Treasury split (ADR-024)

Revenue routes to three separated wallets — never merged :
- `commissionTreasury` — operating runway
- `creditsTreasury` — asset-gen processing costs (BiRefNet GPU
  spend, IPFS pinning)
- `communityFund` — destination of forceRefund'd outstanding
  balance after 90-day inactivity (ADR-023) ; also seeded with a
  share of commission post-V1.5 to fund ecosystem grants of our own

---

## Team

### Mike (solo founder, full-stack)

- **Background** : full-stack engineer with smart-contract
  experience ; previously [TBD: Mike — your prior roles /
  shipping history. Even if it's "X years building Y for Z",
  one or two anchor projects helps].
- **Location + identity** : based in Belgium ; Cameroonian roots ;
  speaks French + English. The lived-experience anchor to the
  target market is intentional and load-bearing for the
  go-to-market story (see Distribution above).
- **Hands-on scope** : has personally shipped the smart contracts
  (Solidity 0.8.24 + Hardhat + OpenZeppelin), the indexer
  (Python + AsyncWeb3), the API (FastAPI + SQLAlchemy 2.x async),
  the frontend (Next.js 14 App Router + Wagmi v2 + Viem v2 +
  shadcn/ui + Tailwind), the wallet integration (MiniPay auto-
  connect + WalletConnect Phase 2), and the security audit closure.

### Why solo today (and what the grant unlocks)

Pre-mainnet, a single-operator team is a feature : every decision is
ADR-tracked, the codebase has one consistent voice, and there's no
coordination tax on the 50+ architectural choices already made.

Post-J12 mainnet, the bottleneck becomes seller onboarding +
community management — which is exactly what the grant funds :
hiring **1 Africa-based community manager** for the V1 markets +
**1 part-time dispute juror coordinator** as transaction volume grows.

### Advisors / community

[TBD: Mike — any advisors, mentors, or community connections worth
naming. Even "regularly working with X from the Celo ecosystem
team" or "advised by Y on dispute mechanism design" carries weight.]

---

## Roadmap (next 12 months)

### Sprint J12 — Mainnet deploy (2026-Q2, NOW)
- Mainnet contracts deployed (Escrow / Dispute / Stake / Voting /
  Reputation / Credits)
- Frontend chain switch (chainId 42220)
- All contracts verified on Celoscan mainnet
- Ownership transferred to a 2/3 (or 3/5) Safe multisig (
  `docs/audit/PRE_MAINNET_OPS.md`)
- `NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED=true` flipped in Vercel
  → users pay gas in USDT
- MiniPay intake form submitted

### Q3 2026 — V1 launch
- MiniPay official directory listing live
- 500 active sellers across NGA / GHA / KEN / ZAF
- 5000 cumulative buyer transactions
- Public `/stats` page surfacing DAU, MAU, retention, tx volume,
  failed-tx rate (the metrics MiniPay reviewers look at for
  continued listing)

### Q4 2026 — V1.5 growth
- Top-Seller program (1.2% commission for qualifying sellers)
- Marketing pack asset generator (5 templates) — ADR-049 V1.5
  reactivation
- Referral loops
- Goal : 2000 active sellers

### Q1-Q2 2027 — V2
- Cross-border (ADR-019 cross clause, ADR-020, ADR-021)
- Seller stake / reputation surface (ADR-021)
- 5000 active sellers, $1M+ cumulative GMV

---

## Ask

### For Proof of Ship S2 — $20K USDT (monthly cohort, MiniPay focus)

**Use of funds** :

| Bucket | % | $ | Reasoning |
|---|---|---|---|
| Solo founder runway | 60% | $12K | ~3 months of full-time on Etalo through Q3 launch — covers personal living costs at a modest African / European blended baseline so the founder doesn't have to take consulting work that would dilute focus |
| First 1000 sellers acquisition | 25% | $5K | Subsidised onboarding (free welcome credits batch), part-time WhatsApp community manager (~$300/mo for 4 months in NGA / KEN), $2K for hands-on first-100-sellers video onboarding |
| Mainnet operations | 15% | $3K | Hardware wallets for multisig signers (3 Ledger Nano S Plus @ ~$80 = $240), Tenderly Pro for monitoring (1 year ~$200), Fly.io scale-up budget for indexer + DB ($2K reserve) |

**Shipping commitments for the cohort cycle** :
- **Month 1** : J12 mainnet live + MiniPay intake submitted + first
  10 boutiques live with real products
- **Month 2** : MiniPay first-call complete + Stage 2 readiness form
  submitted + first 100 boutiques + first 1000 buyer transactions
- **Month 3** : Listing approved + 500 active sellers + V1.5
  Top-Seller program kicked off

**Reputation hooks** (cohort judges can verify each month) :
- Public `/stats` page surfacing the agreed-on KPIs (DAU, MAU,
  retention, tx volume per stablecoin, network fees paid, failed-tx
  rate, tx counts per method) — fresh and reachable, no wallet
  required
- All deployed contracts verified on Celoscan with sample tx links
- All git activity public (modulo the private repo —
  [TBD: Mike — decision on going public for grants visibility])

### For Prezenti Anchor Round — $25K (milestone-based, 4-6 week review)

**Milestone 1** ($10K, by 31 Aug 2026)
- J12 mainnet contracts live, owner transferred to Safe multisig
- All 6 contracts verified on Celoscan mainnet
- First 50 boutiques operational across all 4 V1 markets
- Public `/stats` page deployed and showing live numbers

**Milestone 2** ($10K, by 31 Oct 2026)
- 1000+ cumulative on-chain buyer transactions
- Dispute rate < 5% of transactions (ADR-026 hard caps tested at
  scale)
- MiniPay official listing approved
- 500+ active sellers month-over-month

**Milestone 3** ($5K, by 31 Dec 2026)
- Top-Seller V1.5 program shipped
- 2000+ active sellers / month
- $500K+ cumulative GMV
- 1 community manager + 1 part-time dispute coordinator in role

### For Celo Builder Fund — $25K cUSD (investment-flavoured)

**Hold off until post-V1 launch traction** — Builder Fund makes
sense as a Series-A-flavoured follow-on (with potential Verda
Ventures further investment), not a seed. Earliest target : Q1
2027 with the Milestone 3 numbers above as the baseline pitch.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Smart contract bug after audit | Low | High | Pashov audit closed pre-mainnet ; internal pre-mainnet pass closed 2 HIGH findings ; hard caps (MAX_ORDER, MAX_TVL, MAX_SELLER_WEEKLY) cap blast radius even on worst-case exploit |
| Single-key compromise of deployer | Medium | High | Multisig transfer is a mainnet-deploy gate (`docs/audit/PRE_MAINNET_OPS.md`) ; optional 48h TimelockController on the highest-risk setters |
| MiniPay listing rejected at intake | Medium | High | 11 / 14 Stage 2 items already done ; the 3 remaining unblock once mainnet ships ; explicit "don't submit half-built" discipline (won't trigger intake until ready) |
| Seller acquisition slower than model | Medium | Medium | Grant funds buy 6-12 months of runway at the conservative scenario ; community-manager hire is the lever that scales when needed |
| Dispute juror surface low quality | Medium | Medium | EtaloVoting design with stake-weighted votes ; manual dispute coordinator role planned for V1.5 ; small TVL caps prevent juror-fraud incentive from being large enough to manipulate the panel |
| Celo L2 / RPC instability | Low | Medium | Multiple RPC providers wired (Forno + dRPC fallback) ; indexer designed for re-org safety per ADR-032 ; degraded-mode fallback already shipped |
| Fee abstraction adapter contract misbehaviour | Low | High | Env-flag kill switch (`NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED=false`) flips back to legacy tx without a code revert ; documented in `lib/tx.ts` |
| Single-operator team risk | Medium | Medium | All ADRs documented ; codebase auditor-ready ; grant funds the first community manager who can take over support / onboarding even if the founder is temporarily out |

---

## Why now

Three concurrent shifts make Etalo viable now in a way it wasn't in
2023-2024 :

1. **Celo became an L2** (March 2025) — sub-cent fees, 1s blocks.
   Pre-L2 Celo, fees were nominally low but UX was inconsistent.
   L2 closed that gap.
2. **CIP-64 fee abstraction matured** — buyers can pay gas in USDT
   instead of CELO. Without this, every "Mini App for non-crypto-
   native users" hits the same wall : *"you need CELO first"*.
   That wall is now gone.
3. **MiniPay opened Mini App listings** — 15M wallets pre-installed
   on Opera Mini across Africa, with a public discovery directory.
   Distribution to the exact target demographic shifted from
   "borderline impossible" to "submit an intake form".

The 24-month window for a category-defining African Mini Pay app
is open. Whoever ships first into the listing with audit-grade
contracts + non-crypto-native UX + operator-market-fit wins outsized
share of MiniPay's organic distribution. Etalo is at the front of
that line.

---

## Appendix

### Live URLs

- App : https://etalo.xyz (Celo Sepolia until J12 mainnet)
- API : https://etalo-api.fly.dev
- Source : https://github.com/BacBacta/Etalo (private —
  [TBD: Mike — decision on going public for grants])
- Twitter : [TBD: Mike — register `@etalo_app` if not yet]
- Farcaster : [TBD: Mike]

### Key contract addresses (Celo Sepolia, post-H-1 redeploy)

| Contract | Address |
|---|---|
| EtaloEscrow | `0xAeC58270973A973e3FF4913602Db1b5c98894640` |
| EtaloDispute | `0xEe8339b29F54bd29d68E061c4212c8b202760F5b` |
| EtaloStake | `0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB` |
| EtaloVoting | `0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A` |
| EtaloReputation | `0x539e0d44c0773504075E1B00f25A99ED70258178` |
| EtaloCredits | `0x778a6bda524F4D396F9566c0dF131F76b0E15CA3` |
| MockUSDT (V2) | `0xea07db5d3D7576864ac434133abFE0E815735300` |
| commissionTreasury | `0x9819c9E1b4F634784fd9A286240ecACd297823fa` |
| creditsTreasury | `0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA` |
| communityFund | `0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6` |

Mainnet addresses to be published in `packages/contracts/deployments/celo-mainnet.json` post J12.

### Audit + decision trail

- `docs/audit/PASHOV_AUDIT_EtaloEscrow.md` — escrow fund-flow audit
- `docs/audit/PASHOV_AUDIT_EtaloDispute.md`
- `docs/audit/PASHOV_AUDIT_EtaloReputation.md`
- `docs/audit/PASHOV_AUDIT_EtaloCredits.md`
- `docs/audit/PASHOV_XRAY.md` — threat model
- `docs/audit/PRE_MAINNET_OPS.md` — operational hardening
  checklist (this PR, May 2026)
- `docs/DECISIONS.md` — 50+ ADRs since J0
- `docs/PRE_MAINNET_QA.md` — performance + latency baseline

---

## Program adaptations

### Proof of Ship S2 — what to foreground

- **Shipping cadence** : the cohort rewards observable monthly
  delivery. Highlight Month 1 / Month 2 / Month 3 deliverables
  in the *Ask* section ; tie them to the cohort review cycle.
- **MiniPay-listing readiness** as differentiator : 11 / 14 items
  done pre-intake. Most cohort entrants haven't run a 14-item
  audit yet.
- **Measurable Mini-App-specific KPIs** : DAU, MAU, retention, tx
  volume per stablecoin, failed-tx rate. Promise a public `/stats`
  page reviewable each month.
- **Total ask** : exactly $20K, structured as 60/25/15 runway /
  acquisition / ops.

### Prezenti Anchor Round — what to foreground

- **Crisp milestones** with verifiable deliverables, each fitting
  the 4-6 week review cadence : mainnet deploy → 1000 tx + listing
  → V1.5 + 2000 sellers.
- **Community + 4-market intra-Africa** angle : Celo wants to grow
  the African community ; Etalo's V1 launch is structurally a
  community-building event (50+ initial sellers hand-onboarded).
- **Technical maturity signal** : Pashov audit + ADR-026 hard caps
  + pre-mainnet ops checklist + V2 indexer-sole-writer invariant.
  Shows the team won't blow up a $25K disbursement in technical
  debt.
- **Total ask** : exactly $25K, $10K / $10K / $5K across 3
  milestones.

### Celo Builder Fund — what to foreground (when ready)

- Investment thesis : Etalo is the commerce-surface layer that
  MiniPay-the-rail can plug into to become a real African e-commerce
  default. Long horizon, large market, defensible operator fit.
- Traction proof points required before applying : 1000+ active
  sellers, $50K+ monthly GMV, < 5% dispute rate sustained over 6
  months, MiniPay listing > 6 months old.
- Verda Ventures follow-on conversation as the upside structure.

### Generic adaptation rules

- **Trim ruthlessly to one page** when the program asks for one. The
  *Executive summary* box at the top + the *Ask* section per program
  + the relevant traction subsection are usually sufficient.
- **Keep the Risks section** even when not asked — reviewers notice
  its absence and read its presence as a maturity signal.
- **Update Traction first** before each application. Stale traction
  numbers in a grant doc are a credibility killer.
- **Never invent numbers** — every `[TBD: Mike]` is there because
  inventing was the alternative. Real "0 sellers, pre-launch" + a
  serious audit + readiness story beats a fake 100-seller story
  every time.

---

*End of master pitch. Maintenance owner : Mike. Next update : post-
J12 mainnet (swap traction numbers + drop the Sepolia caveat).*
