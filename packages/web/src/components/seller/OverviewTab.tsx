"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  useAnalyticsSummary,
  type AnalyticsSummaryParsed,
} from "@/hooks/useAnalyticsSummary";
import { CardV4 } from "@/components/ui/v4/Card";
import { ChartLineV5 } from "@/components/ui/v5/ChartLineV5";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  fetchSellerOrders,
  formatRawUsdt,
  type SellerOrdersPage,
  type SellerProfilePublic,
} from "@/lib/seller-api";

// Block 5 sub-block 5.6 — IPFS gateway constant. Mirrors the local
// constant in ImageUploader.tsx (the only other current consumer) ;
// if a 3rd consumer surfaces, promote both to lib/ipfs.ts. Phase 5
// polish candidate. `gateway.pinata.cloud` is whitelisted in
// next.config.mjs `images.remotePatterns` so next/image accepts it.
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

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

// Block 5 sub-block 5.5 — chart x-axis label formatter. Backend ships
// each timeline_7d entry's `date` as an ISO calendar string ("2026-04-
// 28"), already computed against UTC chain timestamps. Formatting
// also in UTC keeps the displayed day stable regardless of the user's
// browser timezone (a UTC-7 user opening the dashboard at 23:30 local
// would otherwise see yesterday's bar labelled with today's date).
// Locale pinned "en-US" same as displayUsdtNumber (sub-block 5.4
// lesson : avoid system-locale leak — Mike's box is fr_FR which
// would output "28 avr.").
const CHART_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatChartDate(isoDate: string): string {
  return CHART_DATE_FORMATTER.format(new Date(isoDate));
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

      {/*
        Revenue trend over the last 7 rolling days. The backend
        zero-fills the timeline so the array is always 7 entries —
        ChartLineV5's empty-state branch (data.length === 0) doesn't
        fire from this consumer; an all-zero week renders as a flat
        baseline, which is the correct visual for "no sales yet".
        ChartLineV5 itself is dynamic ssr:false with a SkeletonV5
        loading fallback bundled in, so the recharts chunk only ships
        on routes that actually mount the chart (this is its first
        production consumer).
      */}
      <CardV4
        variant="default"
        padding="compact"
        interactive={false}
        data-testid="overview-revenue-chart-card"
      >
        <h2 className="mb-3 text-base font-semibold">
          Revenue trend (last 7 days)
        </h2>
        {analytics.isPending ? (
          <SkeletonV5
            variant="rectangle"
            className="h-[200px] w-full"
            data-testid="overview-revenue-chart-skeleton"
          />
        ) : analytics.isError || !analytics.data ? (
          <p
            className="py-8 text-center text-sm text-celo-dark/60 dark:text-celo-light/60"
            data-testid="overview-revenue-chart-error"
          >
            Unable to load chart
          </p>
        ) : (
          <ChartLineV5
            data={analytics.data.revenue.timeline_7d.map((p) => ({
              label: formatChartDate(p.date),
              value: p.revenue_usdt,
            }))}
            height={200}
          />
        )}
      </CardV4>

      {/*
        Top products surface — capped at 3 entries server-side
        (analytics router `_top_products` LIMIT 3, sub-block 5.2a).
        Empty array is a normal happy-path state for new sellers,
        not an error — copy nudges them toward "your first sale" UX
        rather than "something broke".
      */}
      <CardV4
        variant="default"
        padding="compact"
        interactive={false}
        data-testid="overview-top-products-card"
      >
        <h2 className="mb-3 text-base font-semibold">Top products</h2>
        {analytics.isPending ? (
          <div
            className="space-y-2"
            data-testid="overview-top-products-skeleton"
          >
            {[0, 1, 2].map((i) => (
              <SkeletonV5
                key={i}
                variant="rectangle"
                className="h-14 w-full"
              />
            ))}
          </div>
        ) : analytics.isError || !analytics.data ? (
          <p
            className="py-4 text-sm text-celo-dark/60 dark:text-celo-light/60"
            data-testid="overview-top-products-error"
          >
            Unable to load top products
          </p>
        ) : analytics.data.top_products.length === 0 ? (
          <p
            className="py-4 text-sm text-celo-dark/60 dark:text-celo-light/60"
            data-testid="overview-top-products-empty"
          >
            No top products yet — your top sellers will appear here
            once orders complete.
          </p>
        ) : (
          <ul
            className="space-y-2"
            data-testid="overview-top-products-list"
          >
            {analytics.data.top_products.map((product) => (
              <TopProductRow key={product.product_id} product={product} />
            ))}
          </ul>
        )}
      </CardV4>

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
                    <span className="tabular-nums">
                      {formatRawUsdt(o.total_amount_usdt)}
                    </span>{" "}
                    USDT ·{" "}
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

interface TopProductRowProps {
  product: AnalyticsSummaryParsed["top_products"][number];
}

function TopProductRow({ product }: TopProductRowProps) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-celo-dark/[8%] p-2 dark:border-celo-light/[8%]"
      data-testid="overview-top-product-row"
      data-product-id={product.product_id}
    >
      {product.image_ipfs_hash ? (
        <Image
          src={`${PINATA_GATEWAY}${product.image_ipfs_hash}`}
          alt={product.title}
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs text-celo-dark/40 dark:bg-celo-dark-elevated dark:text-celo-light/40"
          data-testid="overview-top-product-no-image"
          aria-label="No image available"
        >
          No image
        </div>
      )}
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        {product.title}
      </p>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {displayUsdtNumber(product.revenue_usdt)}
      </p>
    </li>
  );
}

// Re-exported for tests so the fixture can build a parsed-shape mock
// without re-importing from the hook module.
export type { AnalyticsSummaryParsed };
