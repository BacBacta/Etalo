"use client";

import {
  ArrowRight,
  CurrencyCircleDollar,
  Lock,
  Package,
  ShoppingBag,
  Trophy,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";

import {
  useAnalyticsSummary,
  type AnalyticsSummaryParsed,
} from "@/hooks/useAnalyticsSummary";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { CardV4 } from "@/components/ui/v4/Card";
import { ChartLineV5 } from "@/components/ui/v5/ChartLineV5";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { formatChartDate, formatRowDate } from "@/lib/format";
import { type SellerProfilePublic } from "@/lib/seller-api";
import { displayUsdtFromHumanNumber, formatRawUsdt } from "@/lib/usdt";

// IPFS gateway constant — Phase A perf : switched gateway.pinata.cloud
// (4-5s) → ipfs.io (~0.5s). Both whitelisted in next.config.mjs
// `images.remotePatterns`.
const PINATA_GATEWAY = "https://ipfs.io/ipfs/";

// Status → dot color (same palette as OrdersTab for visual continuity).
const STATUS_DOT: Record<string, string> = {
  Created: "bg-neutral-400",
  Funded: "bg-amber-500",
  PartiallyShipped: "bg-blue-500",
  AllShipped: "bg-blue-500",
  PartiallyDelivered: "bg-blue-600",
  Completed: "bg-emerald-500",
  Disputed: "bg-rose-500",
  Refunded: "bg-neutral-500",
};

interface Props {
  profile: SellerProfilePublic;
  // Wallet anchor for useAnalyticsSummary ; the legacy `onchain` prop
  // was retired in 5.4 along with the off-chain stake-tier fetch.
  address: string;
}

export function OverviewTab({ profile, address }: Props) {
  const analytics = useAnalyticsSummary(address);
  // Recent orders share the seller-orders cache with OrdersTab. The
  // (page=1, pageSize=5) slot is distinct from the OrdersTab slot
  // (page=1, pageSize=20), so each subscriber pulls/refetches its own
  // shape independently while benefiting from per-key staleTime +
  // invalidation.
  const recentQuery = useSellerOrders({ address, page: 1, pageSize: 5 });
  const recent =
    recentQuery.isPending || recentQuery.isError
      ? null
      : (recentQuery.data ?? null);

  return (
    <div className="space-y-6">
      {/* Hero header — gives the dashboard a sense of place + a brief
          actionable sentence pulled from the live analytics. Avoids
          the "wall of tiles" feeling that the previous Overview had. */}
      <HeroHeader profile={profile} analytics={analytics.data ?? null} />

      {/* 4 KPI tiles : In escrow / Active orders / Revenue 24h / 7d.
          Layout : 2x2 on mobile (each tile ≥ 150 px wide on 360 px
          viewport, CLAUDE.md min) ; widens to 1x4 at lg: ≥ 1024 px.
          Each tile now carries an icon + tone-coded color so a glance
          at the dashboard tells you which numbers are good/bad. */}
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        data-testid="overview-kpi-grid"
      >
        <KpiTile
          label="In escrow"
          value={
            analytics.data
              ? displayUsdtFromHumanNumber(analytics.data.escrow.in_escrow)
              : null
          }
          subText={
            analytics.data
              ? `Released to wallet: ${displayUsdtFromHumanNumber(analytics.data.escrow.released)}`
              : undefined
          }
          loading={analytics.isPending}
          error={analytics.isError}
          icon={<Lock className="h-4 w-4" weight="regular" />}
          tone="amber"
        />
        <KpiTile
          label="Active orders"
          value={
            analytics.data ? String(analytics.data.active_orders) : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
          icon={<Package className="h-4 w-4" weight="regular" />}
          tone="indigo"
        />
        <KpiTile
          label="Revenue 24h"
          value={
            analytics.data
              ? displayUsdtFromHumanNumber(analytics.data.revenue.h24)
              : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
          icon={<CurrencyCircleDollar className="h-4 w-4" weight="regular" />}
          tone="emerald"
        />
        <KpiTile
          label="Revenue 7d"
          value={
            analytics.data
              ? displayUsdtFromHumanNumber(analytics.data.revenue.d7)
              : null
          }
          loading={analytics.isPending}
          error={analytics.isError}
          icon={<CurrencyCircleDollar className="h-4 w-4" weight="regular" />}
          tone="emerald"
        />
      </div>

      {/* Revenue chart — last 7 rolling days. The backend zero-fills
          the timeline so an all-zero week renders as a flat baseline
          (correct visual for "no sales yet"). ChartLineV5 is dynamic
          ssr:false with a SkeletonV5 fallback bundled in. */}
      <CardV4
        variant="default"
        padding="default"
        interactive={false}
        data-testid="overview-revenue-chart-card"
      >
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
              Revenue trend
            </h2>
            <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
              Last 7 days
            </p>
          </div>
          {analytics.data ? (
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums text-celo-dark dark:text-celo-light">
                {displayUsdtFromHumanNumber(analytics.data.revenue.d7)}
              </p>
              <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
                Total
              </p>
            </div>
          ) : null}
        </div>
        {analytics.isPending ? (
          <SkeletonV5
            variant="rectangle"
            className="h-[220px] w-full"
            data-testid="overview-revenue-chart-skeleton"
          />
        ) : analytics.isError || !analytics.data ? (
          <p
            className="py-12 text-center text-sm text-celo-dark/60 dark:text-celo-light/60"
            data-testid="overview-revenue-chart-error"
          >
            Unable to load chart
          </p>
        ) : analytics.data.revenue.timeline_7d.every(
            (p) => p.revenue_usdt === 0,
          ) ? (
          // No completed orders in the last 7 days — a flat-zero line
          // chart looks broken. Swap for a guidance card that nudges
          // the seller toward their first sale.
          <div
            data-testid="overview-revenue-chart-empty"
            className="flex h-[220px] flex-col items-center justify-center gap-2 px-4 text-center"
          >
            <ShoppingBag
              className="h-8 w-8 text-celo-dark/30 dark:text-celo-light/30"
              weight="regular"
              aria-hidden
            />
            <p className="text-base font-medium text-celo-dark dark:text-celo-light">
              Waiting for your first sale
            </p>
            <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
              Share your boutique link to start receiving orders.
            </p>
          </div>
        ) : (
          <ChartLineV5
            data={analytics.data.revenue.timeline_7d.map((p) => ({
              label: formatChartDate(p.date),
              value: p.revenue_usdt,
            }))}
            height={220}
          />
        )}
      </CardV4>

      {/* Top products — capped at 3 entries server-side (analytics
          router `_top_products` LIMIT 3, sub-block 5.2a). Empty array
          is a normal happy-path state for new sellers, not an error. */}
      <CardV4
        variant="default"
        padding="default"
        interactive={false}
        data-testid="overview-top-products-card"
      >
        <div className="mb-4 flex items-center gap-2">
          <Trophy
            className="h-4 w-4 text-amber-500 dark:text-amber-400"
            weight="fill"
            aria-hidden
          />
          <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
            Top products
          </h2>
          <span className="text-sm text-celo-dark/60 dark:text-celo-light/60">
            by revenue
          </span>
        </div>
        {analytics.isPending ? (
          <div
            className="space-y-2"
            data-testid="overview-top-products-skeleton"
          >
            {[0, 1, 2].map((i) => (
              <SkeletonV5
                key={i}
                variant="rectangle"
                className="h-16 w-full"
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
            {analytics.data.top_products.map((product, idx) => (
              <TopProductRow
                key={product.product_id}
                rank={idx + 1}
                product={product}
              />
            ))}
          </ul>
        )}
      </CardV4>

      {/* CLS fix : the recent-orders block was 3 skeleton rows while
          DashboardSkeleton expected 5 (~70 px each = ~140 px shift on
          first paint). Both branches reserve at least 5 rows of
          vertical space (matches DashboardSkeleton's 5 row placeholders). */}
      <div className="min-h-[360px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-celo-dark dark:text-celo-light">
            Recent orders
          </h2>
          <Link
            href="/seller/dashboard?tab=orders"
            className="inline-flex items-center gap-1 text-sm font-medium text-celo-forest hover:underline dark:text-celo-green"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" weight="bold" aria-hidden />
          </Link>
        </div>
        {recent === null ? (
          <div className="space-y-2" data-testid="overview-skeleton">
            <SkeletonV5 variant="card" className="h-16" />
            <SkeletonV5 variant="card" className="h-16" />
            <SkeletonV5 variant="card" className="h-16" />
            <SkeletonV5 variant="card" className="h-16" />
            <SkeletonV5 variant="card" className="h-16" />
          </div>
        ) : recent.orders.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-celo-light/10 dark:bg-celo-dark-elevated">
            <ShoppingBag
              className="mx-auto h-8 w-8 text-celo-dark/30 dark:text-celo-light/30"
              aria-hidden
            />
            <p className="mt-2 text-base font-medium text-celo-dark dark:text-celo-light">
              No orders yet.
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-celo-light/70">
              Once buyers fund their carts, you&apos;ll see the latest 5 here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.orders.slice(0, 5).map((o) => (
              <RecentOrderRow key={o.id} order={o} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// HeroHeader — friendly welcome strip with shop name + actionable
// subtitle. Cheap-to-render server-safe component (no async deps).
// =====================================================================

interface HeroHeaderProps {
  profile: SellerProfilePublic;
  analytics: AnalyticsSummaryParsed | null;
}

function HeroHeader({ profile, analytics }: HeroHeaderProps) {
  // The subtitle adapts to the data : pushy when there's escrow
  // waiting to be released ("3 orders need shipping"), reassuring
  // otherwise. Hides if analytics is still loading (to avoid the
  // flash of a generic subtitle then the actionable one).
  const subtitle = (() => {
    if (!analytics) return null;
    const active = analytics.active_orders;
    if (active > 0) {
      return `${active} ${active === 1 ? "order" : "orders"} waiting on you — ship soon to release funds.`;
    }
    if (analytics.revenue.h24 > 0) {
      return `Strong day — ${displayUsdtFromHumanNumber(analytics.revenue.h24)} in the last 24 h.`;
    }
    return "All caught up. Share your boutique link to drive new orders.";
  })();
  // The shop name comes from the off-chain profile ; safe to render
  // even when analytics is pending so the seller sees their identity
  // immediately.
  return (
    <div className="rounded-2xl bg-gradient-to-br from-celo-forest to-celo-forest-dark p-5 text-celo-light dark:from-celo-forest-bright dark:to-celo-forest dark:text-celo-dark">
      <p className="text-sm font-medium opacity-80">
        {profile.shop_name}
      </p>
      <h1 className="mt-1 text-xl font-semibold">
        Welcome back
      </h1>
      {subtitle ? (
        <p className="mt-2 text-sm opacity-90">{subtitle}</p>
      ) : (
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-celo-light/10 dark:bg-celo-dark/20" />
      )}
    </div>
  );
}

// =====================================================================
// KpiTile — icon + tone-coded value tile. Tones match the metric :
// amber for escrow (money waiting), indigo for orders, emerald for
// revenue. The 96 px min-height locks the box so resolving from
// skeleton → value doesn't push the chart below.
// =====================================================================

type KpiTone = "amber" | "indigo" | "emerald" | "neutral";

interface KpiTileProps {
  label: string;
  value: string | null;
  subText?: string;
  loading: boolean;
  error: boolean;
  icon?: React.ReactNode;
  tone?: KpiTone;
}

const KPI_TONE_CLASSES: Record<KpiTone, { ring: string; iconWrap: string }> = {
  amber: {
    ring: "",
    iconWrap:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  indigo: {
    ring: "",
    iconWrap:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  emerald: {
    ring: "",
    iconWrap:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  neutral: {
    ring: "",
    iconWrap:
      "bg-neutral-100 text-neutral-700 dark:bg-celo-dark-bg dark:text-celo-light/70",
  },
};

function KpiTile({
  label,
  subText,
  value,
  loading,
  error,
  icon,
  tone = "neutral",
}: KpiTileProps) {
  const toneClasses = KPI_TONE_CLASSES[tone];
  return (
    <CardV4
      variant="default"
      padding="compact"
      interactive={false}
      data-testid="overview-kpi-tile"
      data-label={label}
      className={`min-h-[112px] ${toneClasses.ring}`}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            aria-hidden
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${toneClasses.iconWrap}`}
          >
            {icon}
          </span>
        ) : null}
        <p className="text-sm font-medium text-celo-dark/70 dark:text-celo-light/70">
          {label}
        </p>
      </div>
      {loading ? (
        <SkeletonV5
          variant="rectangle"
          className="mt-3 h-7 w-24"
          data-testid={`overview-kpi-skeleton-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
      ) : error || value === null ? (
        <p
          className="mt-2 text-2xl font-semibold text-celo-dark/40 dark:text-celo-light/40"
          data-testid={`overview-kpi-fallback-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          —
        </p>
      ) : (
        <p
          className="mt-2 text-2xl font-semibold tabular-nums text-celo-dark dark:text-celo-light"
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

// =====================================================================
// TopProductRow — ranked product row with gold/silver/bronze rank
// chip. The thumbnail is now 56 px (was 48 px) so the seller can
// visually identify their best-sellers without opening each one.
// =====================================================================

const RANK_CLASSES: Record<number, string> = {
  1: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  2: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200",
  3: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
};

interface TopProductRowProps {
  product: AnalyticsSummaryParsed["top_products"][number];
  rank: number;
}

function TopProductRow({ product, rank }: TopProductRowProps) {
  const rankClass = RANK_CLASSES[rank] ?? "bg-neutral-100 text-neutral-700";
  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-celo-dark/[8%] p-2.5 dark:border-celo-light/[8%]"
      data-testid="overview-top-product-row"
      data-product-id={product.product_id}
    >
      <span
        aria-label={`Rank ${rank}`}
        className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${rankClass}`}
      >
        {rank}
      </span>
      {product.image_ipfs_hash ? (
        <Image
          src={`${PINATA_GATEWAY}${product.image_ipfs_hash}`}
          alt={product.title}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-sm text-celo-dark/40 dark:bg-celo-dark-elevated dark:text-celo-light/40"
          data-testid="overview-top-product-no-image"
          aria-label="No image available"
        >
          No image
        </div>
      )}
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-celo-dark dark:text-celo-light">
        {product.title}
      </p>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-celo-dark dark:text-celo-light">
        {displayUsdtFromHumanNumber(product.revenue_usdt)}
      </p>
    </li>
  );
}

// =====================================================================
// RecentOrderRow — mirrors the OrdersTab card style (status dot,
// urgency hint, clean header) so the dashboard reads as one cohesive
// surface instead of two design dialects. Clickable to navigate to
// the full Orders tab.
// =====================================================================

interface RecentOrderRowProps {
  order: {
    id: string;
    onchain_order_id: number;
    global_status: string;
    total_amount_usdt: number;
    created_at_chain: string;
  };
}

function RecentOrderRow({ order }: RecentOrderRowProps) {
  const dotClass =
    STATUS_DOT[order.global_status] ?? "bg-neutral-400";
  return (
    <li>
      <Link
        href="/seller/dashboard?tab=orders"
        className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-colors hover:border-celo-forest/40 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:hover:bg-celo-dark-bg"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
            />
            <span className="text-sm font-medium text-celo-dark dark:text-celo-light">
              {order.global_status}
            </span>
            <span
              aria-hidden
              className="text-neutral-300 dark:text-celo-light/30"
            >
              ·
            </span>
            <span className="truncate text-sm tabular-nums text-neutral-500 dark:text-celo-light/60">
              #{order.onchain_order_id}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-celo-light/60 tabular-nums">
            {formatRowDate(order.created_at_chain)}
          </p>
        </div>
        <span className="flex-shrink-0 text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
          {formatRawUsdt(order.total_amount_usdt)} USDT
        </span>
      </Link>
    </li>
  );
}

// Re-exported for tests so the fixture can build a parsed-shape mock
// without re-importing from the hook module.
export type { AnalyticsSummaryParsed };
