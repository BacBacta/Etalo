/**
 * useMediatorQueue — fetches a mediator wallet's work queue from the
 * backend mirror (ADR-056).
 *
 * Returns the N2 disputes assigned to this address (the mediator console
 * acts on these) and any open N3 votes the address can weigh in on
 * (precise eligibility is enforced on-chain by submitVote).
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/fetch-api";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

export interface DisputeVoteApi {
  onchain_vote_id: number;
  onchain_dispute_id: number;
  deadline: string;
  for_buyer: number;
  for_seller: number;
  finalized: boolean;
  buyer_won: boolean | null;
  created_at: string;
}

export interface MediatorQueueApi {
  assigned_n2: DisputeResponse[];
  open_votes: DisputeVoteApi[];
}

export const MEDIATOR_QUEUE_QUERY_KEY = "mediator-queue" as const;

export function useMediatorQueue(address: string | null | undefined) {
  const lower = address?.toLowerCase() ?? null;
  return useQuery<MediatorQueueApi | null>({
    queryKey: [MEDIATOR_QUEUE_QUERY_KEY, lower],
    enabled: !!lower,
    queryFn: async () => {
      if (!lower) return null;
      const res = await fetchApi(`/mediators/${lower}/queue`);
      if (!res.ok) {
        throw new Error(`Queue fetch failed: ${res.status}`);
      }
      return (await res.json()) as MediatorQueueApi;
    },
    // Refresh every 30 s so a freshly-assigned dispute lands on the
    // mediator's screen without a manual reload.
    refetchInterval: 30_000,
  });
}
