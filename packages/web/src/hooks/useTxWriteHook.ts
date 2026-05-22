/**
 * useTxWriteHook — generic state machine for write-contract calls.
 *
 * Replaces the 90 %-identical bodies of useConfirmDelivery,
 * useClaimRefund, and useOpenDispute. Each of those was ~110 lines
 * of the same shape :
 *
 *   1. Read publicClient / walletClient / queryClient / chainId
 *   2. State machine : idle → preparing → confirming → success / error
 *   3. Guard : if wallet not ready, fail fast with a friendly message
 *   4. Guard : if env-var contract address missing, fail fast
 *   5. asTxOptions(...) wrap (CIP-64 / legacy decision per chain)
 *   6. waitForTransactionReceipt with TX_TIMEOUT_MS / TX_CONFIRMATIONS
 *   7. queryClient.invalidateQueries(...) for the affected queries
 *   8. setState("success") with the tx hash
 *
 * Only the (abi, functionName, args, invalidate keys) tuple varies.
 *
 * Design notes :
 * - Options live in a ref so the `run` callback stays referentially
 *   stable across re-renders. Consumers don't need to memo their
 *   config to avoid retriggering effects.
 * - `buildArgs(runArgs)` lets each consumer keep its own args type
 *   (orderId only, orderId+itemId, orderId+itemId+reason, etc.)
 *   without leaking through a wider any-type.
 * - Returns the same `{ state, run, reset }` shape as the old hooks
 *   so consumer UI components migrate without touching their
 *   render path.
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useChainId, usePublicClient, useWalletClient } from "wagmi";

import {
  classifyCheckoutError,
  type CheckoutError,
} from "@/lib/checkout-errors";
import { asTxOptions } from "@/lib/tx";

const TX_TIMEOUT_MS = 90_000;
const TX_CONFIRMATIONS = 1;

export type TxWriteState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "confirming"; txHash?: `0x${string}` }
  | { phase: "success"; txHash: `0x${string}` }
  | { phase: "error"; error: CheckoutError };

export interface TxWriteOptions<TArgs> {
  /**
   * Contract address. `undefined` triggers a friendly "Contract not
   * configured" error — typically passed from
   * `process.env.NEXT_PUBLIC_ESCROW_ADDRESS` which can legitimately
   * be unset in some dev environments.
   */
  address: `0x${string}` | string | undefined;
  abi: readonly unknown[];
  functionName: string;
  /**
   * Build the contract args tuple from the runtime input. Each
   * consumer's runArgs type stays private to the consumer.
   */
  buildArgs: (runArgs: TArgs) => readonly unknown[];
  /**
   * Query keys to invalidate on success. Multiple keys supported
   * (e.g. invalidate both the detail query AND a list query).
   */
  invalidateOnSuccess?: readonly QueryKey[];
  /**
   * Friendly error message if the contract address env var is
   * missing. Defaults to "Contract not configured."
   */
  missingAddressMessage?: string;
}

export interface TxWriteHookReturn<TArgs> {
  state: TxWriteState;
  run: (runArgs: TArgs) => Promise<void>;
  reset: () => void;
}

export function useTxWriteHook<TArgs>(
  options: TxWriteOptions<TArgs>,
): TxWriteHookReturn<TArgs> {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const [state, setState] = useState<TxWriteState>({ phase: "idle" });

  // Capture the latest options in a ref so the `run` callback below
  // doesn't re-create on every render of the consumer. Without this,
  // any consumer passing an inline buildArgs / invalidateOnSuccess
  // would invalidate `run`'s identity every render and break the
  // typical "useEffect(() => { ... }, [run])" pattern downstream.
  const optsRef = useRef(options);
  optsRef.current = options;

  const run = useCallback(
    async (runArgs: TArgs) => {
      const opts = optsRef.current;

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

      if (!opts.address) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message:
              opts.missingAddressMessage ?? "Contract not configured.",
          },
        });
        return;
      }

      try {
        setState({ phase: "preparing" });

        const txHash = await walletClient.writeContract(
          asTxOptions(
            {
              address: opts.address as `0x${string}`,
              abi: opts.abi,
              functionName: opts.functionName,
              args: opts.buildArgs(runArgs),
            },
            { chainId },
          ),
        );

        setState({ phase: "confirming", txHash });
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: TX_CONFIRMATIONS,
          timeout: TX_TIMEOUT_MS,
        });

        if (opts.invalidateOnSuccess) {
          for (const key of opts.invalidateOnSuccess) {
            await queryClient.invalidateQueries({ queryKey: key });
          }
        }

        setState({ phase: "success", txHash });
      } catch (err) {
        setState({ phase: "error", error: classifyCheckoutError(err) });
      }
    },
    [publicClient, walletClient, queryClient, chainId],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, reset };
}
