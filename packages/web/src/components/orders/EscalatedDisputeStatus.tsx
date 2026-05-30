"use client";

import { CheckCircle, Gavel, Spinner, Users } from "@phosphor-icons/react";
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
  return (
    <div
      data-testid="dispute-status-unknown"
      className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:text-celo-light/70"
    >
      Your dispute is being reviewed. We&apos;ll update you as soon as there
      is a decision.
    </div>
  );
}

function N2Status({ dispute }: { dispute: DisputeResponse }) {
  const deadline = dispute.n2_deadline ? new Date(dispute.n2_deadline) : null;
  const assigned = Boolean(dispute.n2_mediator_address);

  return (
    <div
      data-testid="n2-status-card"
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800/50 dark:bg-amber-950/30"
    >
      <header className="flex items-center gap-2">
        <Gavel weight="fill" className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <h3 className="text-base font-semibold text-amber-900 dark:text-amber-100">
          A mediator is reviewing your dispute
        </h3>
      </header>

      <p className="text-base text-amber-900/90 dark:text-amber-100/80">
        {assigned
          ? "A neutral mediator has been assigned and is looking into your case. They will review both sides and issue a decision."
          : "We are assigning a neutral mediator to your case. You will not need to do anything — they will review both sides and make a decision."}
      </p>

      {deadline ? (
        <DeadlineCountdown
          deadline={deadline}
          idleLabel="Decision expected within"
          elapsedLabel="The review period has ended — a decision is being recorded"
          tone="amber"
          testId="n2-status-countdown"
        />
      ) : null}

      <p className="text-sm text-amber-700/80 dark:text-amber-300/70">
        The funds remain safely held until the mediator issues their decision.
      </p>
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
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800/50 dark:bg-amber-950/30"
    >
      <header className="flex items-center gap-2">
        <Users weight="fill" className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <h3 className="text-base font-semibold text-amber-900 dark:text-amber-100">
          Community review in progress
        </h3>
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
        <p className="text-base text-amber-900/90 dark:text-amber-100/80">
          {votePending
            ? "Loading vote details…"
            : "Our mediators are reviewing your case. You will be notified once a decision has been made."}
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

  // Finalized — show result to everyone
  if (vote.finalized) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle weight="fill" className="h-5 w-5" aria-hidden />
          <p
            data-testid="n3-finalized"
            className="text-base font-semibold"
          >
            {vote.buyer_won
              ? "Decision: buyer refunded."
              : "Decision: payment released to seller."}
          </p>
        </div>
        <p className="text-sm text-amber-900/80 dark:text-amber-100/70">
          The mediators have reviewed both sides and recorded their decision
          on-chain. The funds have been redistributed accordingly.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Tally — visible to all */}
      <p className="text-base text-amber-900/90 dark:text-amber-100/80">
        Our mediators are reviewing this dispute. Current votes:{" "}
        <span data-testid="n3-tally-for-buyer" className="font-semibold tabular-nums">
          {vote.for_buyer}
        </span>{" "}
        in favour of the buyer ·{" "}
        <span data-testid="n3-tally-for-seller" className="font-semibold tabular-nums">
          {vote.for_seller}
        </span>{" "}
        in favour of the seller.
      </p>

      <DeadlineCountdown
        deadline={voteDeadline}
        idleLabel="Review closes in"
        elapsedLabel="Review complete — recording decision…"
        tone="amber"
        testId="n3-status-countdown"
      />

      {/* Vote buttons — mediators only, while open */}
      {isEligibleVoter && !isVoteClosed ? (
        <div className="space-y-3 border-t border-amber-200 pt-3 dark:border-amber-700">
          <ChainMismatchBanner />
          {hasVoted ? (
            <p
              data-testid="n3-already-voted"
              className="text-base text-amber-900/90 dark:text-amber-100/80"
            >
              ✓ You have already submitted your vote for this case.
            </p>
          ) : (
            <>
              <p className="text-base font-medium text-amber-900 dark:text-amber-100">
                Submit your vote:
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="n3-vote-buyer"
                  onClick={() => handleVote(true)}
                  disabled={submitInFlight || !chainMatches}
                  className="min-h-[52px] w-full rounded-pill bg-celo-forest px-4 text-base font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
                >
                  {submitInFlight ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner weight="regular" className="h-4 w-4 animate-spin" />
                      Submitting…
                    </span>
                  ) : (
                    "Refund the buyer"
                  )}
                </button>
                <button
                  type="button"
                  data-testid="n3-vote-seller"
                  onClick={() => handleVote(false)}
                  disabled={submitInFlight || !chainMatches}
                  className="min-h-[52px] w-full rounded-pill border border-amber-400 bg-transparent px-4 text-base font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/30"
                >
                  Release payment to seller
                </button>
              </div>
            </>
          )}
          {submitVoteTx.state.phase === "error" ? (
            <p
              role="alert"
              data-testid="n3-vote-error"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
            >
              {submitVoteTx.state.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Finalize — permissionless, shown post-deadline */}
      {isVoteClosed ? (
        <div className="border-t border-amber-200 pt-3 dark:border-amber-700">
          <ChainMismatchBanner />
          <button
            type="button"
            data-testid="n3-finalize-btn"
            onClick={handleFinalize}
            disabled={finalizeInFlight || !chainMatches}
            className="min-h-[52px] w-full rounded-pill bg-celo-forest px-4 text-base font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
          >
            {finalizeInFlight ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner weight="regular" className="h-4 w-4 animate-spin" />
                {finalizeVoteTx.state.phase === "preparing"
                  ? "Preparing…"
                  : "Recording decision…"}
              </span>
            ) : (
              "Record decision on-chain"
            )}
          </button>
          {finalizeVoteTx.state.phase === "error" ? (
            <p
              role="alert"
              data-testid="n3-finalize-error"
              className="mt-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
            >
              {finalizeVoteTx.state.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
