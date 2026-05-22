/**
 * useConfirmDelivery — orchestrates the buyer's
 * `EtaloEscrow.confirmItemDelivery(orderId, itemId)` tx.
 *
 * State machine + tx wiring delegated to `useTxWriteHook` — see the
 * matching hooks `useClaimRefund` + `useOpenDispute` for the other
 * two consumers of the same generic.
 */
"use client";

import escrowAbi from "@/abis/v2/EtaloEscrow.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface ConfirmDeliveryRunArgs {
  orderId: bigint;
  itemId: bigint;
}

export type ConfirmDeliveryState =
  TxWriteHookReturn<ConfirmDeliveryRunArgs>["state"];

export function useConfirmDelivery(): TxWriteHookReturn<ConfirmDeliveryRunArgs> {
  return useTxWriteHook<ConfirmDeliveryRunArgs>({
    address: process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
    abi: escrowAbi as readonly unknown[],
    functionName: "confirmItemDelivery",
    buildArgs: ({ orderId, itemId }) => [orderId, itemId],
    invalidateOnSuccess: [[BUYER_ORDER_DETAIL_QUERY_KEY]],
    missingAddressMessage: "Escrow contract not configured.",
  });
}
