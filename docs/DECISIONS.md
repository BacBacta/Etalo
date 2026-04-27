# Etalo — Architecture Decision Log

This file tracks significant technical decisions and deviations from
CLAUDE.md. Each entry is short and dated (YYYY-MM-DD). When CLAUDE.md
and this file disagree, this file wins until CLAUDE.md is updated.

## Format

Each entry follows:

```
## ADR-XXX · YYYY-MM-DD — Short title

**Status**: Accepted | Superseded by ADR-YYY | Deprecated

**Context**: ...
**Decision**: ...
**Rationale**: ...
**Impact**: ...
```

Additional sections (`Risk`, `Replacement plan`, `Guard before mainnet`) are
used when they add context. ADRs are numbered in chronological order of
acceptance; renumbering is forbidden once an ADR is published — supersede
instead.

---

## ADR-001 · 2026-04-22 — React 19 accepted (overrides CLAUDE.md v1)

**Status**: Accepted

**Context**: CLAUDE.md v1 specifies React 18. Vite 8's `react-ts` template
scaffolds with React 19 + TypeScript 6.

**Decision**: Accept React 19 and TypeScript 6 instead of downgrading.

**Rationale**:
- React 19 is stable since late 2024.
- Wagmi v2 and shadcn/ui officially support React 19.
- Downgrading would introduce technical debt on day one of frontend work.

**Impact**: CLAUDE.md must be updated in a separate commit to reflect the
new baseline (React 19, TypeScript 6).

---

## ADR-002 · 2026-04-22 — Checkout flow uses 3 txs; createAndFund wrapper deferred V1.5

**Status**: Accepted

**Context**: The deployed `EtaloEscrow` splits order creation and USDT
funding into two distinct functions — `createOrder` (metadata only) and
`fundOrder` (pulls USDT via `transferFrom`). Combined with the ERC-20
`approve` step, the checkout flow requires up to 3 sequential txs the
buyer must sign in MiniPay.

**Decision**: Accept the 3-tx UX for MVP. The `approve` step is skipped
when the buyer's existing allowance covers the order amount, reducing
to 2 txs on repeat purchases.

**Replacement plan (V1.5)**: Deploy a thin `EtaloEscrowWrapper` that
exposes `createAndFund(seller, amount, isCrossBorder)` internally
calling both. Reduces the on-chain trip to `approve + createAndFund`
(2 txs, 1 if pre-approved). No change to the core escrow contract.

---

## ADR-003 · 2026-04-22 — CIP-64 (fee in USDT) deferred V1.5

**Status**: Accepted

**Context**: Celo supports paying gas in ERC-20 (CIP-64, tx type 0x7b)
via the USDT adapter at `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`.
This means buyers without CELO could still pay gas if we built the tx
with `feeCurrency` set to the adapter.

**Decision**: Keep fees native (CELO) for Block 7. We rely on MiniPay's
own gas sponsorship / funding for users. Viem v2 does not support CIP-64
out of the box; wiring it requires a custom `signTransaction` path.

**Risk**: Users without CELO on Celo Sepolia would fail. Mitigated by
MiniPay which typically sponsors or funds CELO for its users.

**Replacement plan (V1.5)**: Add a `feeCurrency` option to
`asLegacyTx()` helper that emits type `0x7b` when set. Requires raw
signing via viem serializers.

---

## ADR-004 · 2026-04-22 — On-chain event indexing deferred V1.5

**Status**: Accepted

**Context**: After a successful checkout, the Mini App POSTs tx hashes
to `/api/v1/orders/confirm`. The backend writes the DB Order row
trusting the frontend — there is no on-chain verification today.

**Decision**: Frontend-driven sync is acceptable for MVP. An attacker
that forges tx hashes produces a DB row inconsistent with on-chain
state, but the on-chain escrow remains the source of truth (the
attacker's order doesn't actually hold any USDT).

**Replacement plan (V1.5)**: Background indexer (polling or The Graph
subgraph) that subscribes to `OrderCreated`, `OrderFunded`,
`OrderShipped`, `OrderCompleted`, `OrderDisputed` events and
reconciles the DB. Makes the DB eventually consistent with the chain.

---

## ADR-005 · 2026-04-22 — Buyer country defaults to cross-border

**Status**: Accepted

**Context**: `is_cross_border` determines commission (2.7% vs 1.8%)
and auto-release window (7 vs 3 days). The backend needs both buyer
and seller countries to compute it — but new buyer wallets have no
`User.country` field set yet (country only lands at onboarding, which
is a seller-flow).

**Decision**: When buyer country is unknown, default to
`is_cross_border = true`. Higher commission, longer auto-release —
safer pessimistic default for the protocol and buyer (more time to
dispute).

**Risk**: Intra-Africa buyers who never onboarded are over-taxed
(2.7% instead of 1.8%) until they set their country.

**Replacement plan (V1.5)**: Add a buyer-side onboarding step at first
checkout that captures country. Frontend hook `useBuyerCountryGate()`
shows a one-time country picker before `/orders/initiate`.

---

## ADR-006 · 2026-04-22 — Checkout uses 1 confirmation on Celo Sepolia

**Status**: Accepted

**Context**: `waitForTransactionReceipt` accepts a `confirmations`
param. Too low = optimistic UX at risk of reorg rollback; too high =
slow UX.

**Decision**: `confirmations: 1` on Celo Sepolia. Celo L2 has fast
finality for testnet purposes.

**Replacement plan (mainnet)**: Bump to 2–3 confirmations before mainnet
launch. Re-evaluate when observing real mainnet finality times.

---

## ADR-007 · 2026-04-22 — MockUSDT allowance-to-allowance works; real USDT may not

**Status**: Accepted

**Context**: MockUSDT inherits OpenZeppelin ERC-20 → `approve(spender,
newAmount)` overwrites freely. The original Tether USDT on Ethereum
mainnet requires `approve(0)` before changing from a non-zero value
(race-condition prevention).

**Decision**: On testnet (MockUSDT) we skip the reset-to-zero dance.
Code path in `useCheckout` calls `approve(newAmount)` directly when
current allowance is not enough.

**Guard before mainnet**: Verify whether the Celo mainnet USDT at
`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` requires the reset
(bridged USDT behavior varies). If yes, add the extra
`approve(0)` tx when `0 < currentAllowance < amount`.

---

## ADR-008 · 2026-04-22 — WhatsApp order notifications are stored, not sent

**Status**: Accepted

**Context**: Block 7 creates a `Notification` row (type
`order_created`) for the seller on every successful checkout, but the
Twilio WhatsApp integration is not wired.

**Decision**: Persist the notification with `sent=false` and empty
`sent_at`. A future worker picks up unsent rows and dispatches via
Twilio.

**Replacement plan**: Dedicated block to wire `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` from env, build
`services/whatsapp.py`, and a background worker polling
`notifications WHERE sent=false` every 30s.

---

## ADR-009 · 2026-04-22 — MiniPay native deep-link deferred

**Status**: Accepted

**Context**: Block 6 ships the public product page. The "Buy" CTA
needs to route a buyer into the Mini App. The MiniPay-native deep-link
scheme (`minipay://` or a universal link) is not yet confirmed in our
docs at the time of implementation.

**Decision**: Use a plain HTTPS link to `${NEXT_PUBLIC_MINIAPP_URL}/
checkout/{productId}`. Inside the MiniPay WebView the link opens the
Mini App directly; in a regular browser it lands on the Mini App's
landing page which itself shows the "Open in MiniPay" prompt.

**Why it's acceptable**: The UX loss is minor — one extra tap for
users who arrive from social shares outside MiniPay. No functional
regression.

**Replacement plan**: When the official MiniPay deep-link format is
confirmed, swap `BuyButton.tsx`'s href for the native scheme. ~5 LOC
change, no architectural impact.

---

## ADR-010 · 2026-04-22 — Raw IPFS og:image for V1

**Status**: Accepted

**Context**: The Next.js product page needs `og:image` for social
previews. Ideal spec is 1200x630 with the product + shop branding.

**Decision**: Use the product's first IPFS image URL as-is. Social
networks (WhatsApp, Instagram, Twitter) resize on their side, so the
raw image still renders, just not at optimal framing.

**Replacement plan (V1.5)**: Implement a dynamic OG image generator
at `web/src/app/[handle]/[slug]/opengraph-image.tsx` using Next's
built-in `ImageResponse` — composes the product photo, shop name,
and price into a 1200x630 frame.

---

## ADR-011 · 2026-04-22 — X-Wallet-Address header temporary for /sellers/me

**Status**: Accepted

**Context**: Block 3 of Sprint J2 introduces `GET /api/v1/sellers/me` but
the JWT auth dependency (produced by `/auth/verify`) is not yet wired.

**Decision**: Accept the caller's wallet address through a non-standard
`X-Wallet-Address` HTTP header as a **development-only** stand-in for
JWT auth. The backend setting `ENFORCE_JWT_AUTH=false` enables this
path; setting it to `true` causes the endpoint to return 501 until
proper JWT verification is implemented.

**Risk**: Any caller can impersonate any wallet by setting the header
themselves. **Never deploy with `ENFORCE_JWT_AUTH=false`.**

**Replacement plan**: A dedicated "auth JWT wiring" block must land
before any deployment (staging or prod). That block replaces
`get_current_wallet()` in `packages/backend/app/routers/sellers.py`
with a JWT-backed dependency, and the Mini App's `apiFetch()` wrapper
(packages/miniapp/src/lib/api.ts) swaps `X-Wallet-Address` for
`Authorization: Bearer <jwt>`.

**Scope of the shortcut**: Currently used by `/sellers/me` only. Any
new endpoint that needs the caller's identity should reuse the same
`get_current_wallet` dependency so we have one place to upgrade.

