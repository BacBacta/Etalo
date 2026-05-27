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

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import {
  classifyCheckoutError,
  type CheckoutError,
} from "@/lib/checkout-errors";
import { etaloChain } from "@/lib/chain";
import { asTxOptions } from "@/lib/tx";
import { useResolvedWalletClient } from "./useResolvedWalletClient";

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
   * After the initial success-time invalidation, keep re-invalidating
   * the given keys at `intervalMs` for `durationMs` total. Bridges the
   * 0-30 s indexer lag : the chain-mirror tables don't reflect the new
   * state immediately after our tx confirms, so a single invalidate
   * refetches stale data. The burst keeps refetching until the indexer
   * catches up, then the regular staleTime/refetchInterval takes over.
   *
   * Defaults : intervalMs 5_000, durationMs 30_000.
   */
  burstPollOnSuccess?: {
    keys: readonly QueryKey[];
    intervalMs?: number;
    durationMs?: number;
  };
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
  const { resolve: resolveWalletClient } = useResolvedWalletClient();
  const { address } = useAccount();
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

  // Track the active burst-poll interval so we can cancel it on
  // unmount or when a new run kicks off (avoids stacking intervals
  // when the consumer fires several txs in quick succession).
  const burstTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelBurst = useCallback(() => {
    if (burstTimerRef.current !== null) {
      clearInterval(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  }, []);
  useEffect(() => cancelBurst, [cancelBurst]);

  const run = useCallback(
    async (runArgs: TArgs) => {
      const opts = optsRef.current;
      // A new run kicks off : cancel any burst still firing from the
      // previous tx so we don't pile intervals.
      cancelBurst();

      if (!publicClient) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message: "Wallet not ready. Please try again.",
          },
        });
        return;
      }

      if (chainId !== etaloChain.id) {
        // Defense in depth — pages that wrap actions in a
        // ChainMismatchBanner already prevent the click visually,
        // but a wallet that flips chains mid-session would still hit
        // viem's `current chain … does not match …` revert at
        // writeContract time. Surface a clean error instead.
        setState({
          phase: "error",
          error: {
            code: "network",
            message: `Wrong network. Switch your wallet to ${etaloChain.name}.`,
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

      // Resolve walletClient async so we survive the wagmi-MiniPay
      // race where useWalletClient().data is still undefined at click
      // time (the J12 mainnet smoke bug).
      const walletClient = await resolveWalletClient();
      if (!walletClient) {
        setState({
          phase: "error",
          error: {
            code: "network",
            message: "Wallet not ready. Please try again.",
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
              chain: etaloChain,
              account: walletClient.account ?? (address as `0x${string}`),
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

        // Burst polling : repeatedly invalidate the configured keys
        // for `durationMs` to absorb the indexer lag between our tx
        // landing and the mirror tables catching up. The first
        // invalidation also runs here so a caller that uses ONLY
        // burstPollOnSuccess (no invalidateOnSuccess) still gets an
        // immediate refresh kick.
        const burst = opts.burstPollOnSuccess;
        if (burst && burst.keys.length > 0) {
          const intervalMs = burst.intervalMs ?? 5_000;
          const durationMs = burst.durationMs ?? 30_000;
          for (const key of burst.keys) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
          let elapsed = 0;
          burstTimerRef.current = setInterval(() => {
            elapsed += intervalMs;
            for (const key of burst.keys) {
              void queryClient.invalidateQueries({ queryKey: key });
            }
            if (elapsed >= durationMs) {
              cancelBurst();
            }
          }, intervalMs);
        }

        setState({ phase: "success", txHash });
      } catch (err) {
        setState({ phase: "error", error: classifyCheckoutError(err) });
      }
    },
    [publicClient, resolveWalletClient, address, queryClient, chainId, cancelBurst],
  );

  const reset = useCallback(() => {
    cancelBurst();
    setState({ phase: "idle" });
  }, [cancelBurst]);

  return { state, run, reset };
}
