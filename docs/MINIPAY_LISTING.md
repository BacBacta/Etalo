# MiniPay Mini App — listing submission package (J12)

**Goal:** everything needed to submit Etalo to the MiniPay Mini App
directory in one place — the form copy (ready to paste), the asset
specs, and the readiness checklist with the gaps that still block
submission.

**Submission form:** <https://developer.minipay.to/mini-app-listing>
**Official requirements:** <https://docs.minipay.xyz/getting-started/submit-your-miniapp.html>
**Category:** `shopping`
**Canonical app URL (V1):** `https://etalo.xyz` (Vercel alias since
2026-05-25 ; `etalo.app` is reserved/future, NOT wired — do not submit
`etalo.app` URLs).

---

## 1. Form fields — ready-to-paste copy

| Field | Value |
|-------|-------|
| **App name** | `Etalo` |
| **Tagline** (1–2 sentences) | `Your digital stall, open 24/7. Turn your Instagram, WhatsApp, or TikTok following into a real shop with secure stablecoin payments and built-in buyer protection.` |
| **Publisher** | `Etalo` |
| **Category** | `shopping` |
| **App URL (linkUrl)** | `https://etalo.xyz` |
| **Support URL** | `https://etalo.xyz/support` |
| **Terms of Service** | `https://etalo.xyz/legal/terms` |
| **Privacy Policy** | `https://etalo.xyz/legal/privacy` |
| **Icon** | 512×512 PNG — ✅ `packages/web/public/icon-512.png` (§3) |

### Longer description (if the form / directory asks for one)

> Etalo is a non-custodial marketplace for African sellers, built for
> MiniPay. Sellers open a 24/7 boutique at `etalo.xyz/[your-handle]`,
> list products in minutes, and get paid in digital dollars (USDT) the
> moment a buyer confirms delivery.
>
> Buyers are protected by design: payment is held in an audited smart
> contract on Celo — not by the seller and not by Etalo — and is only
> released when the item arrives. If a seller doesn't ship, the buyer
> reclaims their money automatically. Disputes are mediated and the
> outcome is enforced on-chain.
>
> Built for the realities of intra-Africa commerce: low network fees
> paid in stablecoin (no separate gas token to buy), mobile-first, and
> a single flat 1.8% seller commission. Markets at launch: Nigeria,
> Ghana, Kenya, and South Africa.

**Terminology guardrails** (CLAUDE.md rule #4 — keep these in all
store copy): say **"network fee"** not "gas"; **"stablecoin" / "digital
dollar"** not "crypto/token"; **"deposit/withdraw"** not
"on-ramp/off-ramp". Never show a raw `0x…` address in copy or
screenshots.

---

## 2. Technical requirements — Etalo conformance

