/**
 * N1ResolutionCard — buyer/seller N1 Amicable dispute resolution.
 *
 * Both parties land here when a dispute is open at LEVEL_N1
 * (48 h bilateral window before escalation to N2 Mediation).
 *
 * UX :
 *  - Pulls live proposal state from chain via `useN1Proposal`
 *  - Shows the other party's current proposal (if any)
 *  - Form to submit your own refund amount (or "Accept theirs")
 *  - When amounts match, the contract auto-resolves and emits
 *    `DisputeResolved` ; the indexer flips `item.status` and the
 *    parent re-renders without this card
 *
 * Out of V1 scope (deferred to V1.5+ dispute UI sprint) :
 *  - N2 Mediation surfaces (mediator chat, evidence uploads)
 *  - N3 Community Voting surfaces
 *  - `escalateToMediation` button (post-N1-deadline ; can be
 *    triggered via Celoscan in the interim)
 */
"use client";

import { CheckCircle, Spinner, Warning } from "@phosphor-icons/react";
import { useState } from "react";

import { DeadlineCountdown } from "@/components/orders/AutoReleaseTimer";
import {
  ChainMismatchBanner,
  useChainMatch,
} from "@/components/wallet/ChainMismatchBanner";
import { useN1Proposal } from "@/hooks/useN1Proposal";
import { useResolveN1Amicable } from "@/hooks/useResolveN1Amicable";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";
import { formatRawUsdt } from "@/lib/usdt";

const ZERO = BigInt(0);
const USDT_SCALE = BigInt(1_000_000);

