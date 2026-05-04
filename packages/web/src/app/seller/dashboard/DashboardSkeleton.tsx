/**
 * DashboardSkeleton — perceptual loading shell for /seller/dashboard
 * (J10-V5 Phase 5 polish item #7).
 *
 * Mirrors the real dashboard's layout (header + tab list + KPI tiles +
 * chart + top products + recent orders) so the user sees the page
 * structure immediately on first paint, instead of a single
 * "Loading…" line that suggests a much longer wait.
 *
 * Why a skeleton instead of true SSR prefetch :
 *   - True `dehydrate(queryClient)` SSR prefetch needs the server to
 *     know "this user is wallet X" before render starts. V1's auth is
 *     client-side `X-Wallet-Address` (ADR-036) ; no SIWE / no signed
 *     cookie session, so the server can't trust any address claim.
 *   - Cookie-based session without crypto verification = forgeable
 *     (any attacker could read another seller's analytics). Blocked
 *     by ADR-034 + ADR-036 architecture until SIWE lands V1.5+.
 *   - Phase 1 investigation Item #7 → Option C (this) chosen as the
 *     V1 pragmatic alternative ; 80-90% of the perception "fast"
 *     win without touching auth.
 *
 * Reused by :
 *   - `app/seller/dashboard/page.tsx` Suspense fallback (covers the
 *     `useSearchParams` server-render gate).
 *   - `app/seller/dashboard/SellerDashboardInner.tsx` `loading=true`
 *     branch (covers the post-mount profile fetch).
 *
 * Container classes match the real dashboard's
 * `mx-auto w-full max-w-3xl px-4 py-6` so the skeleton aligns exactly
 * with the content that replaces it — no layout shift on resolve.
 */
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";

export function DashboardSkeleton() {
  return (
    <main
      id="main"
      className="min-h-screen"
      aria-busy="true"
      aria-label="Loading dashboard"
      data-testid="dashboard-skeleton"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        {/* Header — h1 "Your shop" + @handle */}
        <SkeletonV5 variant="text" className="mb-1 h-7 w-32" />
        <SkeletonV5 variant="text" className="mb-6 h-4 w-24" />

        {/* Tab list — 5 triggers (Overview / Products / Orders /
            Profile / Marketing). Horizontal pills inside a flex row,
            same overflow-x-auto wrapper as TabsV4List. */}
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonV5
              key={i}
              variant="rectangle"
              className="h-9 w-20 shrink-0 rounded-full"
            />
          ))}
        </div>

        <div className="space-y-6">
          {/* KPI tiles — 4 cards, 2x2 mobile / 1x4 lg ; mirrors the
              OverviewTab grid below the tabs. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonV5 key={i} variant="card" className="h-24" />
            ))}
          </div>

          {/* Chart — ChartLineV5 lives on a single card row. */}
          <SkeletonV5 variant="card" className="h-48" />

          {/* Top products — section heading + 3 row placeholders. */}
          <div className="space-y-2">
            <SkeletonV5 variant="text" className="h-5 w-28" />
            {[0, 1, 2].map((i) => (
              <SkeletonV5 key={i} variant="card" className="h-14" />
            ))}
          </div>

          {/* Recent orders — section heading + 5 row placeholders. */}
          <div className="space-y-2">
            <SkeletonV5 variant="text" className="h-5 w-28" />
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonV5 key={i} variant="card" className="h-14" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
