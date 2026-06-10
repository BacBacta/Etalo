/**
 * useBuyerOrders — TanStack Query wrapper for the buyer order list.
 *
 * J11.5 Block 3.C. Mirrors the codebase's standard query pattern
 * (cf. useMarketplaceProducts, useAnalyticsSummary) — staleTime 30s,
 * retry 1. The QueryClient is already mounted in `Providers.tsx`.
 *
 * Disabled when no wallet is connected. The page wrapper uses
 * `useAccount` (wagmi) and passes the address ; if it's undefined,
 * `enabled` flips to false and the buyer interface renders the
 * "connect wallet" CTA instead.
 */
import { useQuery } from "@tanstack/react-query";

import {
  BUYER_ORDERS_DEFAULT_LIMIT,
  fetchBuyerOrders,
} from "@/lib/orders/api";
import { isTransientStatus, type OrderListResponse } from "@/lib/orders/state";

const TRANSIENT_REFETCH_INTERVAL_MS = 15_000;
// Quiet/empty list still polls (slower) so a newly-placed order shows
// up live instead of only on remount. See useSellerOrders for the
// chicken-and-egg rationale.
const IDLE_REFETCH_INTERVAL_MS = 30_000;

export const BUYER_ORDERS_QUERY_KEY = "buyer-orders";

export interface UseBuyerOrdersArgs {
  buyer: string | undefined;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useBuyerOrders({
  buyer,
  limit = BUYER_ORDERS_DEFAULT_LIMIT,
  offset = 0,
  enabled = true,
}: UseBuyerOrdersArgs) {
  return useQuery<OrderListResponse, Error>({
    queryKey: [BUYER_ORDERS_QUERY_KEY, buyer?.toLowerCase(), limit, offset],
    queryFn: () => {
      // Type narrowed by `enabled` gate, but TS doesn't see through it.
      if (!buyer) throw new Error("buyer address required");
      return fetchBuyerOrders({ buyer, limit, offset });
    },
    enabled: enabled && Boolean(buyer),
    staleTime: 30_000,
    retry: 1,
    // Same policy as useSellerOrders : always poll while mounted (15 s
    // when a row is mid-flight, 30 s when quiet) so the list stays live.
    // The buyer list shape is `items[]` (not `orders[]`) since it reuses
    // the FastAPI paginated container.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((o) => isTransientStatus(o.global_status))
        ? TRANSIENT_REFETCH_INTERVAL_MS
        : IDLE_REFETCH_INTERVAL_MS;
    },
  });
}
