# Phase 4 — Lessons Learned (J10-V5)

Cumulative pattern catalogue from Sprint J10-V5 Phase 4 (Layout
refactor + V5 applications migration), 6 Blocks + 10 hotfixes
shipped between **2026-04-29** and **2026-05-02**. Each section
below reflects a pattern that broke or near-broke during execution,
the root cause, and the standing fix to apply going forward.

References point to the inner repo's canonical paths (per CLAUDE.md
primary working dir: `C:\Users\Oxfam\projects\etalo\Etalo`).

---

## Bundle discipline

- **`next/dynamic({ ssr: false })` for client-only conditionally-rendered components.**
  Modals, overlays, charts — anything that pulls in `motion/react`
  or `recharts` and is shown < 100 % of the time on a given route.
  Static imports drag the dep chain into the route's First Load JS;
  dynamic imports keep them in a lazy chunk fetched on demand.
- **Lesson hotfix #6** (`2e4d99f`) — `suppressHydrationWarning`
  silences React's textual-content mismatch warnings but does NOT
  cover **structural** divergence (server renders one component
  tree, client renders a different one). For full client-only
  components, use `dynamic({ ssr: false })` so the server never
  emits HTML to compare against.
- **Lesson sub-block 6.3** (`3872411`) — bundle bust caught in CI
  build output: static `import { MilestoneDialogV5 }` from
  OrdersTab pushed `/seller/dashboard` First Load **263 → 281 kB**
  (1 kB OVER the 280 kB strict trigger). Switching to
  `next/dynamic({ ssr: false, loading: () => null })` reclaimed
  **18 kB** and bonus-cleaned `/checkout` (which had been eagerly
  pulling motion via a shared chunk).
- **Lesson sub-block 5.5** (`c10eb38`) — Webpack chunk-dedup
  paradox: when `ChartLineV5` got its 2nd production consumer,
  recharts moved from being inlined into `/dev/components` into a
  shared lazy chunk, so `/seller/dashboard` route size went DOWN
  by 0.9 kB while First Load grew only +1 kB. Sharing reduces
  bundle pressure, not increases it.
- **Strict trigger:** `/seller/dashboard` First Load JS **must
  stay < 280 kB**. Current state post-Phase-4: **263 kB**, 17 kB
  headroom. Every new prod consumer of a heavy lib (motion,
  recharts, viem) needs a bundle measure as part of its commit.

## Mobile-first responsive

- **Min viewport 360 px non-negotiable** (CLAUDE.md design
  standards). Every new surface validated by class-cascade analysis
  at 360 / 414 / 768 / 1024 px breakpoints before commit; live
  MiniPay validation as part of closure procedure.
- **Tailwind grid-cols pattern**: `grid-cols-1 sm:grid-cols-2
  lg:grid-cols-4` (mobile-first, ascending). Never
  `grid-cols-4` standalone — it forces 4 columns at 360 px which
  collapses each card to ~78 px (below the 44 px touch minimum).
- **Lesson hotfix #8** (`e6ccad9`) — `flex flex-col items-center
  justify-center` + missing `w-full` on the inner container =
  circular constraint where the parent grows to fit content
  width, defeating any child's `overflow-x-auto`. Two-shell fix:
  - `StatusShell` for short status messages (loading, error
    copy) — keeps the centering.
  - Plain `<main>` + `<div className="mx-auto w-full max-w-3xl
    px-4 py-6">` for main render — explicit `w-full` anchors to
    viewport width, child `overflow-x-auto` scopes work properly.
- **Touch targets ≥ 44 × 44 px** (CLAUDE.md). KPI tiles in 2×2
  grid on 360 px viewport: (360 − 16×2 padding − 16 gap) ÷ 2 ≈
  152 px each — comfortably above the floor.
- **Hotfix #8 protection still holds** for every Block 5 + 6 add:
  KPI grid (5.4), ChartLineV5 (5.5), Top products (5.6), and
  MilestoneDialogV5 (6.3 — renders into Radix Portal, OUTSIDE
  the dashboard tree, so the parent's `w-full max-w-3xl px-4`
  constraint is unaffected).

## Locale + timezone safety

