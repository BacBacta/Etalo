/**
 * useSubmitVote — casts a ballot in an N3 community vote.
 *
 * Calls EtaloVoting.submitVote(voteId, favorBuyer). Only eligible
 * mediator-voters can call this (the contract gates on
 * `_eligibility[voteId][msg.sender]`). The on-chain check is
 * authoritative ; the UI hides the buttons when useHasVoted returns
 * true, but the contract rejects duplicates either way.
 */
"use client";

import votingAbi from "@/abis/v2/EtaloVoting.json";
import { DISPUTE_VOTE_QUERY_KEY } from "@/hooks/useDisputeVote";
import { MEDIATOR_QUEUE_QUERY_KEY } from "@/hooks/useMediatorQueue";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface SubmitVoteRunArgs {
  voteId: bigint;
  favorBuyer: boolean;
}

export function useSubmitVote(): TxWriteHookReturn<SubmitVoteRunArgs> {
  return useTxWriteHook<SubmitVoteRunArgs>({
    address: process.env.NEXT_PUBLIC_VOTING_ADDRESS,
    abi: votingAbi as readonly unknown[],
    functionName: "submitVote",
    buildArgs: ({ voteId, favorBuyer }) => [voteId, favorBuyer],
    invalidateOnSuccess: [
      [DISPUTE_VOTE_QUERY_KEY],
      [MEDIATOR_QUEUE_QUERY_KEY],
    ],
    burstPollOnSuccess: {
      keys: [[DISPUTE_VOTE_QUERY_KEY], [MEDIATOR_QUEUE_QUERY_KEY]],
    },
    missingAddressMessage: "Voting contract not configured.",
  });
}
