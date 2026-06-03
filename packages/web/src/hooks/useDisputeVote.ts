/**
 * useDisputeVote — fetches the N3 community-vote state for a dispute
 * from the backend mirror (ADR-056 endpoint `/disputes/{id}/vote`).
 *
 * Returns `null` when there is no vote (dispute still in N1 / N2). Any
 * other non-OK response throws so the consumer can fall back to a
 * neutral "awaiting indexer" state.
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/fetch-api";
import type { DisputeVoteApi } from "@/hooks/useMediatorQueue";

export const DISPUTE_VOTE_QUERY_KEY = "dispute-vote" as const;

export function useDisputeVote(disputeUuid: string | null | undefined) {
  return useQuery<DisputeVoteApi | null>({
    queryKey: [DISPUTE_VOTE_QUERY_KEY, disputeUuid],
    enabled: !!disputeUuid,
    queryFn: async () => {
      if (!disputeUuid) return null;
      const res = await fetchApi(`/disputes/${disputeUuid}/vote`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Vote fetch failed: ${res.status}`);
      }
      return (await res.json()) as DisputeVoteApi;
    },
    // Refresh every 30 s so a freshly-cast ballot or finalization
    // surfaces without a manual reload.
    refetchInterval: 30_000,
  });
}
