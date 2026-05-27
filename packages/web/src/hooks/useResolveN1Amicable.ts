/**
 * useResolveN1Amicable — orchestrates the buyer/seller's
 * `EtaloDispute.resolveN1Amicable(disputeId, refundAmount)` tx.
 *
 * Either party calls this to propose a refund amount. The contract
 * stores their proposal ; when both parties have proposed the same
 * amount, it auto-resolves the dispute and emits `DisputeResolved`.
 *
 * State machine + tx wiring delegated to `useTxWriteHook`.
 */
"use client";

import disputeAbi from "@/abis/v2/EtaloDispute.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import { DISPUTE_FOR_ITEM_QUERY_KEY } from "@/hooks/useDisputeForItem";
import { N1_PROPOSAL_QUERY_KEY } from "@/hooks/useN1Proposal";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface ResolveN1AmicableRunArgs {
  disputeId: bigint;
  refundAmount: bigint;
}

export type ResolveN1AmicableState =
  TxWriteHookReturn<ResolveN1AmicableRunArgs>["state"];

export function useResolveN1Amicable(): TxWriteHookReturn<ResolveN1AmicableRunArgs> {
  return useTxWriteHook<ResolveN1AmicableRunArgs>({
    address: process.env.NEXT_PUBLIC_DISPUTE_ADDRESS,
    abi: disputeAbi as readonly unknown[],
    functionName: "resolveN1Amicable",
    buildArgs: ({ disputeId, refundAmount }) => [disputeId, refundAmount],
    // Invalidate the buyer-order-detail so the item's status pill
    // updates when the resolution lands (DisputeResolved event → item
    // status flips to Released/Refunded depending on amount).
    invalidateOnSuccess: [[BUYER_ORDER_DETAIL_QUERY_KEY]],
    // Burst : detail (item pill), dispute lookup (N1 card mounted vs
    // unmounted state), AND the chain-read N1 proposal so the
    // counterparty's amount appears immediately after the first
    // unilateral proposal lands.
    burstPollOnSuccess: {
      keys: [
        [BUYER_ORDER_DETAIL_QUERY_KEY],
        [DISPUTE_FOR_ITEM_QUERY_KEY],
        [N1_PROPOSAL_QUERY_KEY],
      ],
    },
    missingAddressMessage: "Dispute contract not configured.",
  });
}
