"use client";

import { useEffect, useState } from "react";

import {
  useAnalyticsSummary,
  type AnalyticsSummaryParsed,
} from "@/hooks/useAnalyticsSummary";
import { CardV4 } from "@/components/ui/v4/Card";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  fetchSellerOrders,
  formatRawUsdt,
  type SellerOrdersPage,
  type SellerProfilePublic,
} from "@/lib/seller-api";

interface Props {
  // J7 Block 7a: Marketing stub moved to its own MarketingTab. `profile`
  // is kept on the props for API compatibility with the dashboard
  // wiring; remove on the next OverviewTab refactor pass if still
  // unused.
  profile: SellerProfilePublic; // eslint-disable-line @typescript-eslint/no-unused-vars
  // Block 5 sub-block 5.4 — `address` is now also the wallet anchor
  // for useAnalyticsSummary; the legacy `onchain` prop was retired in
  // 5.4 along with the off-chain stake-tier fetch (no remaining
  // consumer).
  address: string;
}

// Block 5 sub-block 5.4 — local formatter rather than a new export
// to lib/usdt.ts. `displayUsdt` there takes bigint (raw 6-decimal
// units); the analytics hook (5.3) already parseFloat'd the backend
// Decimal strings into plain numbers, so the input here is human-
// scale. Sub-blocks 5.5 (chart tooltip) / 5.6 (top products) will
// decide whether to promote this to a shared helper.
//
// Locale pinned to "en-US" so the decimal separator stays "." and
// thousands stays "," regardless of the user's system locale. The 4
// V1 markets (NG / GH / KE / ZA) all default English on MiniPay
// devices and CLAUDE.md mandates English in code/UI ; pinning here
// also keeps Vitest snapshots locale-independent across CI runners.
function displayUsdtNumber(amount: number): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

export function OverviewTab({ address }: Props) {
  const analytics = useAnalyticsSummary(address);
  const [recent, setRecent] = useState<SellerOrdersPage | null>(null);

  useEffect(() => {
    fetchSellerOrders(address, 1, 5)
      .then(setRecent)
      .catch(() => setRecent(null));
  }, [address]);

  return (
    <div className="space-y-6">
      {/*
        4 KPI tiles fed by /api/v1/analytics/summary. 2x2 on mobile so
        each tile keeps a tappable footprint above ~150 px wide on a
        360 px viewport (CLAUDE.md design min) ; widens to a single 1x4
        row at lg: (>= 1024 px). Hotfix #8 lesson : the parent
        container in SellerDashboardInner.tsx already has `w-full
        max-w-3xl px-4` so this grid stays inside the viewport without
        re-introducing horizontal scroll.
      */}
      <div
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        data-testid="overview-kpi-grid"
      >
        <KpiTile
          label="Revenue 24h"
          value={
            analytics.data
              ? displayUsdtNumber(analytics.data.revenue.h24)
              : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
        />
        <KpiTile
          label="Revenue 7d"
          value={
            analytics.data
              ? displayUsdtNumber(analytics.data.revenue.d7)
              : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
        />
        <KpiTile
          label="Active orders"
          value={
            analytics.data ? String(analytics.data.active_orders) : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
        />
        <KpiTile
          label="In escrow"
          value={
            analytics.data
              ? displayUsdtNumber(analytics.data.escrow.in_escrow)
              : null
          }
          subText={
            analytics.data
              ? `Released: ${displayUsdtNumber(analytics.data.escrow.released)}`
              : undefined
          }
          loading={analytics.isPending}
          error={analytics.isError}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent orders</h2>
        {recent === null ? (
          <div className="space-y-3" data-testid="overview-skeleton">
            <SkeletonV5 variant="row" />
            <SkeletonV5 variant="row" />
            <SkeletonV5 variant="row" />
          </div>
        ) : recent.orders.length === 0 ? (
          <p className="text-base text-neutral-600">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <CardV4
                  variant="default"
                  padding="compact"
                  interactive={false}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium">
                      Order #{o.onchain_order_id}
                    </span>
                    <span className="text-sm text-celo-dark/60">
                      {o.global_status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-celo-dark/60">
                    {formatRawUsdt(o.total_amount_usdt)} USDT ·{" "}
                    {new Date(o.created_at_chain).toLocaleDateString()}
                  </div>
                </CardV4>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string | null;
  subText?: string;
  loading: boolean;
  error: boolean;
}

function KpiTile({ label, subText, value, loading, error }: KpiTileProps) {
  return (
    <CardV4
      variant="default"
      padding="compact"
      interactive={false}
      data-testid="overview-kpi-tile"
      data-label={label}
    >
      <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
        {label}
      </p>
      {loading ? (
        <SkeletonV5
          variant="rectangle"
          className="mt-2 h-7 w-24"
          data-testid={`overview-kpi-skeleton-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
      ) : error || value === null ? (
        <p
          className="mt-1 text-xl font-semibold text-celo-dark/40 dark:text-celo-light/40"
          data-testid={`overview-kpi-fallback-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          —
        </p>
      ) : (
        <p
          className="mt-1 text-xl font-semibold tabular-nums"
          data-testid={`overview-kpi-value-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </p>
      )}
      {!loading && !error && subText ? (
        <p className="mt-1 text-sm text-celo-dark/60 dark:text-celo-light/60 tabular-nums">
          {subText}
        </p>
      ) : null}
    </CardV4>
  );
}

// Re-exported for tests so the fixture can build a parsed-shape mock
// without re-importing from the hook module.
export type { AnalyticsSummaryParsed };
