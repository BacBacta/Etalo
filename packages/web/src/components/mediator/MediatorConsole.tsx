/**
 * MediatorConsole — wallet-gated entry for `EtaloDispute.isMediatorApproved`
 * wallets. Lists open N2 disputes assigned to the connected mediator and
 * renders the per-dispute resolution form (ADR-056).
 *
 * Read flow: `useIsMediator` (on-chain) decides whether to render the
 * console at all ; `useMediatorQueue` then pulls the assigned N2 disputes
 * from the backend mirror.
 *
 * No nav entry surfaces this route — mediators reach it via off-app
 * communication.
 */
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
          ? "Connecting to your wallet…"
          : "Connect your wallet to access the mediator console."}
      </SimpleState>
    );
  }

  if (medPending) {
    return <LoadingState />;
  }

  if (!isMediator) {
    return (
      <SimpleState testId="mediator-not-approved">
        This wallet is not on the approved mediator whitelist. If you
        believe this is wrong, contact the team — mediator approval is a
        Safe multisig operation.
      </SimpleState>
    );
  }

  if (queuePending || !queue) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-4 p-4" data-testid="mediator-console">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-celo-dark dark:text-celo-light">
          Mediator console
        </h1>
        <p className="text-sm text-neutral-500 dark:text-celo-light/60">
          {queue.assigned_n2.length} dispute
          {queue.assigned_n2.length === 1 ? "" : "s"} assigned to you (N2).
        </p>
      </header>

      {queue.assigned_n2.length === 0 ? (
        <SimpleState testId="mediator-empty">
          No disputes assigned to you right now. New cases will appear here
          automatically once the Safe assigns them.
        </SimpleState>
      ) : (
        <ul className="space-y-3" data-testid="mediator-queue-list">
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
      className="flex items-center justify-center gap-2 p-6 text-sm text-neutral-500 dark:text-celo-light/60"
    >
      <Spinner weight="regular" className="h-4 w-4 animate-spin" />
      Loading mediator console…
    </div>
  );
}