---

## ADR-012 · 2026-04-22 — Wagmi v2 retained (not v3, despite CLAUDE.md)

**Status**: Accepted

**Context**: CLAUDE.md v1 specifies Wagmi v3. Wagmi v3 has shipped, but
documentation and community examples are still sparse.

**Decision**: Use Wagmi v2 (latest stable) for J1-J2 and the MVP.

**Rationale**:
- Solo developer sprint — minimize surprises.
- Wagmi v2 pairs cleanly with Viem v2 and has mature docs.
- Migration to v3 is planned for product V2, once ecosystem matures.

**Impact**: CLAUDE.md line 15 currently reads "Wagmi v3" — to be corrected
in the same commit as the React 19 update.

---

## ADR-013 · 2026-04-23 — Proof of Ship submission deferred to June 2026

**Status**: Accepted

**Context**: Initial plan targeted the April 26, 2026 Proof of Ship monthly
submission. The V1 scope at that time was a single-product checkout. The
April 23 redesign concluded that V1 should be a multi-product Boutique
with cart, dual-mode marketplace, and asset generator (see ADR-014).
Shipping the original scope on April 26 would have meant submitting a
non-representative version or rushing the new scope at the cost of quality.

**Decision**: Skip the April 2026 submission. Target the June 2026 Proof
of Ship cycle instead.

**Rationale**:
- Proof of Ship cycles are monthly — the opportunity cost of skipping is
  ~2 months.
- A rushed April submission would misrepresent the product and waste
  review capital.
- The expanded V1 (Boutique + marketplace + asset generator) is a
  stronger submission story once complete.

**Impact**: Sprints J3–J11 shift to mid-May through June 2026. Grant
application timelines (Celo Foundation, September 2026) remain unaffected.

---

## ADR-014 · 2026-04-23 — V1 pivot to multi-product Boutique model

**Status**: Accepted

**Context**: The original V1 was a single-product checkout: one URL →
one item → one transaction. Target sellers (African informal vendors on
Instagram, WhatsApp, TikTok) actually operate **catalogs** of 10–100
items. Forcing a 1-item-per-checkout flow created buyer drop-off and
mismatched the sellers' real commercial reality.

**Decision**: Reframe V1 around three integrated pillars:
1. **Per-seller Boutique** at `etalo.app/[handle]` — full catalog, cart,
   single checkout for N items from the same seller.
2. **Dual-mode MiniPay app** — buyer and seller modes in the same Mini
   App, tapping MiniPay's 7M user base as a built-in buyer pool.
3. **Asset generator (monetized)** — per-product content pack (5
   platform-sized images + multilingual captions + hashtags) sold in
   credits.

**Rationale**:
- Informal social-commerce sellers list catalogs, not single items.
  Matching that reality removes structural friction.
- Dual-mode surface taps MiniPay's native user base, reducing
  acquisition cost.
- Asset generator monetizes the escrow core via a complementary revenue
  stream (credits at 0.15 USDT each — see `docs/PRICING_MODEL_CREDITS.md`).

**Impact**:
- Redefines every downstream sprint (J4–J11) around the Boutique model.
- Introduces new contract surfaces (`EtaloStake`, `EtaloCredits`,
  `EtaloVoting` for N3 dispute).
- V1 deliverable is now a full social-commerce platform, not a checkout
  primitive.

---

## ADR-015 · 2026-04-23 — Smart Contract V2 — Order / ShipmentGroups / Items hierarchy

**Status**: Accepted

**Context**: The V1 `EtaloEscrow` models each checkout as a single, flat
Order. With V1 Boutique (ADR-014) a checkout now bundles **N items**
from the same seller, sometimes shipped in one parcel, sometimes split
across multiple shipments. The flat model cannot represent item-level
disputes (e.g. buyer received 3 of 5 items) nor partial shipment
progress.

**Decision**: Restructure V2 around three nested concepts:
- **Order** — the global checkout operation; holds buyer, seller, total
  amount, commission.
- **Items[]** — logical units; each item has its own price, commission
  share, status, and is the **sole target of buyer disputes**.
- **ShipmentGroups[]** — physical packaging; each group references a
  subset of items sharing a single shipping proof, arrival proof, and
  release timer.

Items form the **logical** axis (what can be disputed). Groups form the
**physical** axis (how things are shipped). Many items can share one
group; one item belongs to exactly one group.

**Rationale**:
- Real-world shipping: a seller may combine 4 items into one parcel
  (one shipment proof) but the buyer may dispute only 1.
- Disputing at item level while tracking shipment state at group level
  matches the actual operational flow.
- Cleaner than modeling everything at the item level (duplicated
  shipping proofs) or at the group level (coarse-grained disputes).

**Impact**:
- `EtaloEscrow.sol` requires a full rewrite (Sprint J4).
- Replaces the 4×25% cross-border milestone system (see ADR-017).
- Backend Order schema gains nested `items` and `shipment_groups`
  arrays; migrations needed in Sprint J5.
- Full technical specification lives in `docs/SPEC_SMART_CONTRACT_V2.md`
  (1018 lines, commit `ceb2a8f`).

---

## ADR-016 · 2026-04-23 — MiniPay dual-mode app (buyer + seller)

**Status**: Accepted

**Context**: V1 initially envisioned two separate surfaces — a public web
product page for buyers and a MiniPay Mini App for sellers. MiniPay's 7M
weekly active users represent a large latent buyer base for African
social commerce. Keeping buyers off the Mini App forfeits that audience.

**Decision**: Ship a single Mini App operating in two modes:
- **Buyer mode** — shop discovery, catalog browsing, cart, checkout,
  order tracking, disputes.
- **Seller mode** — shop dashboard, product management, order
  fulfillment, stake management, credits.

Mode switching is fluid; the same wallet can act as both buyer and
seller without friction. Default landing depends on the user's primary
role (seller-onboarded wallets land in seller mode; others land in
buyer mode).

**Rationale**:
- Unifies acquisition: one URL, one install, two audiences.
- Leverages MiniPay's 50M weekly impressions and 5M weekly app opens as
  a built-in discovery surface.
- Matches reality — many informal sellers also buy from peers; enforcing
  a role split is artificial.

**Impact**:
- MiniApp routing and navigation need a mode-aware IA (Sprint J7).
- Public SSR pages (`packages/web`) remain for SEO and shareable links
  but become secondary acquisition paths.
- Backend seller/buyer endpoints must tolerate a single wallet in both
  roles.

---

## ADR-017 · 2026-04-23 — Cross-border 4×25% milestones removed in favor of items+groups

**Status**: Accepted, supersedes the original V1 milestone design.

**Context**: The V1 `EtaloEscrow` proposed a 4-milestone release schedule
for cross-border orders (25% at funding, 25% at shipment, 25% at
arrival, 25% at confirmation). This mechanism predated the
Order/ShipmentGroups/Items hierarchy (ADR-015). Keeping both systems
side-by-side creates redundant state machines and conflicting release
math.

**Decision**: Remove the 4×25% milestone scheme entirely. Cross-border
release now happens in three stages driven by shipment group state
transitions (see ADR-018). Item-level disputes override group-level
releases when triggered.

**Rationale**:
- Items + groups already encode progress granularity better than fixed
  milestones.
- Fixed 25% buckets misalign with reality: real orders rarely split
  work evenly across four phases.
- One source of truth for release logic (shipment groups) simplifies
  auditing and reasoning.

**Impact**:
- `releaseMilestone` function and related state removed from
  `EtaloEscrow` V2.
- Sprint J4 scope slightly reduced (less code to reimplement).
- ADR-018 defines the replacement release schedule.

---

## ADR-018 · 2026-04-23 — Cross-border progressive release: 20% / 70% / 10%

**Status**: Accepted

**Context**: With the Items/ShipmentGroups hierarchy (ADR-015) and the
removal of fixed milestones (ADR-017), cross-border orders need a
replacement release schedule. These orders involve long transit times
and the seller bearing upfront shipping cost, creating asymmetric risk
between parties.

**Decision**: Three-stage progressive release per shipment group:
- **20%** on seller shipping proof upload (carrier receipt + photo,
  hash stored on-chain).
- **70%** on arrival in destination country + 72h without dispute
  (majority release).
- **10%** on buyer confirmation **or** auto-release 5 days after
  majority release.

**Rationale**:
- The 20% upfront compensates the seller's real shipping expense and
  cannot be triggered without a verifiable carrier receipt.
- The 70% majority release rewards physical arrival in the buyer's
  country while the 72h buffer gives a reasonable dispute window.
- The final 10% incentivizes buyer confirmation while capping seller
  risk if the buyer ghosts.

**Impact**:
- `EtaloEscrow` V2 constants (basis points): `SHIPPING_RELEASE_PCT =
  2000`, `MAJORITY_RELEASE_PCT = 7000`, `FINAL_RELEASE_PCT = 1000`.
- Timers: `MAJORITY_RELEASE_DELAY = 72 hours`, `AUTO_RELEASE_CROSS_FINAL
  = 5 days`.
- Requires `uploadShipmentProof(groupId, proofHash)` and
  `markArrived(groupId, proofHash)` functions with events for off-chain
  indexing.

---

## ADR-019 · 2026-04-23 — Strict seller inactivity deadlines (7d intra / 14d cross-border)

**Status**: Accepted

**Context**: Funds sitting in escrow while a seller fails to ship block
the buyer's capital indefinitely. V1 had no code-enforced deadline —
buyers had to rely on manual dispute opening with no hard bound.

**Decision**: Code-enforced auto-refund deadlines:
- **Intra-Africa**: 7 days after funding without any shipment group
  created → automatic refund available.
- **Cross-border**: 14 days after funding without any shipment group
  created → automatic refund available.

