/**
 * useFinalizeVote — closes an N3 vote once its deadline has elapsed.
 *
 * Calls EtaloVoting.finalizeVote(voteId). This is permissionless
 * (anyone can call it post-deadline), so both mediators and the
 * broader ecosystem can trigger resolution. The contract rejects
 * the call if the vote period is still open or already finalized.
 */
"use client";

import votingAbi from "@/abis/v2/EtaloVoting.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import { DISPUTE_FOR_ITEM_QUERY_KEY } from "@/hooks/useDisputeForItem";
import { DISPUTE_VOTE_QUERY_KEY } from "@/hooks/useDisputeVote";
import { MEDIATOR_QUEUE_QUERY_KEY } from "@/hooks/useMediatorQueue";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface FinalizeVoteRunArgs {
  voteId: bigint;
}

export function useFinalizeVote(): TxWriteHookReturn<FinalizeVoteRunArgs> {
  return useTxWriteHook<FinalizeVoteRunArgs>({
    address: process.env.NEXT_PUBLIC_VOTING_ADDRESS,
    abi: votingAbi as readonly unknown[],
    functionName: "finalizeVote",
    buildArgs: ({ voteId }) => [voteId],
    // After finalization the dispute closes: refresh the vote mirror,
    // the mediator queue, and both parties' order/dispute views.
    invalidateOnSuccess: [
      [DISPUTE_VOTE_QUERY_KEY],
      [MEDIATOR_QUEUE_QUERY_KEY],
      [BUYER_ORDER_DETAIL_QUERY_KEY],
    ],
    burstPollOnSuccess: {
      keys: [
        [DISPUTE_VOTE_QUERY_KEY],
        [MEDIATOR_QUEUE_QUERY_KEY],
        [BUYER_ORDER_DETAIL_QUERY_KEY],
        [DISPUTE_FOR_ITEM_QUERY_KEY],
      ],
    },
    missingAddressMessage: "Voting contract not configured.",
  });
}
