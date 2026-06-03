/**
 * AdminDisputesConsole — wallet-gated triage page for the Safe owners
 * (ADR-056). Lists open disputes and prepares the calldata for the two
 * Safe-only EtaloDispute operations:
 *
 *   - assignN2Mediator(disputeId, mediator)
 *   - approveMediator(mediator, approved)
 *
 * The page never executes a Safe tx — it only encodes calldata so the
 * 2-of-3 signers can craft the transaction in Safe's UI.
 */
"use client";

import { Spinner } from "@phosphor-icons/react";
import { useState } from "react";
import { useAccount } from "wagmi";

import { SafeCalldataPanel } from "@/components/admin/SafeCalldataPanel";
import { useAdminDisputes } from "@/hooks/useAdminDisputes";
import { useAdminToken } from "@/hooks/useAdminToken";
import { useIsSafeOwner } from "@/hooks/useIsSafeOwner";
import type { DisputeResponse } from "@/hooks/useDisputeForItem";
import {
  encodeApproveMediator,
  encodeAssignN2Mediator,
} from "@/lib/safe-calldata";

const DISPUTE_TARGET =
  (process.env.NEXT_PUBLIC_DISPUTE_ADDRESS as string | undefined) ??
  "0x0000000000000000000000000000000000000000";

const LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All levels" },
  { value: "N1_Amicable", label: "N1 amicable" },
  { value: "N2_Mediation", label: "N2 mediation" },
  { value: "N3_Voting", label: "N3 voting" },
];

