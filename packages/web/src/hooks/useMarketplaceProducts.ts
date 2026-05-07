/**
 * useMarketplaceProducts — TanStack Query infinite query over
 * GET /marketplace/products (J10-V5 Phase 5 Block 2 sub-block 2.3a).
 *
 * Replaces MarketplacePage's useState + useEffect + raw fetch +
 * cursor-tracking plumbing with the codebase's now-standard TanStack
 * Query pattern (5th consumer after useAnalyticsSummary,
 * useOrderInitiate, useCheckout, useMilestoneOnce). The QueryClient is
 * already mounted in Providers.tsx, so no provider wiring changes here.
 *
 * The hook is also the foundation for sub-block 2.3a's mandatory visible
 * Refresh button — `query.refetch()` (or `queryClient.invalidateQueries`
 * on this exact key) becomes the one-line invalidation path that the
 * pull-to-refresh gesture in 2.3b will reuse.
 *
 * staleTime 30 s mirrors the boundary cache hint set by
 * `fetchMarketplaceProducts` (`next: { revalidate: 30 }` in lib/api.ts)
 * and matches useAnalyticsSummary so the marketplace feels as fresh as
 * the seller dashboard does. retry 1 covers transient blips on the
 * ngrok tunnel without hammering on real failures — the endpoint is
 * read-only and idempotent so retrying is safe.
 */
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  fetchMarketplaceProducts,
  type MarketplaceListResponse,
} from "@/lib/api";

export const MARKETPLACE_PRODUCTS_QUERY_KEY = ["marketplace-products"] as const;

const PAGE_SIZE = 20;

export interface UseMarketplaceProductsOptions {
  enabled?: boolean;
  /** ISO 3166-1 alpha-3 country filter (NGA / GHA / KEN). Omit or pass
   *  "all" for no filter. J11.7 Block 9 (ADR-045) — included in the
   *  query key so changes refetch a fresh page. */
  country?: string | null;
}

export function useMarketplaceProducts(
  options: UseMarketplaceProductsOptions = {},
) {
  const country = options.country && options.country !== "all"
    ? options.country
    : null;
  return useInfiniteQuery<MarketplaceListResponse, Error>({
    queryKey: [...MARKETPLACE_PRODUCTS_QUERY_KEY, country ?? "all"],
    queryFn: ({ pageParam }) =>
      fetchMarketplaceProducts({
        cursor: pageParam as string | null,
        limit: PAGE_SIZE,
        country,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination.has_more) return undefined;
      return lastPage.pagination.next_cursor ?? undefined;
    },
    staleTime: 30_000,
    retry: 1,
    enabled: options.enabled ?? true,
  });
}
