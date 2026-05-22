/**
 * useClaimRefund — orchestrates the buyer's
 * `EtaloEscrow.triggerAutoRefundIfInactive(orderId)` tx (ADR-019).
 *
 * The contract function is permissionless ; the Etalo backend keeper
 * also calls it, but the buyer can self-claim trustlessly when the
 * keeper is down or absent. Buyer pays gas (sub-cent on Celo mainnet
 * via CIP-64 USDT fee abstraction).
 *
 * State machine + tx wiring delegated to `useTxWriteHook` — see the
 * matching hooks `useConfirmDelivery` + `useOpenDispute` for the
 * other two consumers of the same generic.
 */
"use client";

import escrowAbi from "@/abis/v2/EtaloEscrow.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import {
  useTxWriteHook,
  type TxWriteHookReturn,
} from "@/hooks/useTxWriteHook";

export interface ClaimRefundRunArgs {
  orderId: bigint;
}

export type ClaimRefundState = TxWriteHookReturn<ClaimRefundRunArgs>["state"];

export function useClaimRefund(): TxWriteHookReturn<ClaimRefundRunArgs> {
  return useTxWriteHook<ClaimRefundRunArgs>({
    address: process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
    abi: escrowAbi as readonly unknown[],
    functionName: "triggerAutoRefundIfInactive",
    buildArgs: ({ orderId }) => [orderId],
    invalidateOnSuccess: [[BUYER_ORDER_DETAIL_QUERY_KEY]],
    missingAddressMessage: "Escrow contract not configured.",
  });
}