No extensions or admin overrides in V1 (simplicity and predictability).
Trigger function `triggerAutoRefundIfInactive(orderId)` is
**permissionless** — callable by anyone, including the buyer or a
third-party helper.

**Rationale**:
- Predictable worst case for the buyer: capital returns within a week
  (intra) or two (cross-border) if the seller ghosts.
- Permissionless triggering avoids a centralized cron or admin
  intervention; the protocol self-heals.
- Asymmetric deadlines match reality — intra-Africa shipping should
  dispatch within a week, cross-border logistics legitimately need more.
- No extensions keeps the state machine auditable; edge cases fall back
  to the dispute system.

**Impact**:
- `EtaloEscrow` V2 constants: `AUTO_REFUND_INACTIVE_INTRA = 7 days`,
  `AUTO_REFUND_INACTIVE_CROSS = 14 days`.
- Deadline applies at order level: if the seller has created zero
  shipment groups by the deadline, the whole order refunds.
- UI must surface a countdown to buyers in order tracking views.

---

## ADR-020 · 2026-04-23 — Cross-border seller stake — 3-tier structure

**Status**: Accepted

**Context**: ADR-018 releases 20% of cross-border funds to the seller
before buyer-side arrival confirmation. A malicious seller could submit
a fake shipping proof and abscond with that 20%. A seller stake creates
a secondary recovery pool and aligns incentives with delivery.

**Decision**: Sellers must deposit a stake to participate in cross-border
orders. Three tiers:

| Tier | Name | Stake | Max concurrent cross-border sales | Max order price | Eligibility |
|------|------|-------|-----------------------------------|-----------------|-------------|
| 1 | Starter | 10 USDT | 3 | 100 USDT | Automatic on first opt-in |
| 2 | Established | 25 USDT | 10 | 200 USDT | 20+ completed sales + 60+ days active |
| 3 | Top Seller | 50 USDT | Unlimited | Unlimited | Top Seller badge from `EtaloReputation` |

Stake is held in a new contract `EtaloStake`. Slashable by
`EtaloDispute` on proven fraud. Slashed amounts flow first to the
victim buyer; surplus to `communityFund` (ADR-024).

**Rationale**:
- Progressive tiers let new sellers enter with low capital friction,
  then scale exposure as reputation builds.
- Caps on concurrent sales and order price bound the stake-to-exposure
  ratio (Tier 1: 3×100 = 300 USDT exposure against 10 USDT stake — the
  stake is a partial, not full, recovery mechanism; paired with dispute
  system and architectural limits ADR-026).
- Top Seller tier rewards proven operators with unlimited headroom.

**Impact**:
- New contract `EtaloStake.sol` in Sprint J4.
- Cross-border `createOrder` reverts if the seller has not met the
  applicable tier's stake.
- `EtaloReputation` exposes Top Seller eligibility queries for Tier 3
  gating.

---

## ADR-021 · 2026-04-23 — Stake withdrawal with 14-day cooldown and dispute freeze

**Status**: Accepted

**Context**: Sellers need an exit path (full withdrawal, tier downgrade,
leaving the platform) but must not be able to cash out their stake right
before a fraud dispute surfaces.

**Decision**: Two-phase withdrawal:

1. **`initiateWithdrawal(newTier)`** — `newTier = 0` for full exit,
   `newTier < currentTier` for downgrade. Preconditions: zero active
   cross-border sales. Starts a 14-day cooldown.
2. **`executeWithdrawal()`** — callable after the 14-day cooldown
   **and** no active dispute against the seller.

Additional rules:
- A dispute opened during cooldown **freezes** the cooldown (pure
  freeze, no extension — timer resumes post-resolution).
- `cancel` callable any time during cooldown; stake reactivates
  immediately.
- Downgrade returns the delta (e.g., Tier 2 → Tier 1 returns 15 USDT,
  keeps 10).
- Multiple downgrades over time are allowed; no annual cap.

**Rationale**:
- 14 days gives disputes time to surface after the seller's last sale
  — a fraudulent seller cannot ship, get paid, and instantly exit.
- Dispute-triggered freeze prevents a seller from running out the clock
  while an open case exists.
- Downgrade path preserves optionality — sellers can right-size their
  exposure without full exit.
- Cancel option lowers the psychological cost of initiating.

**Impact**:
- State machine in `EtaloStake.sol`: `Active → CooldownPending →
  Withdrawable → Withdrawn` (with `Frozen` and `Cancelled` sub-states).
- `EtaloDispute` requires cross-contract hooks: `pauseWithdrawal(seller)`
  on dispute open, `resumeWithdrawal(seller)` on resolution.
- Seller dashboard UI must display cooldown remaining and any active
  dispute blocking withdrawal.

---

## ADR-022 · 2026-04-23 — Non-custodial positioning per Zenland / Circle standard

**Status**: Accepted

**Context**: Etalo uses a human mediator at level 2 of the dispute
system, alongside automated smart contract logic. The question arose
whether we can legitimately claim "non-custodial" status, or whether
"self-custodial with escrow" would be more accurate. The term has
marketing weight, regulatory signaling, and user-trust implications.

**Decision**: Position Etalo officially as **non-custodial**, following
the Zenland / Circle Refund Protocol / OpenSea standard. The claim rests
on four criteria Etalo satisfies:

1. Funds live in a public, verifiable smart contract on Celo.
2. Code is publicly readable on CeloScan.
3. Mediator power is **structurally bounded by code** — mediators can
   only trigger refund or release along allowed paths; they cannot
   seize funds or freeze them indefinitely.
4. Automated deadlines (ADR-019) and restricted admin functions
   (ADR-023) prevent indefinite freezing.

Alternative "self-custodial with escrow" wording was rejected as too
purist for market standard; it creates unnecessary positioning friction
versus direct comparables.

**Rationale**:
- Market comparables (Zenland with staked mediator agents, Circle
  Refund Protocol with limited-power arbiters, OpenSea) all operate
  with similar human-in-the-loop models and use "non-custodial"
  terminology.
- The four criteria provide a concrete, auditable definition defensible
  to technical reviewers.
- Three-level dispute system (N1 amicable 48h → N2 human mediation 7
  days → N3 on-chain community vote 14 days) guarantees every
  escalation terminates in a code-enforced resolution.

**Impact**:
- All external-facing copy (landing, pitch, grants, Proof of Ship) uses
  "non-custodial" without qualifier.
- Technical FAQ documents the four criteria with CeloScan links.
- Architectural limits (ADR-026) and `forceRefund` restriction
  (ADR-023) reinforce this positioning — relaxing either would weaken
  the claim.

---

## ADR-023 · 2026-04-23 — `forceRefund` restricted by three codified conditions

**Status**: Accepted, supersedes V1's unrestricted `forceRefund`.

**Context**: V1 `EtaloEscrow.forceRefund(uint256 orderId)` is gated only
by `onlyOwner`, with no on-chain conditions — any admin call can refund
any active order at will. Git history investigation (commit `d74bfe1`,
Sprint J1) confirmed this was a defensive "break-glass" pattern
introduced at day 0 without a documented use case, no NatSpec, no ADR,
and minimal tests (happy path + non-owner rejection only). This is
incompatible with the non-custodial positioning (ADR-022).

**Decision**: Retain `forceRefund` in V2 but gate it behind three
codified conditions, all of which must hold:
1. **Dispute contract inactive** — `disputeContract == address(0)`
2. **Prolonged order inactivity** — `block.timestamp >
   order.lastActivityAt + 90 days`
3. **Registered legal hold** — `legalHoldRegistry[orderId] != bytes32(0)`

Required additions:
- Event `ForceRefundExecuted(orderId, admin, amount, timestamp,
  reasonHash)`
- Function `registerLegalHold(orderId, bytes32 documentHash)` —
  `onlyOwner`, publicly queryable, creates an on-chain paper trail
- NatSpec documenting the three conditions and the intended use (legal
  injunctions, genuinely stalled funds)
- Exhaustive tests covering each condition in isolation and in
  combination

**Rationale**:
- Preserves a true last-resort safety valve for edge cases outside
  normal dispute flow (legal orders, lost keys, dispute contract
  migration).
- Bounds admin power by publicly verifiable on-chain conditions —
  compatible with ADR-022.
- 90-day inactivity threshold aligns with typical legal claim timelines.
- Legal hold registry creates auditable public trace of any
  `forceRefund` usage.

**Impact**:
- `EtaloEscrow` V2 state adds `legalHoldRegistry` mapping.
- Admin cannot use `forceRefund` on active orders — they go through
  the normal dispute flow.
- Removes the "trust us" nature of V1's unrestricted admin function.

---

## ADR-024 · 2026-04-23 — Treasury architecture: three separated wallets

**Status**: Accepted

**Context**: V1 routed all commission revenue into a single `treasury`
EOA. This mixes multiple revenue streams, risks confusion with the
developer's personal wallets, and creates a single point of failure for
all protocol revenue.

**Decision**: Separate on-chain revenue flows into three dedicated
wallets:
- **`commissionTreasury`** — receives escrow commissions (1.8% intra,
  2.7% cross-border, 1.2% Top Seller).
- **`creditsTreasury`** — receives asset-generator credit sales (0.15
  USDT × quantity).
- **`communityFund`** — receives slashed-stake surplus after victim
  buyer refund, plus future donations earmarked for community uses.

Each wallet has its own `onlyOwner` setter emitting an indexed event
(`CommissionTreasuryUpdated`, `CreditsTreasuryUpdated`,
`CommunityFundUpdated`).

Deferred to V3+ (out of V1 Boutique scope):
- Multisig on any of the three wallets (premature for solo dev;
  revisit at first co-founder or advisor of confidence).
