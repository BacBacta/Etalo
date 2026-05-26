/**
 * useN1Proposal — reads the current N1 proposal state for a dispute
 * directly from the EtaloDispute contract.
 *
 * The contract emits no event when a single party proposes (only on
 * the final `DisputeResolved` when both proposals match). So the
 * indexer can't mirror the in-progress state ; we read it fresh from
 * chain every time the dispute card mounts or invalidates.
 *
 * Returned data :
 * - `buyerAmount` / `sellerAmount` : the most recent proposal each
 *   party submitted (USDT raw, 6 decimals)
 * - `buyerProposed` / `sellerProposed` : whether each party has
 *   submitted at least one proposal
 *
 * Returns `null` until a public client + dispute address are
 * available, OR if the chain read errors (treated as "no proposal
 * yet" to keep the UI hopeful).
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Abi } from "viem";
import { usePublicClient } from "wagmi";

import disputeAbiJson from "@/abis/v2/EtaloDispute.json";

const disputeAbi = disputeAbiJson as Abi;
const DISPUTE_ADDRESS = process.env.NEXT_PUBLIC_DISPUTE_ADDRESS as
  | `0x${string}`
  | undefined;

export interface N1ProposalState {
  buyerAmount: bigint;
  sellerAmount: bigint;
  buyerProposed: boolean;
  sellerProposed: boolean;
}

export const N1_PROPOSAL_QUERY_KEY = "n1-proposal" as const;

export function useN1Proposal(disputeId: number | null | undefined) {
  const publicClient = usePublicClient();
  return useQuery<N1ProposalState | null>({
    queryKey: [N1_PROPOSAL_QUERY_KEY, disputeId],
    enabled: !!publicClient && !!DISPUTE_ADDRESS && !!disputeId,
    queryFn: async () => {
      if (!publicClient || !DISPUTE_ADDRESS || !disputeId) return null;
      const raw = (await publicClient.readContract({
        address: DISPUTE_ADDRESS,
        abi: disputeAbi,
        functionName: "getN1Proposal",
        args: [BigInt(disputeId)],
      })) as readonly [bigint, bigint, boolean, boolean];
      return {
        buyerAmount: raw[0],
        sellerAmount: raw[1],
        buyerProposed: raw[2],
        sellerProposed: raw[3],
      };
    },
    // The state only changes when a party submits a proposal tx.
    // Refetch every 15 s so the other party's proposal surfaces
    // without a manual reload.
    refetchInterval: 15_000,
  });
}
