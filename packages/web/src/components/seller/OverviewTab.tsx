"use client";

import { useEffect, useState } from "react";

import { CardV4 } from "@/components/ui/v4/Card";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
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
  // Block 5 sub-block 5.1: stake-derived StatCard grid (Stake tier /
  // Stake amount / Recent orders) was retired per ADR-041 V1 scope.
  // `onchain` is kept on the prop signature for API parity with the
  // dashboard wiring; sub-block 5.4 will replace it with KPI tiles
  // sourced from useAnalyticsSummary (/api/v1/analytics/summary).
  onchain: SellerProfileResponse; // eslint-disable-line @typescript-eslint/no-unused-vars
  address: string;
}

export function OverviewTab({ address }: Props) {
  const [recent, setRecent] = useState<SellerOrdersPage | null>(null);

  useEffect(() => {
    fetchSellerOrders(address, 1, 5)
      .then(setRecent)
      .catch(() => setRecent(null));
  }, [address]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent orders</h2>
        {recent === null ? (
          <div className="space-y-3" data-testid="overview-skeleton">
            <SkeletonV5 variant="row" />
            <SkeletonV5 variant="row" />
            <SkeletonV5 variant="row" />
          </div>
        ) : recent.orders.length === 0 ? (
          <p className="text-base text-neutral-600">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <CardV4
                  variant="default"
                  padding="compact"
                  interactive={false}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium">
                      Order #{o.onchain_order_id}
                    </span>
                    <span className="text-sm text-celo-dark/60">
                      {o.global_status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-celo-dark/60">
                    {formatRawUsdt(o.total_amount_usdt)} USDT ·{" "}
                    {new Date(o.created_at_chain).toLocaleDateString()}
                  </div>
                </CardV4>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