- On-chain automatic splits (adds complexity; manual allocation
  suffices at early volumes).

Communication: addresses are publicly verifiable on CeloScan but not
proactively marketed. Minimal `SECURITY.md` to create later.

**Rationale**:
- Clear revenue-stream separation simplifies accounting and audit
  traceability.
- Separation from personal wallets removes ambiguity in "where does the
  money go" — strengthens trust signals.
- `communityFund` earmarks stake surplus for community uses (future N3
  incentives, bug bounty, small grants), aligning with the protocol's
  ethos.

**Impact**:
- V2 `EtaloEscrow`, `EtaloStake`, and `EtaloCredits` each reference the
  appropriate treasury address.
- Deployment playbook must configure three distinct Celo wallets
  (ideally hardware wallets or secure key management).
- V1 single-`treasury` references removed in the refactor.

---

## ADR-025 · 2026-04-23 — Pragmatic Africa-first audit strategy (phased)

**Status**: Accepted

**Context**: Standard smart-contract audits cost $40,000–$60,000 USD —
unaffordable for a solo dev without revenue. Competitive analysis of
direct African escrow players (Nigeria: Peppa, EscrowLock, AtaraPay,
Vahlid, Vesicash; Kenya: Escroke, Empower Smart, JointPesa, Pansoko;
Ghana: TuaSafe) revealed: all are 100% custodial bank-based services,
none have published technical audits, and trust rests on banking
licenses + branding + operating history. Smart-contract audit is a
Web3-global standard, not an African escrow-industry standard.

**Decision**: Phased audit strategy prioritizing code quality, open
source, and peer review over paid audits until traction justifies the
spend.

- **Phase 1 (April–December 2026, budget $0)**: Free tooling (Slither,
  Aderyn, Mythril, Foundry invariants). Test coverage target 85%+.
  Full open-source repo. Contracts verified on CeloScan. Peer review
  via Celo Discord and Farcaster.
- **Phase 2 (September 2026)**: Apply for Celo Foundation audit grants
  (`team@verda.ventures`, Celo Builder Fund, CeloPG).
- **Phase 3 (Q4 2026 – Q1 2027)**: Audit competition (Cantina /
  Sherlock / Code4rena, $8–15k prize pool) **or** audit firm if a grant
  is obtained.
- **Phase 4 (post-mainnet)**: Permanent bug bounty via Immunefi with
  tiered rewards ($500–$10,000 per valid bug).

Total budget before significant traction: **$0 – $15,000 USD**.

**Rationale**:
- Etalo's non-custodial positioning (ADR-022) is already the key
  differentiator in the African market — no competitor has published
  audits, so audit is a "plus" not a "must" for market entry.
- Architectural limits (ADR-026) cap dollar-value at risk during the
  unaudited phase, making opportunistic exploitation economically
  unattractive.
- Grants and competitions can deliver paid-audit quality without
  upfront capital.
- Spending $50k on an audit pre-traction would starve other critical
  work (UX, marketing, user acquisition).

**Impact**:
- Sprint J4+ test discipline: 85%+ coverage target with Foundry
  invariants.
- Repository remains publicly readable; contracts CeloScan-verified
  after every deployment.
- Pre-mainnet (Q1 2027) gate: at least one external review completed
  (grant, audit firm, or competition).
- Enterprise partnerships (diaspora platforms, remittance companies)
  that require a formal audit become triggers that can accelerate
  Phase 3.

---

## ADR-026 · 2026-04-23 — Architectural limits hardcoded in the smart contract

**Status**: Accepted

**Context**: In the absence of an early formal audit (ADR-025), users
need code-level assurance that the worst-case loss from any exploit or
protocol failure is bounded. Uncapped exposure would make a single
vulnerability potentially catastrophic and would undermine the
non-custodial claim.

