/**
 * useBoutiqueCreationFee — ADR-059 one-time boutique creation fee.
 *
 * Two-tx orchestration modeled on useBuyCredits: USDT approve (when the
 * allowance to the billing contract is short) → EtaloBoutiqueBilling
 * .payCreationFee(). The fee is a fixed 1 USDT (BOUTIQUE_CREATION_FEE),
 * so there's no amount input. One-shot per wallet on-chain — a wallet
 * that already paid reverts "Already paid", surfaced as an error.
 *
 * Legacy tx only (CLAUDE.md rule #3). Tx states map to the rule #8
 * Preparing / Confirming / Success / Error contract.
 */
import { useCallback, useRef, useState } from "react";
import { erc20Abi, type Abi } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import billingAbiJson from "@/abis/v2/EtaloBoutiqueBilling.json";
import { classifyError } from "@/lib/checkout-orchestration";
import { BOUTIQUE_CREATION_FEE } from "@/lib/contracts";

const billingAbi = billingAbiJson as Abi;

// Sepolia drpc can be slow; mirror useBuyCredits.
const TX_TIMEOUT_MS = 120_000;

export type CreationFeePhase =
  | "idle"
  | "checkingAllowance"
  | "approving"
  | "awaitingApproveReceipt"
  | "paying"
  | "awaitingPayReceipt"
  | "success"
  | "error"
  | "canceled";

export interface CreationFeeState {
  phase: CreationFeePhase;
  approveTxHash?: `0x${string}`;
  payTxHash?: `0x${string}`;
  errorMessage?: string;
}

const INITIAL_STATE: CreationFeeState = { phase: "idle" };

export function useBoutiqueCreationFee() {
  const { address: seller } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [state, setState] = useState<CreationFeeState>(INITIAL_STATE);

  const cancelRef = useRef(false);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    cancelRef.current = false;
    inFlightRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /** Runs approve (if needed) + payCreationFee. Resolves true on a
   * confirmed payment, false otherwise (caller checks state.phase for
   * the precise outcome). */
  const pay = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    if (!walletClient || !seller || !publicClient) {
      setState({ phase: "error", errorMessage: "Wallet not connected." });
      return false;
    }
    // Read addresses lazily so prod env + test stubEnv both resolve.
    const USDT_ADDRESS = process.env
      .NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;
    const BILLING_ADDRESS = process.env
      .NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS as `0x${string}` | undefined;
    if (!USDT_ADDRESS || !BILLING_ADDRESS) {
      setState({
        phase: "error",
        errorMessage:
          "Contract addresses not configured. Set NEXT_PUBLIC_USDT_ADDRESS and NEXT_PUBLIC_BOUTIQUE_BILLING_ADDRESS.",
      });
      return false;
    }

    inFlightRef.current = true;
    cancelRef.current = false;

    try {
      // ── 1. Allowance probe ──────────────────────────────────
      setState({ phase: "checkingAllowance" });
      const currentAllowance = (await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [seller, BILLING_ADDRESS],
      })) as bigint;

      if (cancelRef.current) {
        inFlightRef.current = false;
        setState({ phase: "canceled" });
        return false;
      }

      // ── 2. Approve (if short) ───────────────────────────────
      if (currentAllowance < BOUTIQUE_CREATION_FEE) {
        setState({ phase: "approving" });
        const approveTx = await walletClient.writeContract({
          address: USDT_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [BILLING_ADDRESS, BOUTIQUE_CREATION_FEE],
          type: "legacy" as const,
        });
        setState({ phase: "awaitingApproveReceipt", approveTxHash: approveTx });
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveTx,
          timeout: TX_TIMEOUT_MS,
        });
        if (approveReceipt.status !== "success") {
          throw new Error("Approve transaction reverted.");
        }
      }

      if (cancelRef.current) {
        inFlightRef.current = false;
        setState((s) => ({ ...s, phase: "canceled" }));
        return false;
      }

      // ── 3. payCreationFee ───────────────────────────────────
      setState((s) => ({ ...s, phase: "paying" }));
      const payTx = await walletClient.writeContract({
        address: BILLING_ADDRESS,
        abi: billingAbi,
        functionName: "payCreationFee",
        args: [],
        type: "legacy" as const,
      });
      setState((s) => ({ ...s, phase: "awaitingPayReceipt", payTxHash: payTx }));
      const payReceipt = await publicClient.waitForTransactionReceipt({
        hash: payTx,
        timeout: TX_TIMEOUT_MS,
      });
      if (payReceipt.status !== "success") {
        throw new Error("Payment transaction reverted.");
      }

      inFlightRef.current = false;
      setState((s) => ({ ...s, phase: "success" }));
      return true;
    } catch (err) {
      inFlightRef.current = false;
      const message = classifyError(err);
      if (message === "Transaction was cancelled.") {
        setState((s) => ({ ...s, phase: "canceled" }));
      } else {
        setState((s) => ({ ...s, phase: "error", errorMessage: message }));
      }
      return false;
    }
  }, [walletClient, seller, publicClient]);

  return { state, pay, cancel, reset };
}
