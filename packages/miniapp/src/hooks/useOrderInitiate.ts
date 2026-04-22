import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

export interface OrderInitiateResponse {
  product: {
    id: string;
    title: string;
    image_url: string | null;
    slug: string;
  };
  seller: {
    shop_handle: string;
    shop_name: string;
    address: string;
    country: string | null;
  };
  amount_raw: string;
  is_cross_border: boolean;
  auto_release_days_estimate: number;
  contracts: {
    escrow: string;
    usdt: string;
  };
}

export function useOrderInitiate(productId: string | undefined) {
  const { address, isConnected } = useMinipay();
  return useQuery({
    queryKey: ["orders", "initiate", productId, address],
    queryFn: () =>
      apiFetch<OrderInitiateResponse>("/orders/initiate", {
        method: "POST",
        wallet: address!,
        body: JSON.stringify({ product_id: productId }),
      }),
    enabled: Boolean(productId) && isConnected && Boolean(address),
    // Re-fetch on mount — checkout params depend on the connected
    // buyer's country and the product's current stock.
    staleTime: 0,
    retry: 0,
  });
}