**Decision**: Hardcode immutable limit constants in `EtaloEscrow` V2:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_TVL_USDT` | 50,000 USDT | Global TVL cap; new orders revert when exceeded |
| `MAX_ORDER_USDT` | 500 USDT | Single order cap |
| `MAX_SELLER_WEEKLY_VOLUME` | 5,000 USDT | Rolling 7-day cap per seller |
| `EMERGENCY_PAUSE_MAX` | 7 days | Admin pause auto-expires after 7 days |
| `EMERGENCY_PAUSE_COOLDOWN` | 30 days | Minimum gap between emergency pauses |
| `MAX_ITEMS_PER_GROUP` | 20 | Gas-safety operational cap |
| `MAX_ITEMS_PER_ORDER` | 50 | Gas-safety operational cap |

These constants are **not admin-adjustable** in V1. Raising them
requires a V2.1 contract deployment with explicit migration and user
communication.

**Rationale**:
- Maximum possible protocol loss is bounded at 50,000 USDT —
  manageable, potentially insurable, not existential.
- Etalo becomes an uninteresting target for sophisticated attackers
  (low upside relative to effort).
- Architectural caps reinforce the non-custodial claim (ADR-022) —
  the contract cannot be drained beyond these ceilings even by admin
  action.
- Progressive growth path: limits can be raised post-audit (ADR-025
  Phase 3+) once stability is proven.
- Bounded emergency pause prevents indefinite admin freezing; cooldown
  prevents repeat abuse.

**Impact**:
- V1 Boutique intentionally targets small-volume markets (informal
  sellers, mobile-first buyers) where 500 USDT per order is comfortable
  headroom.
- When weekly seller volume or TVL approaches a cap, this is a
  product-market-fit signal triggering contract upgrade planning.
- Pre-mainnet checklist must verify that current tests include
  invariant coverage for each limit.
- Upgrades require clear user communication (V1 contracts are **not
  proxy-upgradable** — a new contract means a new address).

---

## ADR-027 · 2026-04-23 — SPEC §12 as canonical function naming, plus setStakeContract wiring

**Status**: Accepted

**Context**: During Sprint J4 Block 2 implementation, seven name or
signature divergences surfaced between `docs/SPEC_SMART_CONTRACT_V2.md`
and the `docs/SPRINT_J4.md` Block 7 sketch (e.g. `createOrderWithItems`
vs `createOrder`, `shipItemsGrouped` vs `createShipmentGroup`,
`triggerAutoReleaseForItem` vs `triggerFinalRelease`, `OrderStatus`
9 vs 6 values, `ShipmentStatus.Delivered` vs `Released`, `uint8 tier`
vs `StakeTier` enum, `markItemDisputed` vs `freezeItem`). The SPEC is
the more rigorous document and declares itself the technical source of
truth.

**Decision**: `docs/SPEC_SMART_CONTRACT_V2.md` is the canonical source
for V2 function names, enum values, struct shapes, and event
signatures. Implementation deviates from SPEC only where strictly
necessary for wiring that the SPEC omits — specifically `setStakeContract`
on `EtaloEscrow`, which is required for the `EtaloEscrow → EtaloStake`
eligibility and concurrent-sales hooks but is absent from SPEC §12.4's
admin setter list. The `EtaloTypes.StakeTier` enum replaces SPEC §6.3's
`uint8 tier` parameter for type safety; this is a mechanical
improvement, not a behavioral change.

**Rationale**: A single canonical source prevents drift between spec
and code. `docs/SPRINT_J4.md` is a tactical plan that can contain
obsolete hints; when SPRINT and SPEC disagree, SPEC wins. Any future
divergence from SPEC beyond cosmetic wiring must be justified by a new
ADR.

**Impact**:
- Block 2 interfaces landed with SPEC names throughout.
- `setStakeContract` added to `IEtaloEscrow` without a separate ADR
  beyond this one — all other SPEC §12.4 admin setters are preserved
  as documented.
- SPRINT_J4.md Block 7 function names (e.g. `createOrder`,
  `createShipmentGroup`, `freezeItem`) are obsolete; defer to SPEC §12
  when reading that block for Block 7 implementation.
- Future sprints (J5 backend, J6 frontend) should bind to the SPEC
  names via the `IEtaloX` interfaces emitted from this sprint.

---

## ADR-028 · 2026-04-23 — Stake auto-downgrade after slash, topUpStake recovery, and orphan stake drain

**Status**: Accepted

**Context**: Three coupled gaps in `EtaloStake` surfaced after Block
4: (1) if `slashStake` reduces a seller's stake below the tier
amount, the seller nominally retains the tier with insufficient
collateral, breaking the stake/exposure ratio guaranteed by ADR-020;
(2) no UX path to restore coverage after a slash short of
re-depositing from scratch; (3) a slash leaving a residual
`0 < stake < TIER_1_STAKE` locks the seller at tier `None` with no
withdrawal path — a contradiction with ADR-022's "funds cannot be
frozen indefinitely".

**Decision**:

1. **Auto-downgrade in `slashStake`** — after reducing stake, set tier
   to the highest tier supported via `_supportedTier(stake)` (possibly
   `None`). Eligibility checks are skipped on this forced transition
   because the slash is driven by dispute, not by the seller.

2. **`topUpStake(amount)`** — new user-facing function. Adds USDT to
   an existing stake without changing tier; capped at
   `_stakes[seller] + amount <= TIER_3_STAKE` to prevent typo-driven
   overfunding. Seller uses `upgradeTier` separately to climb tiers
   (which enforces eligibility).

3. **Orphan stake drain** — `initiateWithdrawal(newTier)` relaxed to
   accept `newTier == None` when `currentTier == None && _stakes[seller]
   > 0`. Same 14-day cooldown; `executeWithdrawal` transfers the
   residual.

4. **Refund math on `initiateWithdrawal` and `upgradeTier`** switches
   from "tier-amount delta" to "actual-stake delta" so over-
   collateralized stakes produced by auto-downgrade or `topUpStake`
   are accounted correctly. `upgradeTier` becomes free when the
   seller is already over-collateralized at the target tier
   (delta = 0 → no transfer, just tier update).

**Rationale**: Preserves stake-as-collateral after any slash and keeps
ADR-022's non-custodial claim intact for every post-slash state,
residuals included. Sellers aren't permanently blacklisted — they can
`topUpStake` to restore coverage or drain the residual to exit
cleanly.

**Impact**: Two new events (`TierAutoDowngraded`, `StakeToppedUp`).
Eight new Hardhat tests added to `EtaloStake.test.ts` covering
exact-match / skip-tier / orphan auto-downgrade paths, no-downgrade
on over-collat, `topUpStake` success and cap rejection,
withdrawal-active rejection, orphan drain via `initiateWithdrawal
(None → None)`, and free `upgradeTier` when already over-
collateralized. Total Stake suite: 33 tests.

---

## ADR-029 · 2026-04-23 — N3 vote refund semantics with partial releases

**Status**: Accepted

**Context**: Before Block 8, the Dispute contract's
`resolveFromVote` function set `refundAmount = itemPrice` on
`buyerWon`. For cross-border orders with partial releases already
triggered (20% at ship per ADR-018, 70% at arrival), this would
revert in `Escrow.resolveItemDispute` because
`refundAmount > remainingInEscrow`. The bug left disputes stuck in
`N3_Voting` state indefinitely after finalization. It was not caught
by Block 6 unit tests because those use `MockEtaloEscrow`, which
silently accepts any `refundAmount` without the remaining-escrow cap.
Only the Block 8 end-to-end integration flow (scenario 10) exercises
the real Escrow↔Dispute↔Voting interaction with a prior partial
release.

**Decision**: N3 `buyerWon` vote refunds the `remainingInEscrow`
(`itemPrice - releasedAmount`), not the full `itemPrice`. Already-
released portions stay with the seller.

**Rationale**:
- ADR-018 defines the 20% shipping release as compensation for real
  shipping expense, provable via carrier receipt. Even if the buyer
  wins a dispute, the seller genuinely shipped and paid transport
  costs.
- The 70% majority release is conditioned on physical arrival in the
  destination country — a legitimate arrival compensation.
- For fraud-based clawback beyond escrow (e.g., seller shipped an
  empty box and lied about shipping), the `stake.slashStake`
  mechanism is the appropriate tool. It is invoked by an N2 mediator
  who can assess fraud evidence directly. N3 voting is a tie-breaker
  on unresolved disputes, not a fraud determination.
- Capping N3 refund at `remainingInEscrow` preserves the layered
  design: escrow releases are earned as milestones tick by, stake
  slash is punitive and scoped to proven fraud.

**Impact**:
- `EtaloDispute.resolveFromVote` now reads `item.releasedAmount` via
  `IEtaloEscrow.getItem()` (already present on the interface) to
  compute the cap. 2-line logic change + NatSpec.
- For cross-border orders where N3 rules for the buyer after partial
  release and fraud is suspected but was not proven in N2: the
  seller keeps the 20–90% already released. This is an acceptable
  V1 trade-off given the approved-mediator pool has fiduciary duty
  to assess fraud properly in N2 before deferring to community vote.
- Block 8 integration scenario 10 validates the fix end-to-end as
  the permanent regression guard for this class of bug.

---

## ADR-030 · 2026-04-23 — EtaloDispute is sole authority for dispute reputation events

**Status**: Accepted

**Context**: During Block 8 integration testing, a double-counting
bug was detected in `reputation.recordDispute`. Both
`EtaloDispute._applyResolution` and `EtaloEscrow.resolveItemDispute`
were calling `recordDispute` on every dispute resolution, causing
`disputesLost` to increment by 2 instead of 1. Unit tests missed this
because each contract uses mocks for the other
(`MockEtaloEscrow` in Dispute tests, `fakeDispute` EOA in Escrow
tests). Only the Block 8 end-to-end flow wires both real contracts
together and exposes the duplication.

**Decision**: `EtaloDispute` is the sole authority for dispute-related
reputation events. `EtaloEscrow.resolveItemDispute` no longer calls
`reputation.recordDispute` or `reputation.checkAndUpdateTopSeller`.
Other Escrow terminal paths (`confirmItemDelivery`,
`triggerAutoReleaseForItem`) continue to call
`reputation.recordCompletedOrder` as they represent normal
completions, not disputes.

**Rationale**:
- Separation of concerns: Dispute owns dispute lifecycle, Escrow
  owns settlement mechanics. Each reputation event belongs with the
  contract that semantically owns the transition it represents.
- Disputes resolved with `refundAmount == 0` (seller wins) still
  need `recordDispute(sellerLost=false)` so the seller's history of
  disputes-faced is complete. Removing the call from Dispute (the
  alternative) would drop that record. Removing from Escrow keeps
  both resolution paths instrumented via the authoritative source.
- Future-proofing: if `resolveItemDispute` is ever reused from other
  Escrow-internal paths (e.g. a V2.5 automated dispute resolver),
  the caller would decide whether a reputation event fires, not the
  settlement layer.

**Impact**:
- Four lines removed from `EtaloEscrow.resolveItemDispute`, replaced
  by a comment pointing at ADR-030.
- `EtaloEscrow.resolveItemDispute` NatSpec now documents the
  no-reputation contract.
- Block 8 integration scenario 4 (seller fraud → stake slashed)
  becomes the permanent regression guard: it asserts
  `rep.disputesLost == 1` after a single dispute resolution.

---

## ADR-031 · 2026-04-23 — triggerAutoRefundIfInactive blocked on open dispute

**Status**: Accepted

**Context**: During Block 9 Foundry invariant fuzzing, a cross-
contract deadlock surfaced. Sequence:

1. Cross-border order funded; seller does not ship.
2. Buyer opens a dispute on the still-Pending item
   (`item.status = Disputed` via
   `escrow.markItemDisputed`, `stake.pauseWithdrawal` increments
   `freezeCount` to 1).
3. 14 days elapse.
4. Third party calls `triggerAutoRefundIfInactive` — order flips to
   Refunded, every item (including the Disputed one) is force-set to
   Refunded, buyer receives the full totalAmount.
5. The dispute record in `EtaloDispute` stays at level N1, unresolved.
   `resolveN1Amicable` now reverts (item status is Refunded, not
   Disputed). Escalation paths all end with the same revert at the
   Escrow side. `stake.resumeWithdrawal` is never called, so the
   seller's `freezeCount` stays elevated forever — the seller can
   never withdraw their stake.

The deadlock is silent: buyer is made whole, but the seller is
permanently locked out of their collateral.

**Decision**: `triggerAutoRefundIfInactive` reverts if any item in
the order is currently in `Disputed` status. The caller (buyer or
third party) must either:

1. Resolve the dispute through the N1 amicable path — both parties
   call `resolveN1Amicable` with matching refund amounts; OR
2. Let the dispute auto-escalate to N2 (anyone after 48h) and then
   N3 (anyone after 7 days from N2 start). N3 voting resolves
   within 14 additional days via community consensus; the callback
   closes the dispute, unfreezes the stake, and refunds the buyer.

In the worst-case "seller absent + dispute open" scenario, the
N1 → N2 → N3 escalation chain resolves within roughly 23 days
(48h + 7d + 14d) — slower than the 14-day auto-refund but
cross-contract-consistent.

**Rationale**:
- Preserves the invariant "dispute lifecycle and stake freeze are
  always paired". Prevents orphan disputes that deadlock stake
  withdrawals.
- Auto-refund is designed for the simple case where nothing has
  happened (seller never responded, no dispute). If a dispute is
  open, the dispute system is the authoritative resolution path.
- The buyer retains a path to funds via N3 escalation without
  needing seller participation.

**Impact**:
- Four lines added to `triggerAutoRefundIfInactive` guarding against
  Disputed items.
- NatSpec on the function documents the refusal reason and points
  at this ADR.
- One new Hardhat unit test on `EtaloEscrow.test.ts` and one new
  end-to-end integration test on `Integration.v2.test.ts` act as
  permanent regression guards.
- Block 9 Foundry `invariant_NoUnexpectedReverts` passes after the
  fix — the fuzzer no longer finds the deadlock path.

---

## ADR-032 · 2026-04-24 — CEI enforced across all V2 fund-moving functions

**Status**: Accepted

**Context**: During Sprint J4 Block 10 static analysis, Slither 0.11.5
flagged five `reentrancy-no-eth` findings (Medium severity) across
`EtaloStake.{depositStake, topUpStake, upgradeTier}` and
`EtaloEscrow.{_releaseItemFully, resolveItemDispute}`. In each case
one or more state variables were written *after* an external call
(USDT transfer, reputation/stake hook) even though every public
entry point is guarded by OpenZeppelin's `ReentrancyGuard`.

The findings are not exploitable today:
- All public entries carry `nonReentrant`.
- Celo USDT (Circle-bridged) is a standard ERC-20 with no transfer
  hooks — unlike ERC-777.
- `EtaloReputation` and `EtaloStake` are internal contracts with no
  callbacks to `EtaloEscrow`.

But they violate the Checks-Effects-Interactions pattern recommended
by security standards (SWC-107, Consensys best practices, Trail of
Bits). An auditor reading the code would have to trust the
`nonReentrant` guard plus prove Reputation/Stake are non-callback —
higher cognitive load, worse audit readability, worse future-proofing
against USDT upgrades or wiring changes (e.g. pointing `reputation`
at an external oracle that does call back).

**Decision**: Refactor every fund-moving function in the V2 contract
suite to follow strict CEI ordering:

1. **Checks** — all `require` and `_checkEligibility` first.
2. **Effects** — every state write (including the order-status
   transitions driven by `_checkOrderCompletion`) before any
   external call.
3. **Interactions** — USDT transfers, Reputation hooks, Stake hooks
   grouped at the end.

`ReentrancyGuard` stays on every public entry as defense-in-depth.
Event emissions sit in the Effects phase — they are read-only against
state and don't forward execution.

To support CEI in `_releaseItemFully` and `resolveItemDispute`,
`_checkOrderCompletion` is split into a pure `_computeNewOrderStatus`
view and a mutating "apply new status" path; the external
`stake.decrementActiveSales` call is relocated from inside the
helper to the Interactions section of each caller.

**Rationale**:
- Aligns the code with the single-most-important Solidity security
  pattern. Zero-cost improvement.
- Kills the five Medium Slither findings, bringing the Block 10
  target (zero High/Medium) into reach.
- Future-proof against hook-introducing ERC-20 upgrades or against
  an external Reputation/Stake implementation that does callback.
- Easier for the Sprint J4 Phase 2/3 auditor (ADR-025) to reason
  about.

**Impact**:
- `EtaloStake`: depositStake, topUpStake, upgradeTier reordered
  (state writes + events before transferFrom). ~9 lines diff.
- `EtaloEscrow`: `_releaseItemFully` and `resolveItemDispute`
  restructured. `_checkOrderCompletion` split into a view helper
  `_computeNewOrderStatus` and a state-only apply path. The stake
  `decrementActiveSales` call moves out of `_checkOrderCompletion`
  into each caller's Interactions section. ~60 lines diff.
- Full Hardhat suite (144) and Foundry invariants (7) re-run green
  after the refactor.
- Bytecode delta: neutral (~+100 bytes from the helper split).
- No behavioral change visible to end users.

---

## ADR-033 · 2026-04-24 — Post-slash stake recovery gap (topUpStake requires tier != None)

**Status**: Shipped (J8 Block 1, 2026-04-27)

**Context**: Block 12 testnet smoke-test scenario 4 slashed 5 USDT
from a Tier.Starter seller holding 10 USDT of stake. Auto-downgrade
fired as specified by ADR-028 (`tier: Starter → None`, `stake: 5
USDT` residual). ADR-028 point 2 states that `topUpStake` is the
user-facing recovery path after any slash — the seller adds USDT to
bring stake back above the tier threshold, then uses `upgradeTier`
to re-activate. On testnet, this path reverted with `"Not staked"`.

Root cause: `EtaloStake.topUpStake:276` requires
`_tiers[msg.sender] != EtaloTypes.StakeTier.None`. Post-slash
auto-downgrade creates exactly the state this check rejects —
`stake > 0` with `tier == None`. The constraint contradicts ADR-028's
intent.

Two fallback paths exist, both undesirable:

1. **14-day drain via `initiateWithdrawal(None)`** (ADR-028-compliant,
   clean). Works from tier None when `stake > 0`. Seller waits 14
   days, executes withdrawal to recover residual, then
   `depositStake(newTier)` fresh. Slow but complete — no funds lost.

2. **Immediate fresh `depositStake(Starter)`** — passes eligibility
   but overwrites `_stakes[seller] = 10 USDT` (tier amount), discarding
   the 5 USDT residual as contract dust. The ledger diverges
   permanently from physical USDT balance; the orphan is
   unreachable by the seller. Funds are not lost (they remain in
   the stake contract) but are unattributed.

**Decision**: Ship V1 with the gap documented here and in SECURITY.md.
Plan the constraint relaxation for V1.5.

**Rationale**: V1 audit (ADR-025 Phase 3) is imminent and the
Block 12 testing window is closing. Patching `topUpStake` now
requires a new test suite + redeployment + re-verification of all
five V2 contracts, which is high-risk against a hardened artifact.
The 14-day drain path exists and preserves full fund recoverability,
so ADR-022's non-custodial claim holds — the cost is UX delay, not
fund loss. V1.5 is the right scope for the fix.

**V1.5 fix path**: Relax `topUpStake` precondition from
`_tiers[msg.sender] != None` to `_stakes[msg.sender] > 0`. After
top-up, the seller still calls `upgradeTier(Starter)` explicitly to
re-activate the tier — this preserves explicit opt-in and keeps
`topUpStake` side-effect-free on tier state. `upgradeTier` already
handles the "already over-collateralized" case with `delta = 0` per
ADR-028 point 4, so no additional changes are needed there. A
regression script is pre-written at
`packages/contracts/scripts/smoke/recovery-stake.ts` (header warns
"do not run on V1"), ready to re-execute on the patched V1.5
contract as the smoke-test acceptance check.

**Impact**: Sellers slashed on V1 face a 14-day recovery delay (or
accept the orphan-loss path). The Block 12 scenario 5 was re-routed
to use `AISSA` as seller instead of recovering `CHIOMA`. The CHIOMA
test wallet remains on Celo Sepolia with `(stake=5 USDT, tier=None)`
as a preserved regression fixture. No ABI or event changes; V1.5 is
a pure constraint relaxation. No production migration required —
existing slashed sellers benefit automatically once V1.5 deploys.

**Implementation (J8 Block 1, 2026-04-27)**: Two `require` statements
relaxed in `EtaloStake.sol` (`topUpStake:276` + `upgradeTier:180`),
both flipped from `_tiers[msg.sender] != None` to
`_stakes[msg.sender] > 0`. The two-line change is required to
deliver the full recovery path described above — `topUpStake` alone
would let the seller fund the orphan but `upgradeTier` would still
reject `currentTier == None` and leave the seller unable to vend.
Five regression specs added to `test/EtaloStake.test.ts` under a new
`"ADR-033 V1.5 — orphan recovery"` describe block: happy path,
TIER_3_STAKE cap, withdrawal-active block, hard floor at stake=0,
and full re-activation flow (slash → topUp → upgradeTier(Starter)
with delta=0). Sepolia is deliberately not redeployed (J8 Q3
decision); the diff is documented in the audit briefing (Block 4)
so the firm sees exactly what diverges between the deployed
instance (`0xBB21...c417`) and the audited source.

---

## ADR-034 · 2026-04-25 — EIP-191 backend auth deprecated by MiniPay best practices

**Status**: Accepted (deprecation), Replacement plan staged

**Context**: J6 Block 1 (25/04/2026) introduced an EIP-191 signed-message
authentication pattern for backend mutations: `packages/miniapp/src/lib/eip191.ts`
helper, `packages/backend/app/auth.py` verifier, and 3 POST endpoints
(`/disputes/submit-message`, etc.) requiring a signed payload.

A subsequent compliance audit against the official MiniPay docs
(https://docs.minipay.xyz, Best Practices section) surfaced an explicit
prohibition:

> "Do not prompt users to sign a message to access your site or to
> authenticate. MiniPay connects automatically; users should not need to
> sign an arbitrary message to use your Mini App."

Our pattern triggers a "sign this message" prompt every time a buyer
submits a dispute message or a seller updates off-chain metadata. This is
exactly the friction MiniPay forbids and is among the listed common
rejection reasons during submission review.

**Decision**: Deprecate EIP-191 auth as the long-term mechanism for
backend mutations. The existing helper and verifier remain in place for
J6 to avoid blocking Block 2-7 progress, but **no new auth points may be
added** and the existing ones are flagged for migration before Proof of
Ship submission (June 2026).

**Replacement plan**:

1. **Primary path (preferred)**: move all mutating off-chain payloads
   on-chain as contract events that the J5 indexer picks up. Example:
   dispute messages are pinned to IPFS, hash emitted as
   `MessagePosted(itemId, ipfsHash, sender)` event by `EtaloDispute`. The
   indexer captures the event, fetches IPFS content, persists the row.
   Pattern matches the indexer-as-sole-authority discipline of ADR-030.

2. **Fallback (only if (1) impractical)**: session cookie issued by the
   backend after a non-prompting wallet ownership check (e.g. backend
   challenges the address with a contract read the wallet must have
   signed in a prior tx, no new signature requested). To be designed in
   a follow-up ADR if needed.

3. **Migration order**: J7 disputes refactor takes priority (dispute
   messages are the highest-friction case); other mutations follow as
   each block touches them. `lib/eip191.ts` and `app/auth.py` are
   deleted at the end of the migration.

**Risk**:
- Submission rejection if EIP-191 is still in production-facing flows
  at submit time.
- Disputes UX delay if (1) requires new contract event work post-J4
  freeze. Mitigation: dispute message events can be added in a
  V2.1 contract patch without breaking interfaces (ABI append only).

**Guard before mainnet**: pre-submission checklist (Block 11 J11) must
verify zero `eip191.ts` or `app/auth.py` references in the critical
buyer/seller flows. Backend tests must be updated to use cookie/onchain
auth before deletion.

**Impact**:
- J6 Block 1 commit `57ec857` keeps its EIP-191 work — no rollback.
- J6 Block 2 unaffected (`/products/public/{handle}` is unauthenticated
  by design).
- J6 Blocks 5-7 (checkout, order tracking, seller mode) must not add
  new EIP-191 points; if mutations are needed they go on-chain.
- J7 sprint scope expands to include dispute event refactor.
- CLAUDE.md gains rule 14 enforcing this constraint.

---

## ADR-035 · 2026-04-25 — Etalo deployment architecture: single Next.js app at etalo.app

**Status**: Accepted (architectural pivot, supersedes implicit two-package assumption)

**Context**: Implicit prior architecture had `packages/web` (Next.js, public funnel) and
`packages/miniapp` (Vite, MiniPay-injected app) as two separate codebases destined for two
different URLs. A clarification of vision (25/04/2026) confirmed that Etalo is fundamentally
**a Mini App in MiniPay**, not an independent web platform with a satellite Mini App. The
public web pages are funnels for social media inbound traffic from sellers' marketing images
(asset generator), intentionally limited (single-seller scope) to convert visitors into
MiniPay users.

The Mini App entry point registered with MiniPay's Discover must be a single URL. Two
codebases would require separate deployments, duplicated logic, split SEO/Mini App surfaces,
and a confusing submission story.

**Decision**: Consolidate the entire Etalo frontend into `packages/web` (Next.js 14).
`packages/miniapp` is archived. The single Next.js app serves both surfaces:

1. **Public funnel surface** (no MiniPay required): `/`, `/[handle]`, `/[handle]/[slug]`,
   `/sitemap.xml`, `/robots.txt`, OG images. SEO-optimized for social media inbound. Single-
   seller scope. CTA "Download MiniPay for full marketplace."

2. **Mini App surface** (MiniPay required, detected via `window.ethereum?.isMiniPay`):
   `/marketplace` (multi-seller browser), `/checkout`, `/seller/dashboard`, `/orders/:id`,
   etc. Uses injected wallet for transactions.

Routing convention: each route either supports both surfaces with progressive enhancement
based on MiniPay detection, or is gated to one with redirect/CTA fallback for the other.

**MiniPay submission URL**: `https://etalo.app`.

