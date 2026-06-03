/**
 * useResolveN2Mediation — the assigned mediator's
 * `EtaloDispute.resolveN2Mediation(disputeId, refundAmount, slashAmount)` tx.
 *
 * Called from the wallet of the address the Safe assigned as N2 mediator
 * (onlyAssignedMediator on-chain). The refund is taken from the remaining
 * escrow on the item ; the slash hits the seller's stake. Both are raw
 * 6-decimal USDT bigints — the form is responsible for parsing user input.
 *
 * State machine + tx wiring delegated to `useTxWriteHook` (same pattern
 * as useResolveN1Amicable / useEscalateToMediation).
 */
"use client";

import disputeAbi from "@/abis/v2/EtaloDispute.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import { DISPUTE_FOR_ITEM_QUERY_KEY } from "@/hooks/useDisputeForItem";
import { MEDIATOR_QUEUE_QUERY_KEY } from "@/hooks/useMediatorQueue";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface ResolveN2MediationRunArgs {
  disputeId: bigint;
  refundAmount: bigint;
  slashAmount: bigint;
}

export type ResolveN2MediationState =
  TxWriteHookReturn<ResolveN2MediationRunArgs>["state"];

export function useResolveN2Mediation(): TxWriteHookReturn<ResolveN2MediationRunArgs> {
  return useTxWriteHook<ResolveN2MediationRunArgs>({
    address: process.env.NEXT_PUBLIC_DISPUTE_ADDRESS,
    abi: disputeAbi as readonly unknown[],
    functionName: "resolveN2Mediation",
    buildArgs: ({ disputeId, refundAmount, slashAmount }) => [
      disputeId,
      refundAmount,
      slashAmount,
    ],
    invalidateOnSuccess: [[MEDIATOR_QUEUE_QUERY_KEY]],
    // The mediator's own queue refreshes (dispute disappears once
    // resolved), and both parties' dispute lookups + the buyer order
    // detail flip via the existing ItemDisputeResolved/DisputeResolved
    // indexer path (PR A of the diagnostic fixes).
    burstPollOnSuccess: {
      keys: [
        [MEDIATOR_QUEUE_QUERY_KEY],
        [BUYER_ORDER_DETAIL_QUERY_KEY],
        [DISPUTE_FOR_ITEM_QUERY_KEY],
      ],
    },
    missingAddressMessage: "Dispute contract not configured.",
  });
}
