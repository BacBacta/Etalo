import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

export interface TimelinePoint {
  date: string; // YYYY-MM-DD
  revenue_usdt: string; // decimal string
}

export interface RevenueBlock {
  h24: string;
  d7: string;
  d30: string;
  timeline_7d: TimelinePoint[];
}

export interface EscrowBlock {
  in_escrow: string;
  released: string;
}

export type ReputationBadge =
  | "new_seller"
  | "active"
  | "top_seller"
  | "suspended";

export interface ReputationBlock {
  score: number;
  badge: ReputationBadge;
  auto_release_days: number;
}

export interface TopProductEntry {
  product_id: string;
  title: string;
  revenue_usdt: string;
  image_ipfs_hash: string | null;
}

export interface AnalyticsSummary {
  revenue: RevenueBlock;
  active_orders: number;
  escrow: EscrowBlock;
  reputation: ReputationBlock;
  top_products: TopProductEntry[];
}

export function useAnalyticsSummary() {
  const { address, isConnected } = useMinipay();
  return useQuery({
    queryKey: ["analytics", "summary", address],
    queryFn: () =>
      apiFetch<AnalyticsSummary>("/analytics/summary", { wallet: address! }),
    enabled: isConnected && Boolean(address),
    staleTime: 60_000,
  });
}
