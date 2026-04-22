import { useCallback, useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";

import escrowAbi from "@/abis/EtaloEscrow.json";
import usdtAbi from "@/abis/MockUSDT.json";
import { apiFetch } from "@/lib/api";
import { parseOrderCreatedFromReceipt, readUsdtAllowance } from "@/lib/escrow";
import { asLegacyTx } from "@/lib/tx";
import {
  classifyCheckoutError,
  type CheckoutError,
} from "@/lib/checkout-errors";
import type { OrderInitiateResponse } from "@/hooks/useOrderInitiate";

export type CheckoutState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | {
      phase: "confirming";
      step: "approve" | "create" | "fund";
      stepNumber: 1 | 2 | 3;
      totalSteps: 2 | 3;
    }
  | {
      phase: "success";
      onchainOrderId: bigint;
      dbOrderId: string;
      txHashCreate: `0x${string}`;
      txHashFund: `0x${string}`;
    }
  | { phase: "error"; error: CheckoutError };

const TX_TIMEOUT_MS = 90_000;
const TX_CONFIRMATIONS = 1;

interface RunArgs {
  productId: string;
  initiate: OrderInitiateResponse;
}

/**
 * Orchestrates the 3-tx checkout flow and POSTs the confirmation to
 * the backend on success. Exposes a single `run()` entry point and a
 * state union consumers render from.
 *
 * Exits early if any step throws — the error is classified via
 * classifyCheckoutError so UI can show a typed message.
 */
export function useCheckout() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<CheckoutState>({ phase: "idle" });

  const run = useCallback(
    async ({ productId, initiate }: RunArgs) => {
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

      const buyer = walletClient.account.address;
      const escrow = initiate.contracts.escrow as `0x${string}`;
      const usdt = initiate.contracts.usdt as `0x${string}`;
      const seller = initiate.seller.address as `0x${string}`;
      const amountRaw = BigInt(initiate.amount_raw);
      const isCrossBorder = initiate.is_cross_border;

      try {
        setState({ phase: "preparing" });

        const allowance = await readUsdtAllowance(publicClient, {
          usdt,
          owner: buyer,
          spender: escrow,
          abi: usdtAbi as readonly unknown[],
        });
        const needsApprove = allowance < amountRaw;
        const totalSteps: 2 | 3 = needsApprove ? 3 : 2;

        // --- Step 1: approve (optional) ---------------------------
        if (needsApprove) {
          setState({
            phase: "confirming",
            step: "approve",
            stepNumber: 1,
            totalSteps,
          });
          const hash = await walletClient.writeContract(
            asLegacyTx({
              address: usdt,
              abi: usdtAbi as readonly unknown[],
              functionName: "approve",
              args: [escrow, amountRaw],
            }),
          );
          await publicClient.waitForTransactionReceipt({
            hash,
            confirmations: TX_CONFIRMATIONS,
            timeout: TX_TIMEOUT_MS,
          });
        }

        // --- Step 2: createOrder ----------------------------------
        setState({
          phase: "confirming",
          step: "create",
          stepNumber: needsApprove ? 2 : 1,
          totalSteps,
        });
        const createHash = await walletClient.writeContract(
          asLegacyTx({
            address: escrow,
            abi: escrowAbi as readonly unknown[],
            functionName: "createOrder",
            args: [seller, amountRaw, isCrossBorder],
          }),
        );
        const createReceipt = await publicClient.waitForTransactionReceipt({
          hash: createHash,
          confirmations: TX_CONFIRMATIONS,
          timeout: TX_TIMEOUT_MS,
        });
        const onchainOrderId = parseOrderCreatedFromReceipt(
          createReceipt,
          escrow,
        );

        // --- Step 3: fundOrder ------------------------------------
        setState({
          phase: "confirming",
          step: "fund",
          stepNumber: needsApprove ? 3 : 2,
          totalSteps,
        });
        const fundHash = await walletClient.writeContract(
          asLegacyTx({
            address: escrow,
            abi: escrowAbi as readonly unknown[],
            functionName: "fundOrder",
            args: [onchainOrderId],
          }),
        );
        await publicClient.waitForTransactionReceipt({
          hash: fundHash,
          confirmations: TX_CONFIRMATIONS,
          timeout: TX_TIMEOUT_MS,
        });

        // --- Sync backend -----------------------------------------
        const confirm = await apiFetch<{ id: string }>("/orders/confirm", {
          method: "POST",
          wallet: buyer,
          body: JSON.stringify({
            product_id: productId,
            onchain_order_id: Number(onchainOrderId),
            tx_hash_create: createHash,
            tx_hash_fund: fundHash,
            is_cross_border: isCrossBorder,
            amount_raw: amountRaw.toString(),
          }),
        });

        // Analytics will now reflect the new order for sellers browsing
        // their dashboard.
        queryClient.invalidateQueries({ queryKey: ["analytics"] });

        setState({
          phase: "success",
          onchainOrderId,
          dbOrderId: confirm.id,
          txHashCreate: createHash,
          txHashFund: fundHash,
        });
      } catch (err) {
        setState({ phase: "error", error: classifyCheckoutError(err) });
      }
    },
    [publicClient, walletClient, queryClient],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, reset };
}
