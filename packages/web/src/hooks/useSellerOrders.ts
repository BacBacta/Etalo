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
// A quiet (all-terminal or empty) list still polls — slower — so a
// brand-new incoming order surfaces live. Gating polling on "already
// has a transient row" was a chicken-and-egg trap: a seller watching
// the Orders tab would never see a fresh order until they re-mounted.
const IDLE_REFETCH_INTERVAL_MS = 30_000;

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
    // Always poll while mounted so a seller watching the Orders tab
    // sees new orders without re-navigating. Fast (15 s) when a row is
    // mid-flight (Funded / shipping / disputed) ; steady (30 s) when the
    // list is quiet or empty — still enough to surface a fresh incoming
    // order. `refetchIntervalInBackground` stays false (global default)
    // so it pauses when the tab is hidden.
    refetchInterval: (query) => {
      const orders = query.state.data?.orders ?? [];
      return orders.some((o) => isTransientStatus(o.global_status))
        ? TRANSIENT_REFETCH_INTERVAL_MS
        : IDLE_REFETCH_INTERVAL_MS;
    },
  });
}
