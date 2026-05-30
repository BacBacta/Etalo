"use client";

import { CheckCircle, Scales, Spinner } from "@phosphor-icons/react";
import { useState } from "react";

import { DeadlineCountdown } from "@/components/orders/AutoReleaseTimer";
import {
  ChainMismatchBanner,
  useChainMatch,
} from "@/components/wallet/ChainMismatchBanner";
import { useResolveN2Mediation } from "@/hooks/useResolveN2Mediation";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

const USDT_SCALE = BigInt(1_000_000);

function rawFromHuman(human: string): bigint | null {
  if (!/^\d+(\.\d{0,6})?$/.test(human.trim())) return null;
  const [intPart, fracPart = ""] = human.trim().split(".");
  const fracPadded = (fracPart + "000000").slice(0, 6);
  try {
    return BigInt(intPart) * USDT_SCALE + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

export function N2ResolutionForm({ dispute }: { dispute: DisputeResponse }) {
  const { isMatch: chainMatches } = useChainMatch();
  const tx = useResolveN2Mediation();

  const [refundInput, setRefundInput] = useState<string>("0");
  const [penaltyInput, setPenaltyInput] = useState<string>("0");

  const refundRaw = rawFromHuman(refundInput);
  const penaltyRaw = rawFromHuman(penaltyInput);
  const inputsValid = refundRaw !== null && penaltyRaw !== null;

  const inFlight =
    tx.state.phase === "preparing" || tx.state.phase === "confirming";
  const isSuccess = tx.state.phase === "success";

  const handleResolve = () => {
    if (!inputsValid) return;
    tx.reset();
    void tx.run({
      disputeId: BigInt(dispute.onchain_dispute_id),
      refundAmount: refundRaw!,
      slashAmount: penaltyRaw!,
    });
  };

  const deadline = dispute.n2_deadline ? new Date(dispute.n2_deadline) : null;

  if (isSuccess) {
    return (
      <div
        data-testid="n2-resolution-form"
        className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-celo-sm dark:border-emerald-800 dark:bg-emerald-950/30"
      >
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
          <CheckCircle weight="fill" className="h-5 w-5" aria-hidden />
          <p className="text-base font-medium">Decision recorded on-chain.</p>
        </div>
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          The buyer will receive their refund and the case is now closed.
          Both parties have been notified.
        </p>
      </div>
    );
  }

  return (
    <article
      data-testid="n2-resolution-form"
      data-dispute-id={dispute.onchain_dispute_id}
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      {/* Case header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Scales weight="fill" className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <h3 className="text-body-lg font-semibold text-celo-dark dark:text-celo-light">
            Case #{dispute.onchain_dispute_id}
          </h3>
        </div>

        {dispute.reason ? (
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-celo-dark-bg">
            <p className="text-sm font-medium text-neutral-500 dark:text-celo-light/60">
              Buyer&apos;s complaint
            </p>
            <p className="mt-0.5 text-base text-celo-dark dark:text-celo-light">
              {dispute.reason}
            </p>
          </div>
        ) : null}

        {deadline ? (
          <DeadlineCountdown
            deadline={deadline}
            idleLabel="Decision needed within"
            elapsedLabel="Decision window closed"
            tone="rose"
            testId="n2-deadline-countdown"
          />
        ) : null}
      </header>

      <ChainMismatchBanner />

      {/* Decision inputs */}
      <div className="space-y-4 border-t border-neutral-100 pt-4 dark:border-celo-light/10">
        <p className="text-base font-medium text-celo-dark dark:text-celo-light">
          Your decision
        </p>

        <label className="block">
          <span className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light">
            Refund to buyer (USDT)
          </span>
          <p className="mb-2 text-sm text-neutral-500 dark:text-celo-light/60">
            How much of the payment goes back to the buyer. Enter 0 if the
            buyer should receive nothing.
          </p>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={refundInput}
              onChange={(e) => setRefundInput(e.target.value)}
              placeholder="0.00"
              data-testid="n2-refund-input"
              className="min-h-[52px] w-full rounded-xl border border-neutral-300 p-3 pr-16 text-body-lg tabular-nums text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
            />
            <span className="absolute inset-y-0 right-4 flex items-center text-base font-medium text-neutral-500 dark:text-celo-light/60">
              USDT
            </span>
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-base font-medium text-celo-dark dark:text-celo-light">
            Seller penalty (USDT)
          </span>
          <p className="mb-2 text-sm text-neutral-500 dark:text-celo-light/60">
            Additional amount deducted from the seller&apos;s security deposit
            as a penalty for misconduct. Enter 0 if no penalty applies.
          </p>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={penaltyInput}
              onChange={(e) => setPenaltyInput(e.target.value)}
              placeholder="0.00"
              data-testid="n2-slash-input"
              className="min-h-[52px] w-full rounded-xl border border-neutral-300 p-3 pr-16 text-body-lg tabular-nums text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
            />
            <span className="absolute inset-y-0 right-4 flex items-center text-base font-medium text-neutral-500 dark:text-celo-light/60">
              USDT
            </span>
          </div>
        </label>

        <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-celo-dark-bg dark:text-celo-light/60">
          The amounts you enter must not exceed what is held in escrow or the
          seller&apos;s security deposit respectively — the payment will fail
          if they do.
        </p>
      </div>

      <button
        type="button"
        data-testid="n2-resolve-btn"
        onClick={handleResolve}
        disabled={inFlight || !chainMatches || !inputsValid}
        className="min-h-[52px] w-full rounded-pill bg-celo-forest px-4 text-base font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
      >
        {inFlight ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner weight="regular" className="h-4 w-4 animate-spin" />
            {tx.state.phase === "preparing"
              ? "Preparing your decision…"
              : "Recording on-chain…"}
          </span>
        ) : (
          "Confirm decision"
        )}
      </button>

      {tx.state.phase === "error" ? (
        <p
          role="alert"
          data-testid="n2-resolve-error"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        >
          {tx.state.error.message}
        </p>
      ) : null}
    </article>
  );
}
