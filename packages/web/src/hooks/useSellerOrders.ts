/**
 * useSellerOrders — TanStack Query wrapper over fetchSellerOrders.
 *
 * Replaces the raw useState + useEffect previously inlined in both
 * OrdersTab.tsx and OverviewTab.tsx (recent-orders strip). The lag the
 * user reported when clicking between dashboard tabs was driven by
 * those two consumers re-mounting + re-fetching on every Radix Tabs
 * switch ; with a 30 s staleTime here the second mount renders
 * instantly off cache and only fires a background refetch when the
 * staleTime elapses or a mutation invalidates the key.
 *
 * Query key includes `(address, page, pageSize, status)` so the
 * Overview "5 most recent" view doesn't share a cache slot with the
 * full OrdersTab list — they're conceptually different queries with
 * different page sizes.
 */
import { useQuery } from "@tanstack/react-query";

import { isTransientStatus } from "@/lib/orders/state";
import { fetchSellerOrders, type SellerOrdersPage } from "@/lib/seller-api";

const TRANSIENT_REFETCH_INTERVAL_MS = 15_000;

export const SELLER_ORDERS_QUERY_KEY = ["seller-orders"] as const;

export interface UseSellerOrdersOptions {
  address: string | undefined;
  page?: number;
  pageSize?: number;
  /** `OrderStatus` filter. Empty / undefined = all statuses. */
  status?: string;
  enabled?: boolean;
}

export function useSellerOrders(options: UseSellerOrdersOptions) {
  const {
    address,
    page = 1,
    pageSize = 20,
    status,
    enabled = true,
  } = options;
  return useQuery<SellerOrdersPage, Error>({
    queryKey: [
      ...SELLER_ORDERS_QUERY_KEY,
      address ?? "",
      page,
      pageSize,
      status ?? "",
    ],
    queryFn: () => {
      if (!address) {
        return Promise.resolve({
          orders: [],
          pagination: {
            page,
            page_size: pageSize,
            total: 0,
            has_more: false,
          },
        } as SellerOrdersPage);
      }
      return fetchSellerOrders(
        address,
        page,
        pageSize,
        status || undefined,
      );
    },
    enabled: enabled && !!address,
    staleTime: 30_000,
    retry: 1,
    // Background poll only while at least one row is in a transient
    // state (Funded / shipping in-flight / disputed). A list with only
    // terminal rows doesn't move ; we skip the indexer round-trip and
    // wait for window-focus/manual invalidation. Saves mobile data on
    // sellers with hundreds of completed orders.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.orders.length === 0) return false;
      return data.orders.some((o) => isTransientStatus(o.global_status))
        ? TRANSIENT_REFETCH_INTERVAL_MS
        : false;
    },
  });
}
