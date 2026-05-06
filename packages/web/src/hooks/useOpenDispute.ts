/**
 * useOpenDispute — orchestrates the buyer's
 * `EtaloDispute.openDispute(orderId, itemId, reason)` tx.
 * J11.5 Block 4.D.
 *
 * Mirrors useConfirmDelivery's state machine (CLAUDE.md rule 8). The
 * `reason` string is sent on-chain — buyer-supplied via the dispute
 * confirmation modal. Backend ADR-042 funded-state guard rejects
 * unfunded orders, so the UI must already gate the button on
 * `isPostFund`.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWalletClient } from "wagmi";

import disputeAbi from "@/abis/v2/EtaloDispute.json";
import { BUYER_ORDER_DETAIL_QUERY_KEY } from "@/hooks/useBuyerOrderDetail";
import {
  classifyCheckoutError,
  type CheckoutError,
} from "@/lib/checkout-errors";
import { asLegacyTx } from "@/lib/tx";

const TX_TIMEOUT_MS = 90_000;
const TX_CONFIRMATIONS = 1;

export type OpenDisputeState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "confirming"; txHash?: `0x${string}` }
  | { phase: "success"; txHash: `0x${string}` }
  | { phase: "error"; error: CheckoutError };

export interface OpenDisputeRunArgs {
  orderId: bigint;
  itemId: bigint;
  reason: string;
}

export function useOpenDispute() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<OpenDisputeState>({ phase: "idle" });

  const run = useCallback(
    async ({ orderId, itemId, reason }: OpenDisputeRunArgs) => {
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

      const disputeAddress = process.env.NEXT_PUBLIC_DISPUTE_ADDRESS;
      if (!disputeAddress) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message: "Dispute contract not configured.",
          },
        });
        return;
      }

      try {
        setState({ phase: "preparing" });

        const txHash = await walletClient.writeContract(
          asLegacyTx({
            address: disputeAddress as `0x${string}`,
            abi: disputeAbi as readonly unknown[],
            functionName: "openDispute",
            args: [orderId, itemId, reason],
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
