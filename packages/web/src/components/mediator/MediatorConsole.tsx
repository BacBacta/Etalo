"use client";

import { Spinner } from "@phosphor-icons/react";
import { useAccount } from "wagmi";

import { N2ResolutionForm } from "@/components/mediator/N2ResolutionForm";
import { useIsMediator } from "@/hooks/useIsMediator";
import { useMediatorQueue } from "@/hooks/useMediatorQueue";

export function MediatorConsole() {
  const { address, isConnecting } = useAccount();
  const lower = address?.toLowerCase();
  const { data: isMediator, isPending: medPending } = useIsMediator(lower);
  const enabledQueue = Boolean(lower && isMediator);
  const { data: queue, isPending: queuePending } = useMediatorQueue(
    enabledQueue ? lower : null,
  );

  if (!address) {
    return (
      <SimpleState testId="mediator-no-wallet">
        {isConnecting
          ? "Connecting…"
          : "Open this page from your mediator wallet to access your dispute cases."}
      </SimpleState>
    );
  }

  if (medPending) {
    return <LoadingState />;
  }

  if (!isMediator) {
    return (
      <SimpleState testId="mediator-not-approved">
        This wallet doesn&apos;t have mediator access. Contact the Etalo team
        if you think this is wrong.
      </SimpleState>
    );
  }

  if (queuePending || !queue) {
    return <LoadingState />;
  }

  const count = queue.assigned_n2.length;

  return (
    <section className="space-y-4 p-4" data-testid="mediator-console">
      <header className="space-y-0.5">
        <h1 className="text-display-4 font-semibold text-celo-dark dark:text-celo-light">
          Your dispute cases
        </h1>
        <p className="text-base text-neutral-500 dark:text-celo-light/60">
          {count === 0
            ? "No cases assigned to you right now."
            : count === 1
              ? "1 case waiting for your decision."
              : `${count} cases waiting for your decision.`}
        </p>
      </header>

      {count === 0 ? (
        <SimpleState testId="mediator-empty">
          When a dispute is assigned to you, it will appear here. Check back
          later or refresh the page.
        </SimpleState>
      ) : (
        <ul className="space-y-4" data-testid="mediator-queue-list">
          {queue.assigned_n2.map((dispute) => (
            <li key={dispute.id}>
              <N2ResolutionForm dispute={dispute} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SimpleState({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-base text-neutral-700 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:text-celo-light/80"
    >
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div
      data-testid="mediator-loading"
      className="flex items-center justify-center gap-2 p-6 text-base text-neutral-500 dark:text-celo-light/60"
    >
      <Spinner weight="regular" className="h-5 w-5 animate-spin" />
      Loading your cases…
    </div>
  );
}