export function AdminDisputesConsole() {
  const { address } = useAccount();
  const lower = address?.toLowerCase();
  const isOwner = useIsSafeOwner(lower);
  const { token, setToken, clear, hydrated } = useAdminToken();
  const [levelFilter, setLevelFilter] = useState<string>("");

  const {
    data: disputes,
    isPending,
    isError,
    error,
  } = useAdminDisputes({ token, level: levelFilter || null, resolved: false });

  if (!address) {
    return (
      <SimpleState testId="admin-no-wallet">
        Connect your wallet to access the admin triage page.
      </SimpleState>
    );
  }

  if (!isOwner) {
    return (
      <SimpleState testId="admin-not-owner">
        This wallet is not a Safe owner. The admin triage page is only
        accessible to the 2-of-3 mainnet Safe signers.
      </SimpleState>
    );
  }

  if (!hydrated) {
    return <LoadingState />;
  }

  return (
    <section
      className="space-y-4 p-4"
      data-testid="admin-disputes-console"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-celo-dark dark:text-celo-light">
          Admin · disputes
        </h1>
        <p className="text-sm text-neutral-500 dark:text-celo-light/60">
          Triage + Safe calldata preparation. Signers craft and sign in Safe.
        </p>
      </header>

      {!token ? (
        <AdminTokenInput onSubmit={setToken} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clear}
              data-testid="admin-token-clear"
              className="text-sm text-neutral-500 underline hover:text-celo-dark dark:text-celo-light/60 dark:hover:text-celo-light"
            >
              Clear admin token
            </button>
          </div>

          <ApproveMediatorPanel />

          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-level-filter"
              className="text-sm text-neutral-600 dark:text-celo-light/70"
            >
              Filter:
            </label>
            <select
              id="admin-level-filter"
              data-testid="admin-level-filter"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light sm:flex-none"
            >
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {isPending ? (
            <LoadingState />
          ) : isError ? (
            <SimpleState testId="admin-disputes-error">
              {error instanceof Error
                ? error.message
                : "Failed to load disputes."}
            </SimpleState>
          ) : !disputes || disputes.length === 0 ? (
            <SimpleState testId="admin-disputes-empty">
              No open disputes match this filter.
            </SimpleState>
          ) : (
            <ul className="space-y-4" data-testid="admin-disputes-list">
              {disputes.map((d) => (
                <li key={d.id}>
                  <DisputeTriageRow dispute={d} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function AdminTokenInput({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label
        htmlFor="admin-token-input"
        className="block text-sm font-medium text-celo-dark dark:text-celo-light"
      >
        Paste your admin token
      </label>
      <p className="text-sm text-neutral-500 dark:text-celo-light/60">
        The token lives in sessionStorage for this tab only — not in any env
        bundled to the public site.
      </p>
      <input
        id="admin-token-input"
        data-testid="admin-token-input"
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base font-mono text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
      />
      <button
        type="submit"
        data-testid="admin-token-submit"
        disabled={!value.trim()}
        className="min-h-[44px] rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark disabled:opacity-50"
      >
        Unlock
      </button>
    </form>
  );
}

function ApproveMediatorPanel() {
  const [address, setAddress] = useState("");
  const [approved, setApproved] = useState(true);

  let calldata: `0x${string}` | null = null;
  let error: string | null = null;
  const trimmed = address.trim();
  if (trimmed) {
    try {
      calldata = encodeApproveMediator(trimmed, approved);
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid input";
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated">
      <header>
        <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
          Manage mediator whitelist
        </h2>
        <p className="text-sm text-neutral-500 dark:text-celo-light/60">
          Generate calldata for <code>approveMediator(address, approved)</code>.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… mediator address"
          data-testid="approve-mediator-input"
          className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 font-mono text-sm text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
        />
        <label className="inline-flex items-center gap-2 text-sm text-celo-dark dark:text-celo-light">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
            data-testid="approve-mediator-checkbox"
            className="h-4 w-4"
          />
          Approved (uncheck to revoke)
        </label>
      </div>
      <SafeCalldataPanel
        title="Safe tx — approveMediator"
        targetAddress={DISPUTE_TARGET}
        functionSignature="approveMediator(address mediator, bool approved)"
        decodedArgs={`${trimmed || "—"}, ${approved}`}
        calldata={calldata}
        error={error}
      />
    </div>
  );
}

function DisputeTriageRow({ dispute }: { dispute: DisputeResponse }) {
  const [mediator, setMediator] = useState("");
  const needsAssignment =
    dispute.level === "N2_Mediation" && !dispute.n2_mediator_address;

  let calldata: `0x${string}` | null = null;
  let error: string | null = null;
  const trimmed = mediator.trim();
  if (needsAssignment && trimmed) {
    try {
      calldata = encodeAssignN2Mediator(
        BigInt(dispute.onchain_dispute_id),
        trimmed,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid input";
    }
  }

  return (
    <article
      data-testid="admin-dispute-row"
      data-dispute-id={dispute.onchain_dispute_id}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-celo-dark dark:text-celo-light">
            Dispute #{dispute.onchain_dispute_id}
          </h3>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {dispute.level}
          </span>
        </div>
        <p className="text-sm text-neutral-500 dark:text-celo-light/60">
          Opened {new Date(dispute.opened_at).toLocaleString()}
        </p>
        {dispute.reason ? (
          <p className="text-sm text-celo-dark dark:text-celo-light/85">
            <span className="font-medium">Buyer reason:</span> {dispute.reason}
          </p>
        ) : null}
        {dispute.n2_mediator_address ? (
          <p className="text-sm text-neutral-500 dark:text-celo-light/60">
            Mediator assigned (on-chain).
          </p>
        ) : null}
      </header>

      {needsAssignment ? (
        <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-celo-light/10">
          <label
            htmlFor={`assign-${dispute.onchain_dispute_id}`}
            className="block text-sm font-medium text-celo-dark dark:text-celo-light"
          >
            Assign a mediator
          </label>
          <input
            id={`assign-${dispute.onchain_dispute_id}`}
            type="text"
            value={mediator}
            onChange={(e) => setMediator(e.target.value)}
            placeholder="0x… mediator address (must be approved)"
            data-testid="assign-mediator-input"
            className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 font-mono text-sm text-celo-dark focus:outline-none focus:ring-2 focus:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
          />
          <SafeCalldataPanel
            title="Safe tx — assignN2Mediator"
            description="Both addresses must be the approved-mediator whitelist for the contract to accept the call."
            targetAddress={DISPUTE_TARGET}
            functionSignature="assignN2Mediator(uint256 disputeId, address mediator)"
            decodedArgs={`${dispute.onchain_dispute_id}, ${trimmed || "—"}`}
            calldata={calldata}
            error={error}
          />
        </div>
      ) : null}
    </article>
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
      data-testid="admin-loading"
      className="flex items-center justify-center gap-2 p-6 text-sm text-neutral-500 dark:text-celo-light/60"
    >
      <Spinner weight="regular" className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}