**Migration scope** (executed Block 5 commit B):
- Move `packages/miniapp/src/{lib,abis,hooks}/*` → `packages/web/src/`
- Move `packages/miniapp/src/components/RequireWallet.tsx` → `packages/web/src/components/`
- Copy `packages/miniapp/src/components/ui/{dialog,tabs}.tsx` → `packages/web/src/components/ui/`
  (web Block 4 already has button/sheet/badge/separator/sonner)
- Convert Vite env vars (`import.meta.env.VITE_*`) to Next.js (`process.env.NEXT_PUBLIC_*`)
- Add `WagmiProvider` + `QueryClientProvider` in web root layout via client `<Providers>` wrapper
- Install wagmi, viem, @tanstack/react-query in `packages/web`
- Archive `packages/miniapp` to branch `archive/miniapp-vite-v1` then delete from working tree
- Pages from `packages/miniapp/src/pages/*` (Landing, SellerHome, Onboarding, Checkout, Order)
  are NOT migrated — they're partial V1 implementations. Block 6+ rebuilds them as Next.js
  routes using migrated foundations + Block 2/3 SSR patterns + Block 4 cart store.

**Rationale**:
- Single deployment URL = clean MiniPay Discover registration
- Detection via `isMiniPay` provides progressive enhancement, no hard URL split
- Code reuse: cart store (Block 4) serves both single-seller funnel and multi-seller
  marketplace without duplication
