/**
 * Treasury revenue report — /treasury (ADR-059 follow-up).
 *
 * Owner-only: rendered only when the connected wallet is in the
 * treasury allowlist (the Safe + its owners). Anyone else gets a 404
 * (notFound) so the surface isn't even discoverable. The backend
 * enforces the same allowlist, so this is defence-in-depth, not the
 * sole gate.
 *
 * Shows per-source revenue tiles (commission / credits / boutique
 * creation fee) + a CSV export for accounting reconciliation against
 * the Safe's on-chain inflows.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useAccount } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  downloadRevenueCsv,
  fetchRevenueSummary,
  isTreasuryAdmin,
  type RevenueSummary,
} from "@/lib/treasury-api";

const SOURCE_LABELS: Record<string, string> = {
  commission: "Commission (1.8%)",
  credits: "Credits",
  creation_fee: "Shop creation",
  total: "Total",
};

function toParams(from: string, to: string): [string?, string?] {
  // Inclusive day bounds: from = start-of-day, to = end-of-day.
  return [
    from ? `${from}T00:00:00` : undefined,
    to ? `${to}T23:59:59` : undefined,
  ];
}

function TreasuryReport({ address }: { address: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [f, t] = toParams(from, to);
    try {
      setSummary(await fetchRevenueSummary(address, f, t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load revenue.");
    } finally {
      setLoading(false);
    }
  }, [address, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDownload = async () => {
    setDownloading(true);
    try {
      const [f, t] = toParams(from, to);
      await downloadRevenueCsv(address, f, t);
      toast.success("CSV downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  };

  const order = ["commission", "credits", "creation_fee", "total"] as const;

  return (
    <main id="main" className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-3xl font-semibold text-celo-dark dark:text-celo-light">
        Treasury revenue
      </h1>
      <p className="mb-6 text-base text-neutral-600 dark:text-celo-light/70">
        Revenue by source, reconcilable against the Safe&rsquo;s on-chain
        inflows. Commission is counted on completed orders.
      </p>

      {/* Date range */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-600 dark:text-celo-light/70">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block min-h-[44px] rounded-md border border-neutral-300 bg-white px-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
          />
        </label>
        <label className="text-sm text-neutral-600 dark:text-celo-light/70">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block min-h-[44px] rounded-md border border-neutral-300 bg-white px-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-bg dark:text-celo-light"
          />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="min-h-[44px] text-sm text-celo-forest underline dark:text-celo-forest-bright"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-base text-red-600 dark:text-celo-red-bright">
          {error}
        </p>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {order.map((key) => {
          const s = summary?.sources[key];
          return (
            <div
              key={key}
              className="rounded-2xl border border-celo-dark/[8%] bg-white p-4 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated"
              data-testid={`treasury-tile-${key}`}
            >
              <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                {SOURCE_LABELS[key]}
              </p>
              <p className="mt-1 text-xl font-semibold text-celo-dark dark:text-celo-light">
                {loading || !s ? "—" : `${s.total_usdt} USDT`}
              </p>
              <p className="text-sm text-neutral-500 dark:text-celo-light/60">
                {loading || !s ? "" : `${s.count} tx`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <Button
          type="button"
          onClick={onDownload}
          disabled={downloading || loading}
          className="min-h-[48px] w-full sm:w-auto"
          data-testid="treasury-download-csv"
        >
          {downloading ? "Preparing CSV…" : "Download CSV"}
        </Button>
        <p className="mt-2 text-sm text-neutral-500 dark:text-celo-light/60">
          One row per transaction (date, source, amount, tx reference,
          counterparty) plus a per-source recap.
        </p>
      </div>
    </main>
  );
}

export default function TreasuryPage() {
  const { address, isConnecting, isReconnecting } = useAccount();

  if (isConnecting || isReconnecting) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <p className="text-base text-neutral-500 dark:text-celo-light/60">
          Connecting to MiniPay…
        </p>
      </main>
    );
  }

  if (!isTreasuryAdmin(address)) {
    notFound();
  }

  return <TreasuryReport address={address as string} />;
}
