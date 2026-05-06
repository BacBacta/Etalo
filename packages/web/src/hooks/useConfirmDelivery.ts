/**
 * useConfirmDelivery — orchestrates the buyer's
 * `EtaloEscrow.confirmItemDelivery(orderId, itemId)` tx.
 * J11.5 Block 4.D.
 *
 * Mirrors `useCheckout`'s state machine (CLAUDE.md rule 8 — 4 precise
 * states : Preparing / Confirming / Success / Error). Always wraps
 * the writeContract call in `asLegacyTx()` (CLAUDE.md rule 3 — MiniPay
 * accepts legacy + CIP-64 only, never EIP-1559).
 *
 * On success, invalidates the buyer-order-detail query so the UI
 * refetches the new on-chain state without a manual reload.
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

export type ConfirmDeliveryState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "confirming"; txHash?: `0x${string}` }
  | { phase: "success"; txHash: `0x${string}` }
  | { phase: "error"; error: CheckoutError };

export interface ConfirmDeliveryRunArgs {
  orderId: bigint;
  itemId: bigint;
}

export function useConfirmDelivery() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConfirmDeliveryState>({ phase: "idle" });

  const run = useCallback(
    async ({ orderId, itemId }: ConfirmDeliveryRunArgs) => {
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
            functionName: "confirmItemDelivery",
            args: [orderId, itemId],
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
