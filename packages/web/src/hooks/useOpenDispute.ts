/**
 * useOpenDispute — orchestrates the buyer's
 * `EtaloDispute.openDispute(orderId, itemId, reason)` tx.
 *
 * State machine + tx wiring delegated to `useTxWriteHook` — see the
 * matching hooks `useConfirmDelivery` + `useClaimRefund` for the
 * other two consumers of the same generic.
 *
 * NOTE : full N2 mediator UI + N3 community-vote UI are deferred
 * V1.5+ (contracts deployed Sepolia, UI pending) — this hook only
 * fires the initial N1 dispute trigger.
 */
"use client";

import disputeAbi from "@/abis/v2/EtaloDispute.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface OpenDisputeRunArgs {
  orderId: bigint;
  itemId: bigint;
  reason: string;
}

export type OpenDisputeState = TxWriteHookReturn<OpenDisputeRunArgs>["state"];

export function useOpenDispute(): TxWriteHookReturn<OpenDisputeRunArgs> {
  return useTxWriteHook<OpenDisputeRunArgs>({
    address: process.env.NEXT_PUBLIC_DISPUTE_ADDRESS,
    abi: disputeAbi as readonly unknown[],
    functionName: "openDispute",
    buildArgs: ({ orderId, itemId, reason }) => [orderId, itemId, reason],
    invalidateOnSuccess: [[BUYER_ORDER_DETAIL_QUERY_KEY]],
    missingAddressMessage: "Dispute contract not configured.",
  });
}
