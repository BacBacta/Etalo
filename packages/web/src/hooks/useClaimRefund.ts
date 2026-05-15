/**
 * useClaimRefund — orchestrates the buyer's
 * `EtaloEscrow.triggerAutoRefundIfInactive(orderId)` tx (ADR-019).
 *
 * Mirror of `useConfirmDelivery` : 4 precise tx states (CLAUDE.md
 * rule 8) + asLegacyTx wrapping (CLAUDE.md rule 3) + invalidates the
 * buyer-order-detail query on success so the UI flips to Refunded
 * without a manual reload.
 *
 * The contract function is permissionless ; the Etalo backend keeper
 * also calls it, but the buyer can self-claim trustlessly when the
 * keeper is down or absent. Buyer pays gas (~$0.05 on Celo).
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWalletClient } from "wagmi";

import escrowAbi from "@/abis/v2/EtaloEscrow.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import {
  classifyCheckoutError,
  type CheckoutError,
} from "@/lib/checkout-errors";
import { asLegacyTx } from "@/lib/tx";

const TX_TIMEOUT_MS = 90_000;
const TX_CONFIRMATIONS = 1;

export type ClaimRefundState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "confirming"; txHash?: `0x${string}` }
  | { phase: "success"; txHash: `0x${string}` }
  | { phase: "error"; error: CheckoutError };

export interface ClaimRefundRunArgs {
  orderId: bigint;
}

export function useClaimRefund() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ClaimRefundState>({ phase: "idle" });

  const run = useCallback(
    async ({ orderId }: ClaimRefundRunArgs) => {
      if (!publicClient || !walletClient) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message: "Wallet not ready. Please try again.",
          },
        });
        return;
      }

      const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
      if (!escrowAddress) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message: "Escrow contract not configured.",
          },
        });
        return;
      }

      try {
        setState({ phase: "preparing" });

        const txHash = await walletClient.writeContract(
          asLegacyTx({
            address: escrowAddress as `0x${string}`,
            abi: escrowAbi as readonly unknown[],
            functionName: "triggerAutoRefundIfInactive",
            args: [orderId],
          }),
        );

        setState({ phase: "confirming", txHash });
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: TX_CONFIRMATIONS,
          timeout: TX_TIMEOUT_MS,
        });

        await queryClient.invalidateQueries({
          queryKey: [BUYER_ORDER_DETAIL_QUERY_KEY],
        });

        setState({ phase: "success", txHash });
      } catch (err) {
        setState({ phase: "error", error: classifyCheckoutError(err) });
      }
    },
    [publicClient, walletClient, queryClient],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, reset };
}
