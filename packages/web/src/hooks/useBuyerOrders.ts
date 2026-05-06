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
import type { OrderListResponse } from "@/lib/orders/state";

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
  });
}
