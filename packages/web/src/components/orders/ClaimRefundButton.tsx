/**
 * ClaimRefundButton — buyer-facing UI wrapping `useClaimRefund`.
 *
 * Shown by `BuyerOrderActions` when `eligibleActions.canClaimRefund`
 * is true (order Funded, past 7-day intra deadline, no item disputed).
 * Mirrors the 4 CLAUDE.md rule-8 transaction states (Preparing /
 * Confirming / Success / Error). Buyer pays gas (~$0.05 Celo) — kept
 * as a trustless escape hatch ; the Etalo backend keeper does it
 * automatically when running.
 */
"use client";

import { ArrowCounterClockwise, CheckCircle, Spinner, Warning } from "@phosphor-icons/react";

import { useClaimRefund } from "@/hooks/useClaimRefund";
import { cn } from "@/lib/utils";

export interface ClaimRefundButtonProps {
  /** On-chain order id (uint256). */
  orderId: bigint;
  className?: string;
}

const PRIMARY_CLASSES =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-pill " +
  "bg-celo-forest text-celo-light text-sm font-medium " +
  "hover:bg-celo-forest-dark dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "transition-colors duration-150";

export function ClaimRefundButton({ orderId, className }: ClaimRefundButtonProps) {
  const { state, run, reset } = useClaimRefund();

  if (state.phase === "preparing" || state.phase === "confirming") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="claim-refund-pending"
        data-phase={state.phase}
        className={cn(
          "inline-flex items-center gap-2 min-h-[44px] px-5 rounded-pill",
          "bg-slate-100 text-slate-700 text-sm font-medium",
          "dark:bg-slate-800 dark:text-slate-200",
          className,
        )}
      >
        <Spinner size={16} weight="regular" className="animate-spin" />
        <span>
          {state.phase === "preparing" ? "Preparing…" : "Confirming on-chain…"}
        </span>
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="claim-refund-success"
        className={cn(
          "inline-flex items-center gap-2 min-h-[44px] px-5 rounded-pill",
          "bg-emerald-100 text-emerald-800 text-sm font-medium",
          "dark:bg-emerald-900/40 dark:text-emerald-200",
          className,
        )}
      >
        <CheckCircle size={16} weight="fill" />
        <span>Refund sent — your USDT is back in your wallet.</span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        data-testid="claim-refund-error"
        className={cn("flex flex-col gap-2", className)}
      >
        <div className="flex items-center gap-2 text-sm text-rose-800 dark:text-rose-200">
          <Warning size={16} weight="regular" />
          <span>{state.error.message}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            void run({ orderId });
          }}
          className={PRIMARY_CLASSES}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-sm text-slate-700 dark:text-celo-light/70">
        The seller hasn’t shipped within 7 days. You can claim your USDT
        refund — funds return to your wallet immediately.
      </p>
      <button
        type="button"
        data-testid="claim-refund-button"
        data-order-id={String(orderId)}
        onClick={() => void run({ orderId })}
        className={PRIMARY_CLASSES}
      >
        <ArrowCounterClockwise size={16} weight="regular" aria-hidden="true" />
        Claim refund
      </button>
    </div>
  );
}
