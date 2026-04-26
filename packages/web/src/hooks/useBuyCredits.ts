/**
 * useBuyCredits — Sprint J7 Block 7b state machine for the buy-credits
 * flow. Two-tx orchestration (USDT approve when allowance is short →
 * EtaloCredits.purchaseCredits), modeled on useSequentialCheckout
 * (Block 6 J6 Étape 6.3) but flattened to a single seller equivalent.
 *
 * Phases:
 *   idle
 *   checkingAllowance     — readContract USDT.allowance
 *   approving             — wallet prompt for USDT.approve
 *   awaitingApproveReceipt
 *   purchasing            — wallet prompt for purchaseCredits
 *   awaitingPurchaseReceipt
 *   success | error | canceled
 *
 * Cancel semantics: only meaningful BEFORE the next writeContract is
 * sent. Once the user has confirmed a tx in MiniPay, we wait for the
 * receipt regardless (the chain has already accepted it). User-rejected
 * wallet prompts surface as `canceled`, contract reverts as `error`.
 */
import { useCallback, useRef, useState } from "react";
import { decodeEventLog, erc20Abi, type Abi, type Log } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import creditsAbiJson from "@/abis/v2/EtaloCredits.json";
import { classifyError } from "@/lib/checkout-orchestration";
import { USDT_PER_CREDIT } from "@/lib/contracts";

const creditsAbi = creditsAbiJson as Abi;

// Sepolia drpc can be slow; mirror useSequentialCheckout.
const TX_TIMEOUT_MS = 120_000;

export type BuyCreditsPhase =
  | "idle"
  | "checkingAllowance"
  | "approving"
  | "awaitingApproveReceipt"
  | "purchasing"
  | "awaitingPurchaseReceipt"
  | "success"
  | "error"
  | "canceled";

export interface BuyCreditsState {
  phase: BuyCreditsPhase;
  approveTxHash?: `0x${string}`;
  purchaseTxHash?: `0x${string}`;
  /** From the CreditsPurchased event on the purchase receipt. */
  purchasedCredits?: bigint;
  /** From the CreditsPurchased event on the purchase receipt. */
  usdtSpent?: bigint;
  errorMessage?: string;
}

const INITIAL_STATE: BuyCreditsState = { phase: "idle" };

/** Walk the receipt logs for the EtaloCredits CreditsPurchased event
 * and return its (creditAmount, usdtAmount, timestamp) tuple. Throws
 * if the event is absent — that means the tx confirmed but didn't
 * actually purchase, which would be an integrity bug worth surfacing. */
function decodeCreditsPurchased(logs: readonly Log[]): {
  creditAmount: bigint;
  usdtAmount: bigint;
  timestamp: bigint;
} {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: creditsAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "CreditsPurchased") {
        return decoded.args as unknown as {
          creditAmount: bigint;
          usdtAmount: bigint;
          timestamp: bigint;
        };
      }
    } catch {
      // Log emitted by another contract (or non-matching ABI entry).
    }
  }
  throw new Error("CreditsPurchased event not found in receipt");
}

export function useBuyCredits() {
  const { address: buyer } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [state, setState] = useState<BuyCreditsState>(INITIAL_STATE);

  const cancelRef = useRef(false);
  // StrictMode double-effect guard.
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    cancelRef.current = false;
    inFlightRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const start = useCallback(
    async (creditAmount: bigint) => {
      if (inFlightRef.current) return;
      if (creditAmount <= BigInt(0)) {
        setState({ phase: "error", errorMessage: "Choose at least 1 credit." });
        return;
      }
      if (!walletClient || !buyer || !publicClient) {
        setState({
          phase: "error",
          errorMessage: "Wallet not connected.",
        });
        return;
      }
      // Read contract addresses lazily so a) the prod build picks up
      // current env at first invocation and b) test stubs (vi.stubEnv)
      // can override them — module-scope reads happen at import time
      // and would freeze the test value before vitest's setup runs.
      const USDT_ADDRESS = process.env
        .NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;
      const CREDITS_ADDRESS = process.env
        .NEXT_PUBLIC_CREDITS_ADDRESS as `0x${string}` | undefined;
      if (!USDT_ADDRESS || !CREDITS_ADDRESS) {
        setState({
          phase: "error",
          errorMessage:
            "Contract addresses not configured. Set NEXT_PUBLIC_USDT_ADDRESS and NEXT_PUBLIC_CREDITS_ADDRESS.",
        });
        return;
      }

      inFlightRef.current = true;
      cancelRef.current = false;

      const usdtRequired = creditAmount * USDT_PER_CREDIT;

      try {
        // ── 1. Allowance probe ───────────────────────────────────
        setState({ phase: "checkingAllowance" });
        const currentAllowance = (await publicClient.readContract({
          address: USDT_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [buyer, CREDITS_ADDRESS],
        })) as bigint;

        if (cancelRef.current) {
          inFlightRef.current = false;
          setState({ phase: "canceled" });
          return;
        }

        // ── 2. Approve (if short) ────────────────────────────────
        if (currentAllowance < usdtRequired) {
          setState({ phase: "approving" });
          const approveTx = await walletClient.writeContract({
            address: USDT_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [CREDITS_ADDRESS, usdtRequired],
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
          setState((s) => ({
            ...s,
            phase: "canceled",
          }));
          return;
        }

        // ── 3. purchaseCredits ───────────────────────────────────
        setState((s) => ({ ...s, phase: "purchasing" }));
        const purchaseTx = await walletClient.writeContract({
          address: CREDITS_ADDRESS,
          abi: creditsAbi,
          functionName: "purchaseCredits",
          args: [creditAmount],
          type: "legacy" as const,
        });
        setState((s) => ({
          ...s,
          phase: "awaitingPurchaseReceipt",
          purchaseTxHash: purchaseTx,
        }));
        const purchaseReceipt = await publicClient.waitForTransactionReceipt({
          hash: purchaseTx,
          timeout: TX_TIMEOUT_MS,
        });
        if (purchaseReceipt.status !== "success") {
          throw new Error("Purchase transaction reverted.");
        }

        const event = decodeCreditsPurchased(purchaseReceipt.logs);

        inFlightRef.current = false;
        setState((s) => ({
          ...s,
          phase: "success",
          purchasedCredits: event.creditAmount,
          usdtSpent: event.usdtAmount,
        }));
      } catch (err) {
        inFlightRef.current = false;
        const message = classifyError(err);
        // MiniPay/MetaMask reject -> classifyError returns "Transaction
        // was cancelled." — surface as `canceled`, not `error`. The
        // dialog UI handles them differently (cancel keeps preset
        // input, error shows the specific message).
        if (message === "Transaction was cancelled.") {
          setState((s) => ({ ...s, phase: "canceled" }));
        } else {
          setState((s) => ({
            ...s,
            phase: "error",
            errorMessage: message,
          }));
        }
      }
    },
    [walletClient, buyer, publicClient],
  );

  return { state, start, cancel, reset };
}
