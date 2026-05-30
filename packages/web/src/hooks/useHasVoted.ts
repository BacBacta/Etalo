/**
 * useHasVoted — checks if the connected wallet has already voted in a
 * given N3 community-vote session.
 *
 * Reads EtaloVoting.hasVoted(voteId, voter) on-chain. Used to disable
 * the vote buttons once the mediator has cast their ballot.
 */
"use client";

import { useReadContract } from "wagmi";

import votingAbi from "@/abis/v2/EtaloVoting.json";

export function useHasVoted(
  voteId: number | null | undefined,
  address: string | null | undefined,
) {
  const votingAddress = process.env.NEXT_PUBLIC_VOTING_ADDRESS as
    | `0x${string}`
    | undefined;

  return useReadContract({
    address: votingAddress,
    abi: votingAbi as readonly unknown[],
    functionName: "hasVoted",
    args:
      voteId != null && address
        ? [BigInt(voteId), address as `0x${string}`]
        : undefined,
    query: {
      enabled: voteId != null && !!address && !!votingAddress,
    },
  });
}
