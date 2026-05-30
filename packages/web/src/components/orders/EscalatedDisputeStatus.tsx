/**
 * EscalatedDisputeStatus — N2/N3 status surface for the parties
 * (buyer + seller) and for eligible mediator-voters.
 *
 * - N2_Mediation: shows assigned-mediator state + 7-day countdown.
 * - N3_Voting: shows live tallies + deadline ; when the connected
 *   wallet is an eligible voter it surfaces submitVote(favorBuyer)
 *   buttons (gated by hasVoted so a used ballot is immediately
 *   disabled). Once the deadline elapses, any wallet can trigger
 *   finalizeVote (permissionless on-chain).
 */
"use client";

import { Gavel, Spinner, Users } from "@phosphor-icons/react";
import { useAccount } from "wagmi";

import { DeadlineCountdown } from "@/components/orders/AutoReleaseTimer";
import {
  ChainMismatchBanner,
  useChainMatch,
} from "@/components/wallet/ChainMismatchBanner";
import { useDisputeVote } from "@/hooks/useDisputeVote";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";
import { useFinalizeVote } from "@/hooks/useFinalizeVote";
import { useHasVoted } from "@/hooks/useHasVoted";
import { useIsMediator } from "@/hooks/useIsMediator";
import { useSubmitVote } from "@/hooks/useSubmitVote";
import type { DisputeVoteApi } from "@/hooks/useMediatorQueue";

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
  // Defensive — for any other non-N1 / non-resolved level.
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
  const { address } = useAccount();
  const { isMatch: chainMatches } = useChainMatch();
  const { data: vote, isPending: votePending } = useDisputeVote(dispute.id);
  const { data: isMediatorData } = useIsMediator(address);
  const isEligibleVoter = Boolean(isMediatorData);

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
        <N3VoteActions
          vote={vote}
          disputeVoteId={dispute.vote_id}
          address={address}
          isEligibleVoter={isEligibleVoter}
          chainMatches={chainMatches}
        />
      ) : (
        <p className="text-amber-900/90 dark:text-amber-100/90">
          {votePending
            ? "Loading vote details…"
            : "Awaiting vote details from the indexer…"}
        </p>
      )}
    </div>
  );
}

interface N3VoteActionsProps {
  vote: DisputeVoteApi;
  disputeVoteId: number | null;
  address: string | undefined;
  isEligibleVoter: boolean;
  chainMatches: boolean;
}

function N3VoteActions({
  vote,
  disputeVoteId,
  address,
  isEligibleVoter,
  chainMatches,
}: N3VoteActionsProps) {
  const voteId = disputeVoteId ?? vote.onchain_vote_id;
  const { data: hasVotedData } = useHasVoted(voteId, address);
  const hasVoted = Boolean(hasVotedData);
  const submitVoteTx = useSubmitVote();
  const finalizeVoteTx = useFinalizeVote();

  const voteDeadline = new Date(vote.deadline);
  const isVoteClosed = voteDeadline.getTime() <= Date.now();
  const submitInFlight =
    submitVoteTx.state.phase === "preparing" ||
    submitVoteTx.state.phase === "confirming";
  const finalizeInFlight =
    finalizeVoteTx.state.phase === "preparing" ||
    finalizeVoteTx.state.phase === "confirming";

  const handleVote = (favorBuyer: boolean) => {
    submitVoteTx.reset();
    void submitVoteTx.run({ voteId: BigInt(voteId), favorBuyer });
  };

  const handleFinalize = () => {
    finalizeVoteTx.reset();
    void finalizeVoteTx.run({ voteId: BigInt(voteId) });
  };

  return (
    <>
      {/* Live tallies */}
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
        deadline={voteDeadline}
        idleLabel="Vote closes in"
        elapsedLabel="Vote closed — awaiting finalization"
        tone="amber"
        testId="n3-status-countdown"
      />

      {/* Vote buttons — shown to eligible mediators only while open */}
      {isEligibleVoter && !isVoteClosed && !vote.finalized ? (
        <div className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-700">
          <ChainMismatchBanner />
          {hasVoted ? (
            <p
              data-testid="n3-already-voted"
              className="text-amber-900/90 dark:text-amber-100/90"
            >
              You have already cast your vote.
            </p>
          ) : (
            <>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Cast your vote:
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="n3-vote-buyer"
                  onClick={() => handleVote(true)}
                  disabled={submitInFlight || !chainMatches}
                  className="min-h-[44px] flex-1 rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
                >
                  {submitInFlight && submitVoteTx.state.phase === "preparing" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner weight="regular" className="h-4 w-4 animate-spin" />
                      Preparing…
                    </span>
                  ) : submitInFlight ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner weight="regular" className="h-4 w-4 animate-spin" />
                      Confirming…
                    </span>
                  ) : (
                    "Favour buyer"
                  )}
                </button>
                <button
                  type="button"
                  data-testid="n3-vote-seller"
                  onClick={() => handleVote(false)}
                  disabled={submitInFlight || !chainMatches}
                  className="min-h-[44px] flex-1 rounded-pill border border-amber-400 bg-transparent px-4 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/30"
                >
                  Favour seller
                </button>
              </div>
            </>
          )}
          {submitVoteTx.state.phase === "error" ? (
            <p
              role="alert"
              data-testid="n3-vote-error"
              className="text-rose-700 dark:text-rose-300"
            >
              {submitVoteTx.state.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Finalize button — permissionless, shown once vote is closed */}
      {isVoteClosed && !vote.finalized ? (
        <div className="border-t border-amber-200 pt-3 dark:border-amber-700">
          <ChainMismatchBanner />
          <button
            type="button"
            data-testid="n3-finalize-btn"
            onClick={handleFinalize}
            disabled={finalizeInFlight || !chainMatches}
            className="min-h-[44px] w-full rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
          >
            {finalizeInFlight ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner weight="regular" className="h-4 w-4 animate-spin" />
                {finalizeVoteTx.state.phase === "preparing"
                  ? "Preparing…"
                  : "Confirming…"}
              </span>
            ) : (
              "Finalize vote"
            )}
          </button>
          {finalizeVoteTx.state.phase === "error" ? (
            <p
              role="alert"
              data-testid="n3-finalize-error"
              className="text-rose-700 dark:text-rose-300"
            >
              {finalizeVoteTx.state.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {vote.finalized ? (
        <p
          data-testid="n3-finalized"
          className="font-medium text-amber-900 dark:text-amber-100"
        >
          Vote finalized —{" "}
          {vote.buyer_won ? "buyer wins." : "seller wins."}
        </p>
      ) : null}
    </>
  );
}