- **Pin locale `"en-US"` for ALL `Intl.NumberFormat` /
  `Intl.DateTimeFormat` calls.** `toLocaleString(undefined, ...)`
  inherits the system locale; on Mike's `fr_FR` box this produced
  `"70,50 USDT"` (comma decimal) and broke the populated/zero
  KPI tile tests on the first run.
- **Lesson sub-block 5.4** (`15aed82`) —
  `displayUsdtNumber(amount)` in `OverviewTab.tsx`:
  ```ts
  amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  ```
  Locale-pinning matches CLAUDE.md's English-in-UI mandate AND
  keeps Vitest snapshots locale-independent across CI runners.
- **Lesson sub-block 5.5** (`c10eb38`) — `formatChartDate` in
  `OverviewTab.tsx` adds `timeZone: "UTC"`:
  ```ts
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  ```
  Backend computes dates in UTC (`func.date(Order.created_at_chain)`
  on a tz-aware timestamp); a UTC-7 user opening the dashboard at
  23:30 local would otherwise see yesterday's bar labelled with
  today's date. Both regressions are pinned by tests
  ("date labels are timezone-stable (UTC) and locale-stable
  (en-US)").
- **Pattern** for any future date/amount formatter: always pass
  the explicit `"en-US"` locale + (for dates that originate UTC
  on the backend) the explicit `timeZone: "UTC"`. Add a regression
  test that asserts the formatted output for a fixed input.

## Testing patterns

- **`vi.mock` per-file for `next/image`** (jsdom emits warnings on
  the real loader). Same shape used by `ProductCard.test.tsx`,
  `HomeRouter.test.tsx`, `MarketingTab.test.tsx`, and Block 6's
  `OverviewTab.test.tsx` (5.6) + `OrdersTab.test.tsx` (6.3) — no
  shared global stub in `src/test/setup.ts`.
- **`vi.mock("@/components/ui/v5/ChartLineV5")`** to avoid
  recharts' ResizeObserver crash in jsdom. Mock at the wrapper
  boundary (the `next/dynamic` wrapper), let consumer tests
  assert on what the component would receive (`data-point-count`,
  per-point text content) rather than the rendered SVG.
- **`canvas-confetti`** is mocked globally in `src/test/setup.ts`
  (Phase 2 Block 7) so any test that triggers `fireMilestone`
  doesn't crash on jsdom's incomplete canvas. Block 6 inherits
  this for free.
- **Per-test fresh `QueryClient`** via local `makeWrapper()`
  helper (sub-block 5.3, replicated in 6.2):
  ```tsx
  function makeWrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0 } },
    });
    function Wrapper({ children }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return Wrapper;
  }
  ```
  `gcTime: 0` so unmounted queries are GC'd immediately; named
  inner `Wrapper` component to satisfy `react/display-name` lint.
- **`renderHook` + `waitFor`** for TanStack Query hooks — the
  initial render returns `isPending: true`; the query resolves
  in a useEffect tick. Pre-hydration paint is NOT observable
  in jsdom (RTL runs `useEffect` synchronously) so document
  SSR-safety claims via code review of the `useState(...)`
  initializer rather than runtime assertions.
- **Per-spec `Storage.prototype` stubs** for localStorage
  failure paths (sub-block 6.2):
  ```ts
  vi.spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
  ```
  Instance-level `vi.spyOn(window.localStorage, ...)` doesn't
  intercept reliably across jsdom builds; prototype-level does.
- **Mock `useMilestoneOnce` at the consumer level** rather than
  setting up the full hook + QueryClient + localStorage chain.
  Block 6.3's OrdersTab tests mock the hook directly with a
  `mockReturnValue({ shouldShow, markShown })` — the hook itself
  has its own 5 specs in `useMilestoneOnce.test.tsx`.

## Hydration safety

- **`dynamic({ ssr: false })`** for client-only components that
  cannot SSR cleanly (HomeMiniPay V5, MilestoneDialogV5). Server
  emits no HTML for these → no hydration-mismatch warning, no
  flash. Trade-off: a brief loading window before the chunk
  resolves, mitigated by an inline `loading: () => ...` prop
  (e.g. `<HomeLanding />` for HomeRouter, `null` for the dialog
  Portal).
- **`useState(false)` initial + `useEffect` post-mount hydration**
  for any `localStorage`-driven flag (Block 4b's `etalo-onboarded`,
  sub-block 6.2's `etalo-milestone-shown-${type}`). Initial paint
  is consistent across server + first client render → no
  hydration mismatch on the consumer's first render. Post-mount
  effect reads `localStorage` and flips the state on the next
  render. Setter callback writes the flag AND collapses the
  state in the same `act()` tick so same-session re-renders
  don't re-fire.
- **`try/catch` silent fail around `localStorage`** (lesson
  hotfix #7 + sub-block 6.2). MiniPay's WebView occasionally
  blocks `Storage` access in incognito-style sessions and
  throws `DOMException("Storage blocked", "SecurityError")`.
  Silent fail keeps the guard from crashing the consumer; worst
  case the dialog/banner re-fires on every mount until storage
  works again (degraded but non-fatal).

## Backend V2 schema discipline

- **Lesson sub-block 5.2a** (`de8ffb0`) — `analytics.py` was
  shipping V1 schema (`Order.amount_usdt`, `Order.status`,
  `Order.product_id`, `Order.created_at`) against the V2 model
  (`total_amount_usdt`, `global_status`, `product_ids` array,
  `created_at_chain`). Sprint J5 Block 2 migrated the schema
  but the route was never updated. Endpoint 500'd on any seller
  with orders.
- **`BigInteger` raw amounts** (stored at the smallest unit, 6
  decimals for USDT) MUST be divided by `USDT_SCALE = 10**6` to
  produce a human-scale `Decimal` for the API response. Helper
  `_raw_to_human` centralises this:
  ```python
  def _raw_to_human(raw: int | Decimal | None) -> Decimal:
      return Decimal(raw or 0) / USDT_SCALE
  ```
- **`Decimal` serialization is a JSON string** in FastAPI's
  default Pydantic config. Pinned by sub-block 5.2a's
  `test_analytics_summary_decimal_serialization` spec. Frontend
  parses via `parseFloat` in the TanStack Query `select` callback
  (sub-block 5.3 `useAnalyticsSummary.parseAnalyticsSummary`),
  centralising the conversion at one boundary.
- **Audit defensive grep**: when fixing one router's V1→V2
  drift, always grep ALL routers for the same patterns
  (`Order.amount_usdt|Order.status[^_]|Order.product_id[^s]|
  Order.created_at[^_]`). Sub-block 5.2a confirmed
  `analytics.py` was the only router with drift — zero
  follow-up sweep ticket needed.

## Auth pattern (V1)

- **`X-Wallet-Address` header** on every authenticated read
  (per ADR-036). Built inline by each `lib/*-api.ts` wrapper,
  passed to `fetchApi` from `lib/fetch-api.ts` which
  auto-injects the `ngrok-skip-browser-warning` header for the
  ngrok dev workflow.
- **`useWalletHeaders` hook** (`hooks/useWalletHeaders.ts`) for
  client components that need the header for a non-wrapper
  fetch path.
- **ADR-034 EIP-191 deprecation** flagged for Phase 5 — existing
  `lib/eip191.ts` + `app/auth.py` are deprecated and must
  migrate to on-chain events captured by the J5 indexer before
  Proof of Ship submission. New mutating flows must NOT use
  signed messages.
- **ADR-036 X-Wallet-Address V1 → SIWE EIP-4361 V1.5+**
  roadmap. The current dev-mode header trust model is
  explicitly insecure (`settings.enforce_jwt_auth=False`); the
  V1.5 transition adds JWT issuance via SIWE.

## Architecture follow-ups (Phase 5 polish candidates)

- **Option C server-side middleware UA detection for
  HomeRouter** — eliminates the residual flash between server
  HomeLanding and client HomeMiniPay swap. Implementation
  via Next.js `headers()` middleware reads the request UA;
  if MiniPay detected, SSR ships HomeMiniPay directly. Estimated
  ~1.5 day. Tactical band-aid (`dynamic({ ssr: false })` from
  hotfix #6) is still sound; Option C is the strategic fix.
- **`DialogV5` lib extraction** if a 3rd V5-styled dialog
  surfaces in Phase 5. Mike's "promote-on-3rd-consumer"
  pattern (sub-blocks 5.6 IPFS gateway + 5.4
  `displayUsdtNumber`) defers extraction until the count
  actually justifies it. Current state: `MilestoneDialogV5`
  (Block 6.1) is the only V5-styled dialog; `OnboardingScreenV5`
  is full-screen takeover, different shape.
- **`useCreditsBalance` migration to TanStack Query** for
  consistency with `useOrderInitiate` + `useAnalyticsSummary`.
  Currently uses plain `useState + useEffect + manual refetch`
  pattern (Phase 2 era). Migration would be ~30 LOC + a
  consumer-side prop change; defer to Phase 5.
- **`prefers-reduced-motion` for `DialogV4`'s spring animation**
  — pre-existing condition. The motion spring on
  `DialogV4Content` does NOT respect the OS-level reduced-motion
  pref (confetti respects it, dialog doesn't). Phase 5 a11y
  polish.
- **SSR prefetch via `dehydrate(queryClient)` for
  `useAnalyticsSummary`** — eliminates the dashboard's
  loading-state flash on first paint. Out of Block 5 scope
  (premature optimization for V1); Phase 5 perf candidate.
- **`displayUsdtNumber` promotion to `lib/usdt.ts`** if a 3rd
  consumer surfaces beyond OverviewTab (currently used in 4
  KPI tiles + In escrow sub-text + 1-3 top product rows, but
  all inside a single component file).
- **`PINATA_GATEWAY` constant promotion to `lib/ipfs.ts`** —
  currently duplicated in `ImageUploader.tsx` and
  `OverviewTab.tsx`. 3rd consumer trigger pending.
- **CI integration smoke for backend drift** — add a tiny
  end-to-end test that hits `/api/v1/analytics/summary` from
  a frontend test (or via a dedicated CI job). Hotfix #10
  rationale: the 30-day backend drift was invisible because
  no test exercised the "frontend ngrok URL → backend
  localhost:8000 → real seller with orders" path.
- **`tsc --noEmit` in CI alongside `next build`** — Next's
  prod build excludes test files from its TS graph, so
  test-only TS regressions accumulate silently. Sub-block 5.7
  closure had to sweep 4 latent errors that had piled up
  pre-Block-5.

## Workflow safety — dual-repo footgun

- **Lesson hotfix #9** (`5a13a78`) — TWO physical checkouts of
  `feat/design-system-v5` lived on disk:
  - **Outer**: `C:\Users\Oxfam\projects\etalo\` (HEAD
    `e283263`, Phase 1 Block 3, 2026-04-04). Stale, dirty,
    never received any Phase 4 work.
  - **Inner**: `C:\Users\Oxfam\projects\etalo\Etalo\` (HEAD
    current, canonical per CLAUDE.md primary working dir).
  Both `.env.local` files pointed to the same ngrok URL +
  port 3000. First `pnpm dev` to start owned the tunnel.
  Hotfixes #5–#7 were "validated live in MiniPay" but in
  fact validated against the OUTER tree's legacy code. The
  fix landed only in the inner. Mike was debugging phantom
  bugs for hours.
- **Lesson hotfix #10** (`fafdc52`) — same footgun, but for
  Python backend. The Python venv + `.env` lived in the OUTER
  backend; the inner had only source code. Mike launched
  `python scripts/run_dev.py` from the outer all along —
  serving 30-day-stale code (V1 schema `Order.amount_usdt` →
  500) against the canonical frontend. Live MiniPay validation
  of Block 5 analytics returned 500s that masked as "loading
  state" until diagnosis surfaced the dual-repo issue.
- **Pattern: fail-fast hook on the deprecated tree + canonical
  banner on the live tree.**
  - Frontend: `predev` script in `packages/web/package.json`
    (outer = `echo ABORT && exit 1`; inner = `echo ===
    Canonical inner repo ===`).
  - Backend: top-of-file path check in
    `packages/backend/scripts/run_dev.py` (outer =
    `sys.exit(1)`; inner = `print("✓ ...")`).
  - Both detection paths use POSIX-slash normalisation so
    they work cross-shell on Windows.
- **Defensive `cp -ru app/ inner → outer`** as a one-time
  safety net so source-file parity holds even if the
  fail-fast guard is bypassed (e.g. `python -m app.main`
  direct, someone disables the guard locally).
- **Setup canonical venv + `.env` in inner repo** as part of
  the hotfix #10 remediation. Initial absence of these was
  the root cause of why Mike launched from the outer in the
  first place.
- **CLAUDE.md primary working dir field** is load-bearing:
  every new contributor or AI agent must read it FIRST and
  treat the path as the only canonical tree.

## Build vs dev workflow

- **Don't `npm run build` while `pnpm dev` is actively
  running.** Both write to the same `.next/` cache; the build
  re-emits chunk hashes that the running dev-server's HTML
  references no longer point to → MiniPay WebView fetches
  404'd chunks. Symptom: `Failed to load resource: 404` on
  `/_next/static/chunks/app-pages-internals.js` (and
  similar). Hotfix sequence: stop dev server, `rm -rf .next`,
  restart.
- **For bundle measurement during a live dev session**, use
  the Agent tool with `isolation: "worktree"` — spawns a
  temporary git worktree for the build so the active
  `.next/` cache stays untouched. Proposed but not yet
  documented in `docs/DEV_WORKFLOW.md` (Phase 5 polish item).
- **Dev-server cold-compile window** can produce transient
  404s on the first request after restart (Next.js compiles
  routes lazily); always reload once before assuming a real
  bug. Pattern noted during hotfix #9 diagnostic.

## ADR-041 V1 scope simplification

- **Cleanup landed in sub-block 5.1** (`e1152e8`) — dropped
  `StakeTab.tsx` (-117 LOC), `StakeActionDialog.tsx`
  (-363 LOC), `StakeTab.test.tsx` (-76 LOC), Top Seller
  refs in `OverviewTab.TIER_LABEL`, `onchain` prop chain in
  `SellerDashboardInner` + `OverviewTab`. Net **-587 LOC**.
- **Tabs went 6 → 5** (Stake removed). Side-effect bonus on
  hotfix #8: tabs natural width dropped from ~536 px (6
  triggers) to ~450 px (5 triggers), reducing the mobile
  horizontal-overflow vector that the `w-full` shell fix
  mitigates.
- **Frontend defensive `top_seller` → `active` shim** in
  `useAnalyticsSummary.parseAnalyticsSummary` (sub-block
  5.3). Backend ADR-041 sweep PR (drop `"top_seller"`
  literal from `app/schemas/analytics.py`
  `ReputationBlock.badge` enum + lift hard-coded
  `auto_release_days = 3` into a config setting) is
  separate. Frontend shim TODO points to the cleanup.
- **`is_cross_border` in checkout hooks** (`useOrderInitiate`,
  `useCheckout`, `useSequentialCheckout`,
  `lib/checkout-orchestration`) — out of Block 5 scope
  (touches checkout flow, not analytics). Tracked under a
  separate ADR-041 sweep PR.

---

## Standing patterns to apply going forward

1. **Bundle measure on every commit that adds a prod consumer of a
   heavy lib** (motion, recharts, viem, anything > 5 kB
   tree-shaken). If route grows > 1 kB, switch to dynamic.
2. **Locale + timezone pin on every formatter** — both at definition
   and in a regression test.
3. **`try/catch` around localStorage** in any new hook or
   handler — silent fail, never crash.
4. **`vi.mock` at the wrapper boundary** for any V5 lib that
   pulls heavy deps (charts, motion, dialogs) — mock the
   wrapper, assert on prop forwarding.
5. **Audit grep before assuming a single fix** — V1→V2 drift,
   ADR-041 leftovers, and similar always need a defensive
   project-wide grep before assuming the local fix is
   complete.
6. **Banner + fail-fast pattern** for any future tool that
   sets up a local-only configuration (CLI runner, admin
   server, indexer dev mode) — repeats hotfix #9/#10
   neutralization for any duplicate-checkout situation.
7. **Live MiniPay validation is only as good as the codebase
   the tunnel actually serves.** Every closure procedure
   must include a "verify served-version commit hash" step
   (e.g. via a hidden `/__build-hash` endpoint or footer
   marker baked at build time).

## Cross-references

- Sprint plan: `docs/SPRINT_J10_V5.md` (this Phase 4's
  detailed Blocks + closure sections)
- ADR log: `docs/DECISIONS.md` (ADR-040 V5 pivot, ADR-041
  V1 scope, ADR-036 X-Wallet-Address auth, ADR-034 EIP-191
  deprecation)
- Project rules: `CLAUDE.md` (design standards, V1 critical
  rules)
- Outer repo deprecation: `..\README_OUTER_REPO_DEPRECATED.md`
  (hotfix #9 + #10 remediation)
