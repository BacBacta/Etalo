/**
 * useDisputeForItem — fetches the dispute (if any) for a given
 * (orderId, itemId) pair from the backend mirror.
 *
 * 404 → no dispute → returns `null` (not an error). Any other
 * non-OK → throws so the consumer can render an error UI.
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/fetch-api";

export interface DisputeResponse {
  id: string;
  onchain_dispute_id: number;
  order_id: string;
  order_item_id: string;
  buyer_address: string;
  seller_address: string;
  level: "N1_Amicable" | "N2_Mediation" | "N3_Voting" | "Resolved";
  n2_mediator_address: string | null;
  refund_amount_usdt: number;
  slash_amount_usdt: number;
  favor_buyer: boolean | null;
  resolved: boolean;
  reason: string | null;
  opened_at: string;
  n1_deadline: string;
  n2_deadline: string | null;
  resolved_at: string | null;
  buyer_proposal_amount_usdt: number | null;
  seller_proposal_amount_usdt: number | null;
  vote_id: number | null;
}

export const DISPUTE_FOR_ITEM_QUERY_KEY = "dispute-for-item" as const;

export function useDisputeForItem(
  orderId: string | null | undefined,
  itemId: string | null | undefined,
) {
  return useQuery<DisputeResponse | null>({
    queryKey: [DISPUTE_FOR_ITEM_QUERY_KEY, orderId, itemId],
    enabled: !!orderId && !!itemId,
    queryFn: async () => {
      if (!orderId || !itemId) return null;
      const res = await fetchApi(
        `/disputes/by-item?order_id=${orderId}&item_id=${itemId}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Failed to load dispute: ${res.status}`);
      }
      return (await res.json()) as DisputeResponse;
    },
  });
}
