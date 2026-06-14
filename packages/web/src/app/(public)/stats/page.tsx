"use client";

import {
  ChartLineUp,
  HandCoins,
  Receipt,
  ShieldCheck,
  Storefront,
  UsersThree,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { usePlatformStats } from "@/hooks/usePlatformStats";

// Public, on-chain platform metrics (MiniPay listing requirement §8).
// Everything is derived from the indexer's order mirror = on-chain truth.
export default function StatsPage() {
  const { data, isPending, isError } = usePlatformStats();

  return (
    <main id="main" className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-2">
        <p className="text-sm font-medium uppercase tracking-widest text-celo-forest/70 dark:text-celo-forest-bright/70">
          Etalo
        </p>
        <h1 className="font-display text-3xl font-semibold text-celo-dark dark:text-celo-light">
          Platform stats
        </h1>
        <p className="mt-2 text-base text-neutral-600 dark:text-celo-light/70">
          Live on-chain metrics from the Etalo escrow on{" "}
          {data?.network ?? "Celo mainnet"}. Every figure is computed from
          settled orders — nothing is self-reported.
        </p>
      </header>

      {isError ? (
        <p
          className="mt-8 rounded-xl border border-neutral-200 bg-white p-6 text-center text-base text-neutral-600 dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:text-celo-light/70"
          data-testid="stats-error"
        >
          Couldn&apos;t load stats right now. Please try again later.
        </p>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile
              label="Total volume (GMV)"
              value={data ? `${fmt(data.gmv_usdt)} USDT` : null}
              loading={isPending}
              icon={<ChartLineUp className="h-4 w-4" weight="bold" />}
              tone="emerald"
            />
            <Tile
              label="Completed orders"
              value={data ? num(data.completed_orders) : null}
              loading={isPending}
              icon={<Receipt className="h-4 w-4" weight="regular" />}
              tone="indigo"
            />
            <Tile
              label="Protocol fees"
              value={data ? `${fmt(data.commission_usdt)} USDT` : null}
              loading={isPending}
              icon={<HandCoins className="h-4 w-4" weight="regular" />}
              tone="amber"
            />
            <Tile
              label="Buyers"
              value={data ? num(data.unique_buyers) : null}
              loading={isPending}
              icon={<UsersThree className="h-4 w-4" weight="regular" />}
              tone="indigo"
            />
            <Tile
              label="Sellers"
              value={data ? num(data.unique_sellers) : null}
              loading={isPending}
              icon={<Storefront className="h-4 w-4" weight="regular" />}
              tone="indigo"
            />
            <Tile
              label="Dispute rate"
              value={data ? `${data.dispute_rate_pct}%` : null}
              loading={isPending}
              icon={<ShieldCheck className="h-4 w-4" weight="regular" />}
              tone="emerald"
            />
          </section>

          <section className="mt-4 rounded-2xl border border-celo-forest/20 bg-gradient-to-br from-celo-light to-celo-sand p-5 dark:border-celo-green/20 dark:from-celo-dark-elevated dark:to-celo-dark-surface">
            <h2 className="text-base font-semibold text-celo-dark dark:text-celo-light">
              Last 30 days
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <Stat
                label="Orders"
                value={data ? num(data.orders_30d) : null}
                loading={isPending}
              />
              <Stat
                label="Volume"
                value={data ? `${fmt(data.gmv_30d_usdt)} USDT` : null}
                loading={isPending}
              />
              <Stat
                label="All-time orders"
                value={data ? num(data.total_orders) : null}
                loading={isPending}
              />
            </div>
          </section>

          <p className="mt-6 text-sm text-neutral-500 dark:text-celo-light/50">
            GMV and protocol fees count settled (completed) orders. Usage
            metrics (active users, retention) are tracked separately and
            not shown here.
          </p>
        </>
      )}
    </main>
  );
}

function fmt(decimalStr: string): string {
  const n = Number(decimalStr);
  if (Number.isNaN(n)) return decimalStr;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

type Tone = "emerald" | "indigo" | "amber";

const TONE: Record<Tone, string> = {
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  indigo:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function Tile({
  label,
  value,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  icon: ReactNode;
  tone: Tone;
}) {
  return (
    <div
      className="min-h-[104px] rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.10),0_8px_24px_-6px_rgba(16,24,40,0.12)] dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:shadow-none dark:ring-1 dark:ring-white/[6%]"
      data-testid="stats-tile"
      data-label={label}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${TONE[tone]}`}
        >
          {icon}
        </span>
        <p className="text-sm font-medium text-celo-dark/70 dark:text-celo-light/70">
          {label}
        </p>
      </div>
      {loading || value === null ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-neutral-200 dark:bg-celo-dark-surface" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-celo-dark dark:text-celo-light">
          {value}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
        {label}
      </p>
      {loading || value === null ? (
        <div className="mt-1 h-6 w-20 animate-pulse rounded bg-celo-light/60 dark:bg-celo-dark-surface" />
      ) : (
        <p className="text-lg font-semibold tabular-nums text-celo-dark dark:text-celo-light">
          {value}
        </p>
      )}
    </div>
  );
}