- Standard pattern in MiniPay ecosystem (Mento, Kotani, Halofi all use single Next.js)
- Easier maintenance, single test/build/deploy pipeline

**Risks**:
- Bundle size: Mini App code (wagmi, viem, ABIs) may load on public funnel pages if not
  code-split. Mitigation: Next.js route-based code splitting handles most cases; explicitly
  dynamic-import wallet code where the funnel doesn't need it.
- SSR + wallet: pages requiring MiniPay must be marked client-only (no SSR for `/marketplace`,
  `/checkout`, `/seller/dashboard`).
- Migration risk: file moves break imports. Mitigation: incremental migration with
  build/test after each batch.

**Impact**:
- J6 Block 5 absorbs the migration (~1-2h) before checkout work resumes.
- J6 Block 6 (was 5): backend cart token + checkout `/checkout` route in Next.js.
- J6 Block 7 (was 6→7 partial): `/marketplace` + dual-mode home picker.
- J6 Block 8 (was 7 partial): `/seller/dashboard`.
- Block 4 cart drawer (commit `33c27e3`) is **not** dead code — it serves both surfaces
  (single-seller on funnel, multi-seller in Mini App). Validation retroactive of Option 2.
- `packages/miniapp` Block 1 work (commit `57ec857` + 4 pré-Block 2 commits) is preserved
  through git history (`git mv` preserves history); files are in `packages/web` after move.
- CLAUDE.md tech stack section consolidates "Mini App frontend" + "Public product pages"
  into a single Next.js entry.

---

## ADR-036 · 2026-04-25 — X-Wallet-Address auth extended to seller CRUD (extends ADR-011)

**Status**: Accepted (extends ADR-011, conforms with ADR-034)

**Context**: ADR-011 (April 2026) introduced `X-Wallet-Address` header as a
temporary auth mechanism for `/sellers/me`. ADR-034 (J6 Block 1) deprecated
EIP-191 signed-message auth and forbade new EIP-191 auth points. J6 Block 8
needs authentication for self-service seller mutations: product CRUD, IPFS
image uploads, profile updates.

Inside the MiniPay WebView, the connected wallet is implicitly trusted (MiniPay
secures wallet ownership at the OS level). The frontend reads the connected
address via wagmi `useAccount()` and includes it in `X-Wallet-Address`. Outside
MiniPay, mutations are blocked at the route gating level (redirect `/` if
`!isMiniPay`).

**Decision**: Extend the `X-Wallet-Address` header auth pattern (ADR-011) to
all V1 seller-side mutations:

- `POST /api/v1/products` (create)
- `PUT /api/v1/products/{id}` (update)
- `DELETE /api/v1/products/{id}` (delete)
- `POST /api/v1/uploads/ipfs` (existing, tightened to require seller profile)
- `GET /api/v1/sellers/me` (existing, ADR-011)
- `PUT /api/v1/sellers/me/profile` (new, profile updates)

Backend implementation:
- A `require_seller_auth` FastAPI dependency reads `X-Wallet-Address`,
  validates it corresponds to a registered `SellerProfile`, returns the
  loaded `SellerProfile` (with `.user` selectinloaded).
- Reject without header → 401 (cohérent avec `get_current_wallet` existant).
- Reject if no SellerProfile for this wallet → 404.
- For mutations on owned resources (PUT/DELETE product): re-verify
  `product.seller_id == seller.id`. Cross-ownership → 403.

Public reads (no auth required):
- `GET /api/v1/sellers/{address}/orders` (paginated, status filter)
- `GET /api/v1/sellers/{address}/profile` (existing, stake + reputation +
  recent orders count from indexer cache; covers the V1 stake read need
  without a separate `/stake` endpoint)

These are public read endpoints — anyone can query, but the address-based
filtering scopes the data. Privacy acceptable in V1 (no sensitive PII; orders
are coupled to wallet addresses already public on-chain via indexer).

**Rationale**:
- Conforms with ADR-034 (no new EIP-191 signed messages, no MiniPay submission
  rejection risk).
- Builds on ADR-011 (no new auth concept introduced; just extension of
  existing temp pattern).
- Trust model relies on MiniPay WebView security — same as the wallet auth
  itself.
- Significantly less complex than full SIWE / session-cookie infrastructure
  (estimated 2-3 days of additional work avoided).
- Enables V1 launch with full self-service seller CRUD instead of curated-only.

**Risks**:
- **Header spoofing outside MiniPay context** — mitigated by route-gating
  (redirect `/` if `!isMiniPay` for all seller dashboard surfaces).
- **CSRF** — backend must enforce CORS strictly (only `etalo.app` origin
  allowed for mutations). Configure FastAPI CORSMiddleware.
- **No replay protection** — V1 acceptable. V1.5+ may add short-lived nonce
  or signed token ladders.
- **`require_seller_auth` requires SellerProfile to exist** — first-time seller
  registration uses the existing onboarding flow that creates the profile via
  the same X-Wallet-Address pattern but does not require pre-existing profile.

**Replacement plan (V1.5+)**:
- Migrate to session cookie issued via non-prompting on-chain ownership check
  (e.g. backend reads stake, reputation, or contract state to confirm
  ownership without prompting a signature).
