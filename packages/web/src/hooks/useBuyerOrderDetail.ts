/**
 * useBuyerOrderDetail — TanStack Query wrapper for the buyer order
 * detail surface. J11.5 Block 4.A.
 *
 * Always passes `?caller=<connectedAddress>` for the ADR-043 casual
 * privacy filter. The endpoint stays readable without it (V1
 * backwards compat for the seller dashboard) but the buyer interface
 * declares itself systematically — that's the whole point of the
 * filter.
 *
 * Disabled until both `orderId` and `caller` are present (waits for
 * MiniPay autoconnect).
 */
import { useQuery } from "@tanstack/react-query";

import {
  BuyerOrderNotFoundError,
  fetchBuyerOrderDetail,
} from "@/lib/orders/api";
import type { OrderResponse } from "@/lib/orders/state";

export const BUYER_ORDER_DETAIL_QUERY_KEY = "buyer-order-detail";

export interface UseBuyerOrderDetailArgs {
  orderId: string | undefined;
  caller: string | undefined;
  enabled?: boolean;
}

export function useBuyerOrderDetail({
  orderId,
  caller,
  enabled = true,
}: UseBuyerOrderDetailArgs) {
  return useQuery<OrderResponse, Error>({
    queryKey: [BUYER_ORDER_DETAIL_QUERY_KEY, orderId, caller?.toLowerCase()],
    queryFn: () => {
      if (!orderId) throw new Error("orderId required");
      return fetchBuyerOrderDetail({ orderId, caller });
    },
    enabled: enabled && Boolean(orderId) && Boolean(caller),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // 404 is intentional (ADR-043 casual filter or genuine miss) —
      // do not retry. Other errors get one retry like elsewhere.
      if (error instanceof BuyerOrderNotFoundError) return false;
      return failureCount < 1;
    },
  });
}
