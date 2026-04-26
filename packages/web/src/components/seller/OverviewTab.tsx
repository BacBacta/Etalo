"use client";

import { useEffect, useState } from "react";

import {
  fetchSellerOrders,
  formatRawUsdt,
  type SellerOrdersPage,
  type SellerProfilePublic,
  type SellerProfileResponse,
} from "@/lib/seller-api";

interface Props {
  // J7 Block 7a: Marketing stub moved to its own MarketingTab. `profile`
  // is kept on the props for API compatibility with the dashboard
  // wiring; remove on the next OverviewTab refactor pass if still
  // unused.
  profile: SellerProfilePublic; // eslint-disable-line @typescript-eslint/no-unused-vars
  onchain: SellerProfileResponse;
  address: string;
}

const TIER_LABEL: Record<string, string> = {
  None: "None",
  Starter: "Starter",
  Established: "Established",
  TopSeller: "Top Seller",
};

export function OverviewTab({ onchain, address }: Props) {
  const [recent, setRecent] = useState<SellerOrdersPage | null>(null);

  useEffect(() => {
    fetchSellerOrders(address, 1, 5)
      .then(setRecent)
      .catch(() => setRecent(null));
  }, [address]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          label="Stake tier"
          value={TIER_LABEL[onchain.stake.tier] ?? onchain.stake.tier}
        />
        <StatCard
          label="Stake amount"
          value={`${onchain.stake.amount_human} USDT`}
        />
        <StatCard
          label="Recent orders"
          value={String(onchain.recent_orders_count)}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent orders</h2>
        {!recent || recent.orders.length === 0 ? (
          <p className="text-base text-neutral-600">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.orders.slice(0, 5).map((o) => (
              <li
                key={o.id}
                className="rounded-md border border-neutral-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium">
                    Order #{o.onchain_order_id}
                  </span>
                  <span className="text-sm text-neutral-600">
                    {o.global_status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  {formatRawUsdt(o.total_amount_usdt)} USDT ·{" "}
                  {new Date(o.created_at_chain).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-sm text-neutral-600">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