function rawFromHuman(human: string): bigint | null {
  // Accepts "0.05", "1.5", "10" etc. Returns raw 6-decimal bigint.
  if (!/^\d+(\.\d{0,6})?$/.test(human.trim())) return null;
  const [intPart, fracPart = ""] = human.trim().split(".");
  const fracPadded = (fracPart + "000000").slice(0, 6);
  try {
    return BigInt(intPart) * USDT_SCALE + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

export interface N1ResolutionCardProps {
  dispute: DisputeResponse;
  /** The wallet currently signed in (already lowercased by useAccount). */
  currentUserAddress: string;
  /** Item price in raw 6-decimal USDT — sets the input max + the
   *  default "full refund" suggestion. */
  itemPriceRawUsdt: number;
}

export function N1ResolutionCard({
  dispute,
  currentUserAddress,
  itemPriceRawUsdt,
}: N1ResolutionCardProps) {
  const { isMatch: chainMatches } = useChainMatch();
  const proposalQuery = useN1Proposal(dispute.onchain_dispute_id);
  const tx = useResolveN1Amicable();
  const [amountInput, setAmountInput] = useState<string>(
    formatRawUsdt(itemPriceRawUsdt), // default = full refund (most generous-to-buyer)
  );

  // Out-of-V1-scope guard rails.
  if (dispute.level !== "N1_Amicable") {
    return (
      <div
        data-testid="n1-card-escalated"
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
      >
        <p className="text-amber-900 dark:text-amber-100">
          This dispute has escalated past the bilateral 48 h window
          (current level : <span className="font-medium">{dispute.level}</span>).
          Resolution is handled off-app for now ; we&apos;ll surface
          mediation + voting tooling in the next release.
        </p>
      </div>
    );
  }

  if (dispute.resolved) {
    return (
      <div
        data-testid="n1-card-resolved"
        className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-700 dark:bg-emerald-950/40"
      >
        <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
          <CheckCircle weight="fill" className="h-5 w-5" />
          <span className="font-medium">Dispute resolved</span>
        </div>
      </div>
    );
  }

  const isBuyer =
    currentUserAddress.toLowerCase() === dispute.buyer_address.toLowerCase();
  const isSeller =
    currentUserAddress.toLowerCase() === dispute.seller_address.toLowerCase();
  if (!isBuyer && !isSeller) {
    return null; // viewer is neither party (eg. an admin checking) — silent
  }

  const myLabel = isBuyer ? "your" : "your"; // both say "your" — keeping symmetric
  const theirLabel = isBuyer ? "the seller" : "the buyer";

  const proposal = proposalQuery.data;
  const myAmount = proposal
    ? isBuyer
      ? proposal.buyerAmount
      : proposal.sellerAmount
    : ZERO;
  const theirAmount = proposal
    ? isBuyer
      ? proposal.sellerAmount
      : proposal.buyerAmount
    : ZERO;
  const myProposed = proposal
    ? isBuyer
      ? proposal.buyerProposed
      : proposal.sellerProposed
    : false;
  const theirProposed = proposal
    ? isBuyer
      ? proposal.sellerProposed
      : proposal.buyerProposed
    : false;

  const handleSubmit = (rawAmount: bigint) => {
    if (rawAmount < ZERO) return;
    tx.reset();
    void tx.run({
      disputeId: BigInt(dispute.onchain_dispute_id),
      refundAmount: rawAmount,
    });
  };

  const handlePropose = () => {
    const raw = rawFromHuman(amountInput);
    if (raw === null) return;
    handleSubmit(raw);
  };

  const handleAcceptTheirs = () => handleSubmit(theirAmount);

  const inFlight =
    tx.state.phase === "preparing" || tx.state.phase === "confirming";

  // ADR-019 N1 deadline. Backend payload carries `n1_deadline` as an
  // ISO string ; we parse once per render — cheap. When the deadline
  // is past, both sides can still see the in-flight proposals but
  // submitting a NEW proposal is contractually pointless (the
  // contract allows it but escalation should take over) — we hide
  // the form to keep the surface honest.
  const n1Deadline = dispute.n1_deadline ? new Date(dispute.n1_deadline) : null;
  const n1Elapsed = n1Deadline ? n1Deadline.getTime() <= Date.now() : false;

  return (
    <div
      data-testid="n1-resolution-card"
      className="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm dark:border-rose-700 dark:bg-rose-950/30"
    >
      <header className="flex items-start gap-2">
        <Warning
          weight="fill"
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-700 dark:text-rose-300"
          aria-hidden
        />
        <div className="space-y-2 min-w-0 flex-1">
          <p className="font-medium text-rose-900 dark:text-rose-100">
            Dispute open — bilateral 48 h window
          </p>
          {dispute.reason ? (
            <p className="text-rose-900/80 dark:text-rose-100/80">
              <span className="font-medium">Reason : </span>
              {dispute.reason}
            </p>
          ) : null}
          {n1Deadline ? (
            <DeadlineCountdown
              deadline={n1Deadline}
              idleLabel="Respond within"
              elapsedLabel="N1 window closed — escalation available"
              tone="rose"
              testId="n1-deadline-countdown"
            />
          ) : null}
        </div>
      </header>

      <ChainMismatchBanner />

      {/* Other party's proposal (if any) */}
      {theirProposed ? (
        <div className="rounded-md border border-rose-200 bg-white p-3 dark:border-rose-800 dark:bg-celo-dark-elevated">
          <p className="text-celo-dark dark:text-celo-light">
            {theirLabel} proposed a refund of{" "}
            <span className="font-semibold tabular-nums">
              {formatRawUsdt(Number(theirAmount))} USDT
            </span>
            .
          </p>
          <button
            type="button"
            data-testid="n1-accept-theirs"
            onClick={handleAcceptTheirs}
            disabled={inFlight || !chainMatches}
            className="mt-2 min-h-[44px] rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
          >
            Accept their proposal
          </button>
        </div>
      ) : null}

      {/* My current proposal (if any) */}
      {myProposed ? (
        <p className="text-celo-dark dark:text-celo-light">
          {myLabel.charAt(0).toUpperCase() + myLabel.slice(1)} last
          proposal :{" "}
          <span className="font-semibold tabular-nums">
            {formatRawUsdt(Number(myAmount))} USDT
          </span>
          .{" "}
          {!theirProposed
            ? `Waiting for ${theirLabel} to respond.`
            : myAmount === theirAmount
              ? "Amounts match — finalizing on-chain shortly."
              : `${theirLabel} proposed a different amount.`}
        </p>
      ) : null}

      {/* Form to submit (or update) my proposal — hidden once the N1
          window has elapsed. The on-chain function still accepts
          proposals past deadline but the meaningful action is to
          escalate (V1.5+ UI) ; surfacing the form would mislead. */}
      {n1Elapsed ? null : (
      <div className="space-y-2 border-t border-rose-200 pt-3 dark:border-rose-800">
        <label
          htmlFor="n1-amount-input"
          className="block text-celo-dark dark:text-celo-light"
        >
          {myProposed ? "Update your proposal" : "Propose a refund amount"}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="n1-amount-input"
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            data-testid="n1-amount-input"
            className="min-h-[44px] flex-1 rounded-md border border-neutral-300 p-2 text-base tabular-nums dark:border-celo-light/30 dark:bg-celo-dark-bg dark:text-celo-light"
          />
          <span className="text-celo-dark dark:text-celo-light">USDT</span>
        </div>
        <button
          type="button"
          data-testid="n1-propose-btn"
          onClick={handlePropose}
          disabled={
            inFlight || !chainMatches || rawFromHuman(amountInput) === null
          }
          className="min-h-[44px] w-full rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
        >
          {inFlight ? (
            <span className="inline-flex items-center gap-2">
              <Spinner weight="regular" className="h-4 w-4 animate-spin" />
              {tx.state.phase === "preparing"
                ? "Preparing…"
                : "Confirming on-chain…"}
            </span>
          ) : myProposed ? (
            "Update proposal"
          ) : (
            "Propose"
          )}
        </button>

        {tx.state.phase === "error" ? (
          <p className="text-rose-700 dark:text-rose-300">
            {tx.state.error.message}
          </p>
        ) : null}
        <p className="text-neutral-600 dark:text-celo-light/60">
          When both parties enter the same amount, the contract
          auto-settles and the funds split immediately.
        </p>
      </div>
      )}
    </div>
  );
}
