/**
 * OpenDisputeButton — buyer-facing UI wrapping `useOpenDispute`,
 * gated by a confirmation dialog. J11.5 Block 4.D.
 *
 * Flow :
 *   click → DialogV4 opens with reason input + brief explainer
 *   submit → useOpenDispute.run() → state machine (CLAUDE.md rule 8)
 *
 * The dialog stays mounted across phases so the buyer sees Preparing
 * / Confirming / Success / Error feedback without losing the modal
 * context. The success state offers a Close action that resets the
 * hook and the dialog.
 *
 * EtaloDispute.openDispute(orderId, itemId, reason) is invoked
 * — `reason` is sent on-chain. We trim + cap at 500 chars to match
 * a sensible UX boundary (the contract has no explicit length cap,
 * but very long strings cost gas and clutter Blockscout reads).
 */
"use client";

import { CheckCircle, Spinner, Warning } from "@phosphor-icons/react";
import { useState } from "react";

import {
  DialogV4,
  DialogV4Content,
  DialogV4Description,
  DialogV4Header,
  DialogV4Title,
  DialogV4Trigger,
} from "@/components/ui/v4/Dialog";
import { useOpenDispute } from "@/hooks/useOpenDispute";
import { cn } from "@/lib/utils";

export interface OpenDisputeButtonProps {
  orderId: bigint;
  itemId: bigint;
  itemLabel: string;
  className?: string;
}

const SECONDARY_BUTTON_CLASSES =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-pill " +
  "bg-rose-50 text-rose-700 text-sm font-medium border border-rose-200 " +
  "hover:bg-rose-100 hover:border-rose-300 " +
  "dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-900/40 dark:hover:bg-rose-900/30 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 " +
  "transition-colors duration-150";

const PRIMARY_RED_CLASSES =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-pill " +
  "bg-rose-600 text-white text-sm font-medium " +
  "hover:bg-rose-700 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "transition-colors duration-150";

const REASON_MAX = 500;

export function OpenDisputeButton({
  orderId,
  itemId,
  itemLabel,
  className,
}: OpenDisputeButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { state, run, reset } = useOpenDispute();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim().slice(0, REASON_MAX);
    if (trimmed.length === 0) return;
    void run({ orderId, itemId, reason: trimmed });
  };

  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setReason("");
    }
  };

  return (
    <DialogV4 open={open} onOpenChange={handleClose}>
      <DialogV4Trigger
        data-testid="open-dispute-trigger"
        className={cn(SECONDARY_BUTTON_CLASSES, className)}
      >
        Open dispute
      </DialogV4Trigger>
      <DialogV4Content data-testid="open-dispute-dialog">
        <DialogV4Header>
          <DialogV4Title>Open a dispute</DialogV4Title>
          <DialogV4Description>
            Disputes are resolved on-chain. Tell us briefly what went wrong
            with {itemLabel}. The seller has 48 hours to respond before
            mediation kicks in.
          </DialogV4Description>
        </DialogV4Header>

        {state.phase === "idle" || state.phase === "error" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-celo-light/80">
                What happened?
              </span>
              <textarea
                data-testid="dispute-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={4}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-dark-surface dark:bg-celo-dark-bg dark:text-celo-light"
                placeholder="The item did not match the description…"
              />
              <span className="text-sm text-slate-500 dark:text-celo-light/60">
                {reason.length}/{REASON_MAX}
              </span>
            </label>
            {state.phase === "error" && (
              <div
                role="alert"
                data-testid="open-dispute-error"
                className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-900/20 dark:text-rose-200"
              >
                <Warning size={16} weight="regular" className="mt-0.5 shrink-0" />
                <span>{state.error.message}</span>
              </div>
            )}
            <button
              type="submit"
              data-testid="open-dispute-submit"
              disabled={reason.trim().length === 0}
              className={PRIMARY_RED_CLASSES}
            >
              Open dispute
            </button>
          </form>
        ) : null}

        {(state.phase === "preparing" || state.phase === "confirming") && (
          <div
            role="status"
            aria-live="polite"
            data-testid="open-dispute-pending"
            data-phase={state.phase}
            className="flex items-center gap-2 mt-4 rounded-md bg-slate-100 px-3 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Spinner size={16} weight="regular" className="animate-spin" />
            <span>
              {state.phase === "preparing"
                ? "Preparing…"
                : "Confirming on-chain…"}
            </span>
          </div>
        )}

        {state.phase === "success" && (
          <div
            role="status"
            aria-live="polite"
            data-testid="open-dispute-success"
            className="flex flex-col gap-3 mt-4"
          >
            <div className="flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              <CheckCircle size={16} weight="fill" />
              <span>Dispute opened. The seller has been notified.</span>
            </div>
            <button
              type="button"
              onClick={() => handleClose(false)}
              className={cn(SECONDARY_BUTTON_CLASSES, "self-end")}
            >
              Close
            </button>
          </div>
        )}
      </DialogV4Content>
    </DialogV4>
  );
}
