# Etalo Web — MiniPay-first Next.js App

Single Next.js 14 App Router app powering the three Etalo pillars (per ADR-035) :

- **Public marketplace + per-seller boutique** at `etalo.app` and `etalo.app/[handle]` (SSR, SEO-ready, social-share OpenGraph cards)
- **MiniPay seller dashboard** at `etalo.app/seller/dashboard` (client-side, wagmi + viem against Celo)
- **Buyer checkout flow** with USDT escrow at `etalo.app/checkout`

Predecessor `packages/miniapp/` (Vite) is deprecated by ADR-035 — this is the unified web surface for both public visitors and MiniPay WebView users (detection via `window.ethereum?.isMiniPay`).

## Dev workflow

Use the canonical one-command launcher (3 Windows Terminal tabs : Backend + Frontend + ngrok) :

```powershell
C:\Users\Oxfam\projects\etalo\Etalo\packages\web\scripts\etalo-dev-all.ps1
```

See [`scripts/README.md`](./scripts/README.md) for the full launcher matrix (alternatives, aliases, ngrok URL capture helpers).

Or run scripts directly :

```bash
pnpm install
pnpm dev      # Next.js dev server on :3000
pnpm test     # Vitest 295 PASS
pnpm lint     # next lint (ESLint)
pnpm build    # production bundle
```

## Tests

295 specs across 38 test files (Vitest + jsdom + @testing-library/react). Run all : `pnpm test`. Watch mode : `pnpm test:watch`.

CI runs typecheck + lint + tests on every push to `main` / `feat/**` and every PR — see [`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Architecture

- `src/app/` — App Router pages (server + client components)
- `src/components/` — Shared React components
- `src/components/ui/v4/` + `src/components/ui/v5/` — Design System (V4 = Phase 2-3, V5 = Phase 3-5 Robinhood-target)
- `src/hooks/` — TanStack Query data hooks (5 consumers : credits, marketplace, analytics, etc.)
- `src/lib/` — Utility libs (formatters in `lib/usdt.ts` + `lib/format.ts`, API wrappers in `lib/api.ts` + `lib/seller-api.ts`, IPFS gateway, MiniPay detection)

## Pointers

- Repo root [README](../../README.md) — project overview + tech stack + sprint status
- [`../../docs/SPRINT_J10_V5.md`](../../docs/SPRINT_J10_V5.md) — current sprint plan + Phase closures
- [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md) — ADR log (ADR-035 single-app architecture, ADR-040 V5 design pivot, ADR-041 V1 scope intra-only)
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI agent context + critical rules
