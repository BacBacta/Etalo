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