- Or migrate seller CRUD on-chain (product creation as contract event from
  seller's wallet, indexer ingests). Aligns with ADR-034 endgame.
- ADR to be filed when V1.5 architecture is finalized.

**Impact**:
- Backend gets `app/dependencies/seller_auth.py` with the
  `require_seller_auth` dependency composed on top of the existing
  `get_current_wallet` (sellers.py).
- Existing `/uploads/ipfs` endpoint tightened from "any wallet" to
  "registered seller" via the new dependency.
- Frontend (Block 8.2-8.4) sends `X-Wallet-Address` from wagmi `useAccount()`
  on all seller mutations + reads of /sellers/me/*.
- ADR-011's "temporary" status remains — full migration plan deferred V1.5+.

---

## ADR-037 · 2026-04-26 — Sprint J7 architectural choices: Playwright + hybrid credits + 5 templates + EN/SW

**Status**: Accepted

**Context**: Sprint J7 delivers V1 Boutique pillar 3 (asset generator).
Four architectural choices needed up-front: image generation tech,
credit system architecture, template formats, caption languages. Each
impacts effort, infrastructure cost, maintenance, and scope.

**Decision (4 sub-decisions)**:

1. **Image generation tech**: Playwright headless Chromium (Python).
   Templates as HTML/CSS files served from backend, rendered via
   `playwright.chromium.launch()` and screenshot to PNG.

2. **Credits architecture**: Hybrid.
   - On-chain : `EtaloCredits.purchaseCredits(amount)` pulls USDT and
     mints credits balance. Tx visible audit trail.
   - Off-chain : consumption tracked in backend `seller_credits_consumption`
     ledger. No tx required per image generation.
   - Welcome bonus (10 credits) + 5 free/month managed off-chain ledger
     (no on-chain mint).

3. **Templates V1** (5 formats): Instagram Square 1080×1080, Instagram
   Story 1080×1920, WhatsApp Status 1080×1920 (different visual style),
   TikTok Cover 1080×1920, Facebook Feed 1200×630.

4. **Caption languages V1**: English + Swahili. French + Pidgin deferred
   V1.5+ (Cameroon/CIV/Senegal markets second wave).

**Rationale**:

1. Playwright vs `@vercel/og`: chosen for pixel-perfect rendering, no CSS
   subset limitations on template designs. Trade-off accepted: heavier
   infra (~150MB binary, ~500MB RAM/instance) but production backend host
   (TBD pre-J11 launch) will support it. `@vercel/og` reserved as
   fallback for Open Graph dynamic images already in use (Block 3 J6).

2. Hybrid credits vs full on-chain: on-chain consumption would require
   a tx per image generation, creating UX friction (wallet popup every
   time). Off-chain consumption ledger cleaner UX. On-chain purchase
   preserves non-custodial transparency claim (ADR-022) for the value
   transfer (USDT → Etalo treasury). Pattern Mento, Kotani.

3. 5 templates : 1 covered ~50% marketing channels, 3 ~95%, 5 ~99%. 5
   chosen for full V1 launch parity with how sellers actually market
   (Instagram feed + Stories + WhatsApp Status + TikTok + Facebook). 7+
   templates marginal value vs maintenance.

4. EN + Swahili : covers anglo Nigeria/Ghana + East Africa
   Kenya/Tanzania/Uganda (large user-base markets). FR + Pidgin V1.5+
   for Francophone West/Central Africa secondary wave. Multi-language
   tone QA effort scales linearly per language; 2 languages manageable
   without native speaker review, 4+ requires dedicated QA pass.

**Risk**:

- **Playwright deployment**: requires backend host with Linux Chromium
  support. Vercel Edge runtime NOT compatible. Mitigation: backend
  hosting decided before J11 launch (Render, Railway, Fly.io all
  compatible). Local dev OK from Block 1.
- **Hybrid credits trust model**: backend tracks consumption, must be
  accurate. Mitigation: indexer mirrors `CreditsPurchased` events
  on-chain (audit trail for purchase), consumption ledger in DB with
  timestamps + image_id linkage (audit trail for spend).
- **Swahili tone**: less common in our team. Mitigation: prompt
  engineering V1, iterate with seller feedback post-launch. Worst case
  caption "too formal" — acceptable, not catastrophic.

**Replacement plan (V1.5+)**:

- Add FR + Pidgin caption languages
- Add LinkedIn / Twitter templates if seller demand emerges
- Consider migration Playwright → satori for lighter infra if scale forces

**Impact**:

- J7 sprint: 8 blocks, ~3-4 weeks. Subsumes the originally-planned J8
  dedicated credits sprint.
- New smart contract EtaloCredits.sol deployed on Celo Sepolia (5e
  contract V2 alongside Escrow, Dispute, Stake, Voting, Reputation).
- Backend new dependency: Playwright Python + Chromium binary.
- Frontend new "Marketing" tab in seller dashboard (replaces stub from
  J6 Étape 8.2).
- Pricing model anchor (ADR-014): 0.15 USDT/credit, 5 free/month, 10
  welcome bonus, no subscription. See `docs/PRICING_MODEL_CREDITS.md`.

---

## ADR-038 · 2026-04-27 — Multisig strategy V1 / mainnet (Sepolia single-key rehearsal, 2-of-3 Safe deferred mainnet)

**Status**: Accepted (supersedes ADR-022 multisig sub-decision for the
V1 Sepolia phase only; ADR-022's non-custodial criteria stand
unchanged).

**Context**: Sprint J8 Block 3 originally scoped a Safe Sepolia
deployment with ownership transfer of the 6 V2 contracts as a dress
rehearsal for mainnet governance. Two operational realities reshape
that scope:

1. Mike (solo dev) does not yet own a hardware wallet — acquisition
   was planned for Q3 2026 alongside the audit kickoff but is
   currently deferred. A single-signer Safe with two software keys
   adds operational ceremony without raising the security floor over
   the current deployer EOA.
2. Sepolia is testnet — no real-USDT exposure. Rehearsing multisig
   ops with throwaway keys teaches workflow but does not exercise the
   actual signer set that will hold mainnet ownership.

The bounded perimeter of V1 Sepolia (no real funds, ADR-026 caps
already in place, every admin function emits an event) makes a
deferral cheap; the constraint was originally driven by audit-firm
optics, not by a security gap.

**Decision**:

- **V1 Sepolia (now → mainnet cutover)**: ownership of the six V2
  contracts (`EtaloReputation`, `EtaloStake`, `EtaloVoting`,
  `EtaloDispute`, `EtaloEscrow`, `EtaloCredits`) and the three
  treasuries (`commissionTreasury`, `creditsTreasury`,
  `communityFund`) stays on the deployer single-key EOA
  `0x66bD37325cf41dAd0035398854f209785C9bC4C2`. No Safe deployed on
  Sepolia.
- **V1 mainnet (pre-J12, before first real-USDT transaction)**: a
  2-of-3 Safe is deployed on Celo mainnet and ownership is
  transferred for all 6 contracts + 3 treasuries. Signer set:
  - Mike hot wallet (software, daily ops)
  - Mike hardware wallet (cold key, to be acquired Q3 2026)
  - 3rd-party signer (TBD — candidate pool: trusted technical
    advisor, audit-firm-recommended custodian, or Celo Foundation
    grant program signer if grant accepted per ADR-025 Phase 2).

**Rationale**:

- Hardware wallet is the load-bearing security artifact. A 2-of-3
  Safe with two software keys held by the same person is theatre,
  not defense; an attacker that compromises the dev machine
  compromises both keys.
- Deferring the Safe until the hardware wallet is in hand keeps the
  signer-set transition single-step (rotate ownership once, not
  twice). Two ownership rotations on mainnet would each require
  re-verifying the 9 ownership transfers and re-publishing the
  multisig address.
- Sepolia rehearsal value is low: the production signer set will
  differ from any rehearsal set, and the Safe UI / signing flow is
  well-documented and stable. The genuine integration risk is
  hardware-wallet-to-Safe specifically, which cannot be rehearsed
  without the hardware.
- The audit firm receives the same threat-model coverage either way:
  the perimeter, ADR-023 / ADR-026 / ADR-031 invariants, and the
  3-condition `forceRefund` gate are all in place on the existing
  EOA. The only delta is "single-key vs multisig" on the admin
  surface, which the audit firm explicitly reviews against the
  declared signer set at the time of mainnet handover.

**Risk**:

- **Single-key compromise on Sepolia**: bounded — testnet only, no
  real funds. Worst case: redeploy Sepolia. Mitigation: deployer
  private key in a `.env.deployer` file (gitignored), rotated before
  mainnet cutover.
- **Audit-firm pushback on single-key Sepolia**: addressed by
  documenting the multisig roadmap explicitly in this ADR and in the
  J8 Block 4 audit briefing. The signer-set candidate slate is
  shared with the firm at engagement kickoff so they can review the
  proposed mainnet governance during the audit window.
- **Mainnet cutover delay**: the Safe deployment + 9 ownership
  transfers must be on the J11/J12 critical path. If the hardware
  wallet acquisition slips past J11, the audit handover can still
  proceed (audit happens against Sepolia code) but mainnet launch
  is blocked until the multisig is operational — by design.

**Replacement plan (J11–J12, before mainnet first tx)**:

1. Acquire hardware wallet (Ledger Nano S Plus or equivalent),
   initialize, back up seed phrase to two physical locations.
2. Identify 3rd-party signer; confirm availability, exchange
   addresses, document contact protocol in `docs/MULTISIG_OPS.md`.
3. Deploy 2-of-3 Safe on Celo mainnet via the Safe app
   (`safe.global` Celo deployment).
4. Transfer ownership of `EtaloReputation`, `EtaloStake`,
   `EtaloVoting`, `EtaloDispute`, `EtaloEscrow`, `EtaloCredits`
   (6 calls).
5. Transfer ownership / signer of the three treasury wallets
   (3 operations).
6. Verify on-chain: every `Ownable.owner()` call returns the Safe
   address; every treasury balance is non-zero only after the Safe
   is operational.
7. Document the rotation in `docs/SECURITY.md` "Deployed addresses"
   section under a new "Mainnet" subsection.

**Acceptance criteria (mainnet gate, blocks first real-USDT tx)**:

- 2-of-3 Safe deployed on Celo mainnet with documented address.
- Ownership transferred for all 6 V2 contracts (verified via
  CeloScan `owner()` reads).
- All 3 treasury wallets either rotated to the Safe or under
  documented multi-key control.
- `docs/MULTISIG_OPS.md` shipped (operational runbook: signing
  procedure, recovery procedure, rotation policy).
- Audit firm sign-off on the final signer set.

**Impact**:

- Sprint J8 Block 3 scope reduced from "deploy Safe Sepolia + 9
  ownership transfers + ops doc" (2-3 days) to "ADR-038 + threat
  model amendment" (~0.5 day).
- `docs/THREAT_MODEL.md` §4.1, §4.5, §5, §7 amended in the same
  commit to remove the "transferred to 2-of-3 Safe Sepolia in J8
  Block 3" claim and replace with "deployer single-key V1 rehearsal
  scope, multisig 2-of-3 deferred mainnet per ADR-038".
- `docs/SPRINT_J8.md` Block 3 row updated to reflect the revised
  scope; the original `docs/MULTISIG_OPS.md` deliverable is moved to
  the J11/J12 mainnet preparation sprint.
- ADR-022 V1 multisig sub-decision is superseded for the Sepolia
  phase only; the non-custodial criteria of ADR-022 (publicly
  verifiable code, structurally bounded admin powers, code-enforced
  dispute resolution) remain unchanged on the existing single-key
  deployment.
