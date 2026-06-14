import { fetchApi } from "@/lib/fetch-api";

/** Public on-chain platform metrics (GET /api/v1/stats). USDT amounts
 *  arrive as decimal strings. */
export interface PlatformStats {
  total_orders: number;
  completed_orders: number;
  refunded_orders: number;
  disputed_orders: number;
  unique_buyers: number;
  unique_sellers: number;
  gmv_usdt: string;
  commission_usdt: string;
  dispute_rate_pct: string;
  orders_30d: number;
  gmv_30d_usdt: string;
  currency: string;
  network: string;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const res = await fetchApi("/stats");
  if (!res.ok) {
    throw new Error(`Stats fetch failed: ${res.status}`);
  }
  return (await res.json()) as PlatformStats;
}
