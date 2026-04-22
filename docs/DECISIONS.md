# Etalo — Architecture Decision Log

This file tracks significant technical decisions and deviations from
CLAUDE.md. Each entry is short and dated (YYYY-MM-DD). When CLAUDE.md
and this file disagree, this file wins until CLAUDE.md is updated.

---

## 2026-04-22 — React 19 accepted (overrides CLAUDE.md v1)

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

## 2026-04-22 — Checkout flow uses 3 txs; createAndFund wrapper deferred V1.5

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

## 2026-04-22 — CIP-64 (fee in USDT) deferred V1.5

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

## 2026-04-22 — On-chain event indexing deferred V1.5

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

## 2026-04-22 — Buyer country defaults to cross-border

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

## 2026-04-22 — Checkout uses 1 confirmation on Celo Sepolia

**Context**: `waitForTransactionReceipt` accepts a `confirmations`
param. Too low = optimistic UX at risk of reorg rollback; too high =
slow UX.

**Decision**: `confirmations: 1` on Celo Sepolia. Celo L2 has fast
finality for testnet purposes.

**Replacement plan (mainnet)**: Bump to 2–3 confirmations before mainnet
launch. Re-evaluate when observing real mainnet finality times.

---

## 2026-04-22 — MockUSDT allowance-to-allowance works; real USDT may not

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

## 2026-04-22 — WhatsApp order notifications are stored, not sent

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

## 2026-04-22 — MiniPay native deep-link deferred

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

## 2026-04-22 — Raw IPFS og:image for V1

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

## 2026-04-22 — X-Wallet-Address header temporary for /sellers/me

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

## 2026-04-22 — Wagmi v2 retained (not v3, despite CLAUDE.md)

**Context**: CLAUDE.md v1 specifies Wagmi v3. Wagmi v3 has shipped, but
documentation and community examples are still sparse.

**Decision**: Use Wagmi v2 (latest stable) for J1-J2 and the MVP.

**Rationale**:
- Solo developer sprint — minimize surprises.
- Wagmi v2 pairs cleanly with Viem v2 and has mature docs.
- Migration to v3 is planned for product V2, once ecosystem matures.

**Impact**: CLAUDE.md line 15 currently reads "Wagmi v3" — to be corrected
in the same commit as the React 19 update.
