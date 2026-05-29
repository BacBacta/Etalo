/**
 * EscalatedDisputeStatus — read-only N2/N3 status surface for the
 * parties (buyer + seller). Replaces the previous "handled off-app"
 * placeholder so an escalated dispute is no longer a black box.
 *
 * - N2_Mediation: shows whether a mediator has been assigned and the
 *   7-day decision countdown.
 * - N3_Voting: shows tallies (for_buyer vs for_seller) + the vote
 *   deadline, pulled from `/disputes/{id}/vote` (ADR-056 endpoint).
 *
 * No action surfaces here — parties watch from the side ; the mediator
 * console (PR 2) and the future voting console drive resolution.
 */
"use client";

import { Gavel, Users } from "@phosphor-icons/react";

import { DeadlineCountdown } from "@/components/orders/AutoReleaseTimer";
import { useDisputeVote } from "@/hooks/useDisputeVote";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";

interface Props {
  dispute: DisputeResponse;
}

export function EscalatedDisputeStatus({ dispute }: Props) {
  if (dispute.level === "N2_Mediation") {
    return <N2Status dispute={dispute} />;
  }
  if (dispute.level === "N3_Voting") {
    return <N3Status dispute={dispute} />;
  }
  // Defensive — for any other non-N1 / non-resolved level, render a
  // neutral note rather than nothing.
  return (
    <div
      data-testid="dispute-status-unknown"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
    >
      <p className="text-amber-900 dark:text-amber-100">
        Dispute is at level{" "}
        <span className="font-medium">{dispute.level}</span>. Status surface
        is being prepared.
      </p>
    </div>
  );
}

function N2Status({ dispute }: { dispute: DisputeResponse }) {
  const deadline = dispute.n2_deadline ? new Date(dispute.n2_deadline) : null;
  const assigned = Boolean(dispute.n2_mediator_address);

  return (
    <div
      data-testid="n2-status-card"
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
    >
      <header className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
        <Gavel weight="fill" className="h-5 w-5" aria-hidden />
        <h3 className="font-semibold">Mediation in progress (N2)</h3>
      </header>
      <p className="text-amber-900/90 dark:text-amber-100/90">
        {assigned
          ? "A neutral mediator has been assigned and is reviewing your case."
          : "Awaiting mediator assignment by the team. The 7-day window starts once a mediator is assigned."}
      </p>
      {deadline ? (
        <DeadlineCountdown
          deadline={deadline}
          idleLabel="Decision expected within"
          elapsedLabel="Mediation window closed — vote escalation available"
          tone="amber"
          testId="n2-status-countdown"
        />
      ) : null}
    </div>
  );
}

function N3Status({ dispute }: { dispute: DisputeResponse }) {
  const { data: vote, isPending } = useDisputeVote(dispute.id);

  return (
    <div
      data-testid="n3-status-card"
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
    >
      <header className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
        <Users weight="fill" className="h-5 w-5" aria-hidden />
        <h3 className="font-semibold">Community vote in progress (N3)</h3>
      </header>
      {vote ? (
        <>
          <p className="text-amber-900/90 dark:text-amber-100/90">
            Tally:{" "}
            <span
              data-testid="n3-tally-for-buyer"
              className="font-semibold tabular-nums"
            >
              {vote.for_buyer}
            </span>{" "}
            for buyer ·{" "}
            <span
              data-testid="n3-tally-for-seller"
              className="font-semibold tabular-nums"
            >
              {vote.for_seller}
            </span>{" "}
            for seller
          </p>
          <DeadlineCountdown
            deadline={new Date(vote.deadline)}
            idleLabel="Vote closes in"
            elapsedLabel="Vote closed — awaiting finalization"
            tone="amber"
            testId="n3-status-countdown"
          />
        </>
      ) : (
        <p className="text-amber-900/90 dark:text-amber-100/90">
          {isPending
            ? "Loading vote details…"
            : "Awaiting vote details from the indexer…"}
        </p>
      )}
    </div>
  );
}
