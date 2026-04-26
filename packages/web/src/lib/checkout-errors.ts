import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionExecutionError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";

export type CheckoutErrorCode =
  | "user_rejected"
  | "insufficient_usdt"
  | "insufficient_allowance"
  | "network"
  | "contract_revert"
  | "timeout"
  | "unknown";

export interface CheckoutError {
  code: CheckoutErrorCode;
  message: string;
  shortMessage?: string;
}

const MESSAGES: Record<CheckoutErrorCode, string> = {
  user_rejected: "You cancelled the transaction.",
  insufficient_usdt: "You don't have enough USDT in your wallet.",
  insufficient_allowance:
    "Approval didn't register. Please try again.",
  network: "Network problem. Please retry.",
  contract_revert: "The order couldn't be created.",
  timeout:
    "Transaction is taking longer than expected. Check the explorer.",
  unknown: "Something went wrong. Please try again.",
};

export function classifyCheckoutError(err: unknown): CheckoutError {
  if (err instanceof BaseError) {
    // viem wraps errors — walk the chain for the specific cause.
    const rejected = err.walk(
      (e) => e instanceof UserRejectedRequestError,
    );
    if (rejected) {
      return { code: "user_rejected", message: MESSAGES.user_rejected };
    }

    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    if (reverted) {
      const name = reverted.data?.errorName ?? "";
      if (name === "ERC20InsufficientBalance") {
        return {
          code: "insufficient_usdt",
          message: MESSAGES.insufficient_usdt,
        };
      }
      if (name === "ERC20InsufficientAllowance") {
        return {
          code: "insufficient_allowance",
          message: MESSAGES.insufficient_allowance,
        };
      }
      return {
        code: "contract_revert",
        message: MESSAGES.contract_revert,
        shortMessage: reverted.shortMessage,
      };
    }

    const timed = err.walk(
      (e) => e instanceof WaitForTransactionReceiptTimeoutError,
    );
    if (timed) {
      return { code: "timeout", message: MESSAGES.timeout };
    }

    const net = err.walk((e) => e instanceof TransactionExecutionError);
    if (net) {
      return { code: "network", message: MESSAGES.network };
    }
  }
  return { code: "unknown", message: MESSAGES.unknown };
}