| Requirement (MiniPay) | Status | Evidence / note |
|------------------------|--------|-----------------|
| Auto-connects to wallet (no connect button) | ✅ | CLAUDE.md rule #7 ; MiniPay detection in `lib/minipay-detect.ts`, button hidden under MiniPay |
| HTTPS, publicly accessible | ✅ | `https://etalo.xyz` (Vercel) |
| Mobile-optimized, min viewport 360×640 | ✅ | CLAUDE.md design standards ; V5 design system |
| Works on Celo Mainnet | ✅ | chainId 42220 live (post ADR-057 cutover) |
| Graceful wallet-operation error handling | ✅ | root `error.tsx` + ErrorBoundary ; checkout tx state machine (rule #8) |
| In-app Terms + Privacy links | ✅ | `/legal/terms`, `/legal/privacy` (linked in `Footer.tsx`) |
| In-app Support link | ✅ | `/support` (email + buyer/seller FAQ) |
| PageSpeed score for production URL | ⚠️ | have Lighthouse (perf avg ~64, 6/7 routes "Good" LCP) — **re-run on `https://etalo.xyz` prod and capture the number** (see `docs/PRE_MAINNET_QA.md`) |
| Full URL/subdomain/origin manifest | ✅ | `docs/NETWORK_MANIFEST.md` — **needs an etalo.app→etalo.xyz pass before submission** |

### Dependency security (MiniPay supply-chain checks)

| Requirement | Status | Action |
|-------------|--------|--------|
| Pin exact npm versions (no `^`/`~` ranges) | ✅ | all 40 web deps pinned to their locked versions ; `save-exact=true` keeps new adds exact |
| Minimum 7-day published age for deps (`minimumReleaseAge`) | ⚠️ n/a on npm | `minimumReleaseAge` is a **pnpm-only** setting ; npm 11.9 has no native equivalent. Mitigated by exact pins + committed lockfile + `npm ci` + manual age review (documented in `packages/web/.npmrc`) |
| `ignore-scripts=true` in `.npmrc` | ✅ | `packages/web/.npmrc` created |
| Commit lockfile ; `npm ci` in CI | ✅ | `packages/web/package-lock.json` committed (web is npm) |

---

## 3. Assets to produce

### App icon — ✅ DONE

- **Spec:** 512×512 px, PNG, square, full-bleed (no transparent
  corners — MiniPay applies its own masking).
- **Source:** the existing V4 brand mark (`docs/DESIGN_V4_PREVIEW.md`,
  inlined as `EtaloLogo` in `PublicHeader.tsx`) — dark square + sun +
  arc + 2 forest dots. Authored as `public/icon-512.svg` and
  rasterized deterministically via the already-installed Playwright
  chromium (`scripts/rasterize-icon.py` — no sharp/imagemagick dep).
- **Produced:** `packages/web/public/icon-512.png` (submission form
  icon) + wired as the Next App-Router PWA / Apple touch icons
  (`src/app/icon.png` + `src/app/apple-icon.png`).
- **Re-export** (if the brand mark changes): edit `public/icon-512.svg`
  then `../backend/venv/Scripts/python.exe scripts/rasterize-icon.py`.
- *Mike: swap if you prefer the rounded-corner variant over full-bleed
  — change the `<rect>` to `rx="64"` in the SVG and re-run.*

### Screenshots (optional for the form, recommended for press)

The submission form requires the **icon only** — screenshots are not a
listed field. But capture 3 clean 360×640 (or taller) frames for the
press kit / future store surfaces:

1. Marketplace grid (`/marketplace`) — products, country chips.
2. A boutique page (`/[handle]`) — seller storefront.
3. Order detail with the escrow/buyer-protection state
   (`/orders/[id]`) — the differentiator.

> Capture on a 360×640 viewport. **No raw `0x…` addresses in frame**
> (rule #5) — use a seller handle and the anonymized buyer label.

---

## 4. Pre-submission checklist (close these, then submit)

- [x] **512×512 icon produced** (`public/icon-512.png`) + PWA/apple
      icons wired — §3.
- [x] **`packages/web/.npmrc`** with `ignore-scripts=true` configured
      (+ exact pins ; `minimumReleaseAge` is pnpm-only — see §2) — #148.
- [x] **`package.json` dependency ranges audited** → all 40 web deps
      pinned to exact versions — #148.
- [ ] **PageSpeed Insights run on `https://etalo.xyz`** (production)
      → record the score to paste into the form.
- [ ] **`NETWORK_MANIFEST.md` pass**: confirm canonical `etalo.xyz`
      origins, mark `*.etalo.app` as unused/future, list the real RPC
      + Pinata/IPFS + Fly API origins the app calls.
- [ ] **Support email reachable**: `support@etalo.app` is referenced
      in `/support`, but `etalo.app` is the future domain — confirm
      mail is actually delivered (set up MX, or switch the address to
      an `@etalo.xyz` / personal inbox that you monitor).
- [ ] Terms + Privacy pages reviewed for accuracy against V1 reality
      (non-custodial, intra-Africa, 1.8% commission, dispute flow).
- [ ] Final manual smoke on `https://etalo.xyz` inside real MiniPay
      (Phase C sign-off, `docs/PHASE_C_SMOKE_CHECKLIST.md`).

When every box is checked → fill the form at
<https://developer.minipay.to/mini-app-listing> with the §1 copy.

---

## 5. Post-listing obligation

MiniPay terms: **critical issues must be fixed within 24 hours** or the
listing can be disabled. The `/support` page commits to a 24h response
— keep that SLA real. The on-call recovery runbooks
(`scripts/rotate_db_password.md`, `docs/MULTISIG_OPS.md`) back this.

---

## 6. References

- Official: <https://docs.minipay.xyz/getting-started/submit-your-miniapp.html>
- Form: <https://developer.minipay.to/mini-app-listing>
- `docs/NETWORK_MANIFEST.md` — URL/origin manifest (submission §2)
- `docs/PRE_MAINNET_QA.md` — Lighthouse / PageSpeed evidence
- `docs/PHASE_C_SMOKE_CHECKLIST.md` — end-to-end functional sign-off
- `CLAUDE.md` — terminology rules (#4), privacy (#5), tx states (#8)
