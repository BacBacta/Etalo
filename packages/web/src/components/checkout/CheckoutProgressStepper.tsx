/**
 * CheckoutProgressStepper — visual progress for the processing phase.
 *
 * The previous "Processing checkout" surface was a plain `h1` plus a
 * vertical stack of seller rows. Buyers couldn't tell where they were
 * in the overall flow ; "executing" stayed onscreen for the entire
 * approve + N×(create + fund) loop without ever rendering forward
 * motion.
 *
 * This stepper renders three semantic stages — Approve, Pay sellers,
 * Done — with the current one highlighted. The Pay-sellers step shows
 * a "k of N" sub-counter so multi-seller carts feel less opaque.
 */
"use client";

import { Check } from "@phosphor-icons/react";

import type { CheckoutPhase, SellerExecution } from "@/hooks/useSequentialCheckout";

interface Props {
  phase: CheckoutPhase;
  sellers: SellerExecution[];
  /** Whether an approve tx was needed at the start of this checkout.
   *  Carts where the buyer already has sufficient USDT allowance skip
   *  the approve step — render it as auto-completed in that case. */
  approveSkipped?: boolean;
}

interface Step {
  key: "approve" | "pay" | "done";
  label: string;
  sub?: string;
  state: "pending" | "current" | "done";
}

function buildSteps(
  phase: CheckoutPhase,
  sellers: SellerExecution[],
  approveSkipped: boolean,
): Step[] {
  const successCount = sellers.filter((s) => s.status === "success").length;
  const total = sellers.length;

  const approveState: Step["state"] =
    approveSkipped || phase !== "allowance"
      ? "done"
      : "current";
  const payState: Step["state"] =
    phase === "allowance"
      ? "pending"
      : phase === "executing"
        ? "current"
        : "done";
  const doneState: Step["state"] =
    phase === "success" || phase === "partial" ? "done" : "pending";

  return [
    {
      key: "approve",
      label: "Approve USDT",
      sub: approveSkipped ? "already approved" : "one-time per cart",
      state: approveState,
    },
    {
      key: "pay",
      label: total === 1 ? "Pay seller" : "Pay sellers",
      sub: total > 1 ? `${successCount} of ${total}` : undefined,
      state: payState,
    },
    {
      key: "done",
      label: "Done",
      state: doneState,
    },
  ];
}

export function CheckoutProgressStepper({
  phase,
  sellers,
  approveSkipped = false,
}: Props) {
  const steps = buildSteps(phase, sellers, approveSkipped);
  return (
    <ol
      data-testid="checkout-progress-stepper"
      className="flex items-center gap-2"
      aria-label="Checkout progress"
    >
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const dotClass =
          step.state === "done"
            ? "bg-celo-forest text-white dark:bg-celo-forest-bright"
            : step.state === "current"
              ? "bg-celo-yellow text-celo-dark"
              : "bg-neutral-200 text-neutral-500 dark:bg-celo-light/10 dark:text-celo-light/40";
        const labelClass =
          step.state === "current"
            ? "text-celo-dark dark:text-celo-light"
            : step.state === "done"
              ? "text-celo-forest dark:text-celo-forest-bright"
              : "text-neutral-500 dark:text-celo-light/45";
        return (
          <li
            key={step.key}
            data-testid={`checkout-step-${step.key}`}
            data-state={step.state}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <div className="flex flex-col items-center gap-1 min-w-0">
              <span
                aria-hidden
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-colors ${dotClass}`}
              >
                {step.state === "done" ? (
                  <Check className="h-4 w-4" weight="bold" />
                ) : (
                  idx + 1
                )}
              </span>
              <div className="text-center">
                <p
                  className={`text-sm font-medium leading-tight ${labelClass}`}
                >
                  {step.label}
                </p>
                {step.sub ? (
                  <p className="text-sm text-neutral-500 dark:text-celo-light/45 leading-tight">
                    {step.sub}
                  </p>
                ) : null}
              </div>
            </div>
            {!isLast ? (
              <span
                aria-hidden
                className={`mx-1 h-px flex-1 ${
                  step.state === "done"
                    ? "bg-celo-forest dark:bg-celo-forest-bright"
                    : "bg-neutral-200 dark:bg-celo-light/15"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
