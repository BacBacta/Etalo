/**
 * useEscalateToMediation — orchestrates the buyer's
 * `EtaloDispute.escalateToMediation(disputeId)` tx.
 *
 * Pushes a stalled N1 amicable dispute to N2 (assigned mediator). The
 * contract allows the buyer to call this any time, and ANYONE once the
 * 48 h N1 deadline has elapsed (permissionless) — the UI surfaces it to
 * the buyer post-deadline, aligned with the "seller has 48 h before
 * mediation" messaging.
 *
 * State machine + tx wiring delegated to `useTxWriteHook` (same pattern
 * as useResolveN1Amicable).
 */
"use client";

import disputeAbi from "@/abis/v2/EtaloDispute.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import { DISPUTE_FOR_ITEM_QUERY_KEY } from "@/hooks/useDisputeForItem";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface EscalateToMediationRunArgs {
  disputeId: bigint;
}

export type EscalateToMediationState =
  TxWriteHookReturn<EscalateToMediationRunArgs>["state"];

export function useEscalateToMediation(): TxWriteHookReturn<EscalateToMediationRunArgs> {
  return useTxWriteHook<EscalateToMediationRunArgs>({
    address: process.env.NEXT_PUBLIC_DISPUTE_ADDRESS,
    abi: disputeAbi as readonly unknown[],
    functionName: "escalateToMediation",
    buildArgs: ({ disputeId }) => [disputeId],
    // Refresh the buyer order detail (item pill) + the dispute lookup so
    // the card re-renders. Once the indexer processes DisputeEscalated,
    // `dispute.level` flips to N2 and the N1 card yields to the
    // escalated-state branch.
    invalidateOnSuccess: [[BUYER_ORDER_DETAIL_QUERY_KEY]],
    burstPollOnSuccess: {
      keys: [[BUYER_ORDER_DETAIL_QUERY_KEY], [DISPUTE_FOR_ITEM_QUERY_KEY]],
    },
    missingAddressMessage: "Dispute contract not configured.",
  });
}
