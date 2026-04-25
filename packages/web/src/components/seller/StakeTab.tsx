"use client";

import type { SellerProfileResponse } from "@/lib/seller-api";

interface Props {
  onchain: SellerProfileResponse;
}

const TIER_LABEL: Record<string, string> = {
  None: "None",
  Starter: "Starter",
  Established: "Established",
  TopSeller: "Top Seller",
};

export function StakeTab({ onchain }: Props) {
  const tier = onchain.stake.tier;
  const amount = onchain.stake.amount_human;
  const activeSales = onchain.stake.active_sales;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <h3 className="mb-2 text-lg font-semibold">
          Current tier: {TIER_LABEL[tier] ?? tier}
        </h3>
        <p className="text-base">{amount} USDT staked</p>
        <p className="mt-1 text-sm text-neutral-600">
          {activeSales} active sale{activeSales === 1 ? "" : "s"} ·{" "}
          {onchain.recent_orders_count} order
          {onchain.recent_orders_count === 1 ? "" : "s"} indexed
        </p>
      </div>

      <div className="space-y-2 text-sm text-neutral-600">
        <p>
          <strong>Starter</strong>: 10 USDT — required for cross-border
          orders.
        </p>
        <p>
          <strong>Established</strong>: 25 USDT — 20 orders + 60 days
          active.
        </p>
        <p>
          <strong>Top Seller</strong>: 50 USDT — 50 orders + 90 days
          without sanction (1.2% commission).
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm">
          Stake actions (deposit, withdraw, top-up) coming in Étape 8.4.
        </p>
      </div>
    </div>
  );
}
