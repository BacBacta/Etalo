/**
 * useMyProducts — TanStack Query wrapper over fetchMyProducts.
 *
 * Replaces the raw useState + useEffect plumbing previously inlined in
 * ProductsTab.tsx. Adds :
 *  - 30 s staleTime so coming back to the Products tab from another
 *    one renders instantly off the cache instead of refiring the
 *    fetch on every mount (the screenshot-reported tab-switch lag).
 *  - prefetch-friendly query key shape so SellerDashboardInner can
 *    warm the cache in parallel on its initial mount.
 *  - centralized cache invalidation key for mutations
 *    (create/update/delete product, status flip).
 *
 * Pattern aligned with useAnalyticsSummary / useCreditsBalance /
 * useMarketplaceProducts (the dashboard's other TanStack consumers).
 * Retry 1 covers transient blips on the ngrok tunnel without
 * hammering on real failures.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchMyProducts, type MyProductsListResponse } from "@/lib/seller-api";

export const MY_PRODUCTS_QUERY_KEY = ["my-products"] as const;

export interface UseMyProductsOptions {
  walletAddress: string | undefined;
  /** Defaults to true. Set false when the dashboard isn't ready yet
   *  (MiniPay still detecting / wallet still hydrating). */
  enabled?: boolean;
  /** Whether to include soft-deleted rows. Default false (dashboard
   *  filters those out at the route level). */
  includeDeleted?: boolean;
}

export function useMyProducts(options: UseMyProductsOptions) {
  const { walletAddress, enabled = true, includeDeleted = false } = options;
  return useQuery<MyProductsListResponse, Error>({
    queryKey: [
      ...MY_PRODUCTS_QUERY_KEY,
      walletAddress ?? "",
      includeDeleted,
    ],
    queryFn: () => {
      if (!walletAddress) {
        // queryFn never runs when enabled is false ; this branch is a
        // type narrow for the !walletAddress case where the caller
        // forgot to gate `enabled`.
        return Promise.resolve({
          products: [],
          total: 0,
        } as MyProductsListResponse);
      }
      return fetchMyProducts(walletAddress, includeDeleted);
    },
    enabled: enabled && !!walletAddress,
    staleTime: 30_000,
    retry: 1,
  });
}
