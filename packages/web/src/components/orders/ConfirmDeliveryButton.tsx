/**
 * ConfirmDeliveryButton — buyer-facing UI wrapping
 * `useConfirmDelivery`. J11.5 Block 4.D.
 *
 * Renders the 4 CLAUDE.md rule-8 transaction states inline (Preparing
 * / Confirming / Success / Error). The orchestrator (BuyerOrderActions)
 * decides whether to show this button at all based on eligible_actions
 * — when shown, we always allow the click.
 *
 * Uses `useConfirmDelivery` which invalidates the buyer-order-detail
 * cache on success ; the parent page re-renders with the new state
 * (item flips Shipped → Released, total → Completed when all items
 * released).
 */
"use client";

import { CheckCircle, Spinner, Warning } from "@phosphor-icons/react";
import { useRef } from "react";

import { useConfirmDelivery } from "@/hooks/useConfirmDelivery";
import { cn } from "@/lib/utils";

export interface ConfirmDeliveryButtonProps {
  /** On-chain order id (uint256). */
  orderId: bigint;
  /** On-chain item id (uint256). The order may have many items ; the
   *  parent picks which one to confirm. */
  itemId: bigint;
  /** Human label for the item ("Item #1") used in the success state. */
  itemLabel: string;
  className?: string;
}

const PRIMARY_CLASSES =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-pill " +
  "bg-celo-forest text-celo-light text-sm font-medium " +
  "hover:bg-celo-forest-dark dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "transition-colors duration-150";

export function ConfirmDeliveryButton({
  orderId,
  itemId,
  itemLabel,
  className,
}: ConfirmDeliveryButtonProps) {
  const { state, run, reset } = useConfirmDelivery();
  // Spam-click guard : React batches the state update from `run()` into
  // the next render, so two synchronous click events can both pass the
  // phase=idle check before the first re-render commits → two
  // walletClient.writeContract calls → two MetaMask popups. The ref
  // gate stays current within the same tick.
  const inFlight = useRef(false);
  const triggerRun = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      reset();
      await run({ orderId, itemId });
    } finally {
      inFlight.current = false;
    }
  };

  if (state.phase === "preparing" || state.phase === "confirming") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="confirm-delivery-pending"
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
        data-testid="confirm-delivery-success"
        className={cn(
          "inline-flex items-center gap-2 min-h-[44px] px-5 rounded-pill",
          "bg-emerald-100 text-emerald-800 text-sm font-medium",
          "dark:bg-emerald-900/40 dark:text-emerald-200",
          className,
        )}
      >
        <CheckCircle size={16} weight="fill" />
        <span>Delivery confirmed for {itemLabel}</span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        data-testid="confirm-delivery-error"
        className={cn("flex flex-col gap-2", className)}
      >
        <div className="flex items-center gap-2 text-sm text-rose-800 dark:text-rose-200">
          <Warning size={16} weight="regular" />
          <span>{state.error.message}</span>
        </div>
        <button
          type="button"
          onClick={() => void triggerRun()}
          className={PRIMARY_CLASSES}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="confirm-delivery-button"
      data-item-id={String(itemId)}
      onClick={() => void triggerRun()}
      className={cn(PRIMARY_CLASSES, className)}
    >
      Confirm delivery for {itemLabel}
    </button>
  );
}
