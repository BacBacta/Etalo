/**
 * N2ResolutionForm — one dispute card with refund + slash inputs.
 *
 * The N2 mediator enters a refund (taken from the remaining escrow on
 * the item) and an optional slash on the seller's stake, then submits
 * `EtaloDispute.resolveN2Mediation(...)`. Both amounts are typed in
 * human USDT and converted to raw 6-decimal bigints.
 *
 * Parties' raw 0x addresses are intentionally NOT displayed (CLAUDE.md
 * rule 5 / ADR-043 casual filter). Mediators verify off-app via order
 * UUIDs + Blockscout if needed.
 */
"use client";

import { Spinner, Warning } from "@phosphor-icons/react";
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
  // Accepts "0", "0.05", "1.5", "10" (up to 6 decimals).
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
  const [slashInput, setSlashInput] = useState<string>("0");

  const refundRaw = rawFromHuman(refundInput);
  const slashRaw = rawFromHuman(slashInput);
  const inputsValid = refundRaw !== null && slashRaw !== null;

  const inFlight =
    tx.state.phase === "preparing" || tx.state.phase === "confirming";

  const handleResolve = () => {
    if (!inputsValid) return;
    tx.reset();
    void tx.run({
      disputeId: BigInt(dispute.onchain_dispute_id),
      refundAmount: refundRaw!,
      slashAmount: slashRaw!,
    });
  };

  const deadline = dispute.n2_deadline ? new Date(dispute.n2_deadline) : null;

  return (
    <article
      data-testid="n2-resolution-form"
      data-dispute-id={dispute.onchain_dispute_id}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Warning
            weight="fill"
            className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400"
            aria-hidden
          />
          <h3 className="text-base font-semibold text-celo-dark dark:text-celo-light">
            Dispute #{dispute.onchain_dispute_id}
          </h3>
        </div>
        <p className="text-sm text-neutral-500 dark:text-celo-light/60">
          Order {dispute.order_id.slice(0, 8)} · item{" "}
          {dispute.order_item_id.slice(0, 8)}
        </p>
        {dispute.reason ? (
          <p className="text-sm text-celo-dark dark:text-celo-light/85">
            <span className="font-medium">Buyer reason:</span> {dispute.reason}
          </p>
        ) : null}
        {deadline ? (
          <DeadlineCountdown
            deadline={deadline}
            idleLabel="Decision due within"
            elapsedLabel="N2 window closed — vote escalation available"
            tone="rose"
            testId="n2-deadline-countdown"
          />
        ) : null}
      </header>

      <ChainMismatchBanner />

      <div className="grid grid-cols-1 gap-3 border-t border-neutral-200 pt-3 dark:border-celo-light/10 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-celo-dark dark:text-celo-light">
            Refund to buyer (USDT)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={refundInput}
            onChange={(e) => setRefundInput(e.target.value)}
            placeholder="0.00"
            data-testid="n2-refund-input"
            className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base tabular-nums text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-celo-dark dark:text-celo-light">
            Slash seller stake (USDT)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={slashInput}
            onChange={(e) => setSlashInput(e.target.value)}
            placeholder="0.00"
            data-testid="n2-slash-input"
            className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base tabular-nums text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
          />
        </label>
      </div>

      <p className="text-sm text-neutral-500 dark:text-celo-light/60">
        Refund is capped at the remaining escrow on the item ; slash is
        capped at the seller&apos;s current stake. The contract reverts if
        either is exceeded.
      </p>

      <button
        type="button"
        data-testid="n2-resolve-btn"
        onClick={handleResolve}
        disabled={inFlight || !chainMatches || !inputsValid}
        className="min-h-[44px] w-full rounded-pill bg-celo-forest px-4 text-base font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
      >
        {inFlight ? (
          <span className="inline-flex items-center gap-2">
            <Spinner weight="regular" className="h-4 w-4 animate-spin" />
            {tx.state.phase === "preparing"
              ? "Preparing…"
              : "Confirming on-chain…"}
          </span>
        ) : (
          "Resolve dispute"
        )}
      </button>

      {tx.state.phase === "error" ? (
        <p
          role="alert"
          data-testid="n2-resolve-error"
          className="text-sm text-rose-700 dark:text-rose-300"
        >
          {tx.state.error.message}
        </p>
      ) : null}
    </article>
  );
}
