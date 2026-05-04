/**
 * useAnalyticsSummary — TanStack Query hook over GET /analytics/summary
 * (J10-V5 Phase 4 Block 5 sub-block 5.3).
 *
 * Single responsibility post Phase 5 Angle C sub-block C.3 (defensive
 * shim removed) : Decimal-as-JSON-string → number conversion. The
 * backend ships every monetary field as a JSON string (FastAPI's
 * default Decimal serialisation, contract-pinned by the e2e tests in
 * sub-block 5.2a) so amounts > 2^53 / 10^6 USDT can't lose precision
 * in transit. The selector parseFloat's them once at the boundary so
 * chart libs and tabular-num formatters never see strings.
 *
 * Pattern matches useOrderInitiate : queryKey scoped on the wallet
 * address, `enabled: Boolean(walletAddress)` gate so the query never
 * fires before MiniPay/wagmi resolves the address. staleTime 30s : the
 * dashboard is moderately polled (tab switches, nav back from a sale)
 * and 30s of cache reuse keeps the network quiet without making the
 * KPI tiles look frozen after a fresh sale lands.
 */
import { useQuery } from "@tanstack/react-query";

import {
  fetchAnalyticsSummary,
  type AnalyticsSummary,
} from "@/lib/analytics-api";

// V1 badge values per the backend Literal enum (ADR-041 V1.1 deferred
// "top_seller" — backend Phase 5 Angle C sub-block C.1 dropped the
// value from the schema). Consumers can branch exhaustively on this
// union ; api.gen.ts will narrow `badge` to the same Literal post the
// next `pnpm gen:api` regen, making the cast at the boundary
// type-safe automatic.
export type AnalyticsBadge = "new_seller" | "active" | "suspended";

export interface AnalyticsSummaryParsed {
  revenue: {
    h24: number;
    d7: number;
    d30: number;
    timeline_7d: { date: string; revenue_usdt: number }[];
  };
  active_orders: number;
  escrow: { in_escrow: number; released: number };
  reputation: {
    score: number;
    badge: AnalyticsBadge;
    auto_release_days: number;
  };
  top_products: {
    product_id: string;
    title: string;
    revenue_usdt: number;
    image_ipfs_hash: string | null;
  }[];
}

export function parseAnalyticsSummary(
  raw: AnalyticsSummary,
): AnalyticsSummaryParsed {
  // J10-V5 Phase 5 Angle C sub-block C.3 — ADR-041 defensive shim
  // ("top_seller" → "active") removed. Backend ReputationBlock.badge is
  // now `Literal["new_seller", "active", "suspended"]` (sub-block C.1)
  // ; the cast remains until `pnpm gen:api` refreshes api.gen.ts to
  // narrow `badge: string` to the same Literal.
  return {
    revenue: {
      h24: parseFloat(raw.revenue.h24),
      d7: parseFloat(raw.revenue.d7),
      d30: parseFloat(raw.revenue.d30),
      timeline_7d: raw.revenue.timeline_7d.map((p) => ({
        date: p.date,
        revenue_usdt: parseFloat(p.revenue_usdt),
      })),
    },
    active_orders: raw.active_orders,
    escrow: {
      in_escrow: parseFloat(raw.escrow.in_escrow),
      released: parseFloat(raw.escrow.released),
    },
    reputation: {
      score: raw.reputation.score,
      badge: raw.reputation.badge as AnalyticsBadge,
      auto_release_days: raw.reputation.auto_release_days,
    },
    top_products: raw.top_products.map((p) => ({
      product_id: p.product_id,
      title: p.title,
      revenue_usdt: parseFloat(p.revenue_usdt),
      image_ipfs_hash: p.image_ipfs_hash ?? null,
    })),
  };
}

export function useAnalyticsSummary(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["analytics", "summary", walletAddress] as const,
    queryFn: () => fetchAnalyticsSummary(walletAddress as string),
    enabled: Boolean(walletAddress),
    select: parseAnalyticsSummary,
    // 30 s of cache reuse: tab switches between Overview / Products /
    // Orders don't re-fetch, but a fresh sale lands within ~30 s of
    // navigating back. gcTime stays at the React Query v5 default
    // (5 min) so unmount-then-remount inside that window hydrates
    // from cache instantly.
    staleTime: 30_000,
    // 1 retry covers transient network blips on the ngrok tunnel
    // without hammering on real failures (401 / 500). The endpoint
    // is read-only and idempotent so retrying is safe.
    retry: 1,
  });
}
