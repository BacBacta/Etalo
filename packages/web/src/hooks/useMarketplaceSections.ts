/**
 * useMarketplaceSections — curated discovery rails over
 * GET /marketplace/sections.
 *
 * Only fired on the unfiltered discovery view (the caller gates
 * `enabled`). staleTime 60s mirrors the endpoint's Cache-Control so the
 * rails feel as fresh as the rest of the marketplace without refetching
 * on every mount.
 */
import { useQuery } from "@tanstack/react-query";

import {
  fetchMarketplaceSections,
  type MarketplaceSectionsResponse,
} from "@/lib/api";

export const MARKETPLACE_SECTIONS_QUERY_KEY = ["marketplace-sections"] as const;

export interface UseMarketplaceSectionsOptions {
  /** ISO alpha-3 country filter (NGA / GHA / KEN). Omit / "all" → every
   *  V1 market. Included in the query key so a market switch refetches. */
  country?: string | null;
  enabled?: boolean;
}

export function useMarketplaceSections(
  options: UseMarketplaceSectionsOptions = {},
) {
  const country =
    options.country && options.country !== "all" ? options.country : null;
  return useQuery<MarketplaceSectionsResponse, Error>({
    queryKey: [...MARKETPLACE_SECTIONS_QUERY_KEY, country ?? "all"],
    queryFn: () => fetchMarketplaceSections(country),
    staleTime: 60_000,
    retry: 1,
    enabled: options.enabled ?? true,
  });
}
