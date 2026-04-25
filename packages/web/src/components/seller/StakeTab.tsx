"use client";

import { useState } from "react";

import {
  StakeActionDialog,
  type StakeAction,
} from "@/components/seller/StakeActionDialog";
import { Button } from "@/components/ui/button";
import type { SellerProfileResponse } from "@/lib/seller-api";

interface Props {
  onchain: SellerProfileResponse;
  onProfileRefresh: () => void;
}

const TIER_LABEL: Record<string, string> = {
  None: "None",
  Starter: "Starter",
  Established: "Established",
  TopSeller: "Top Seller",
};

export function StakeTab({ onchain, onProfileRefresh }: Props) {
  const [action, setAction] = useState<StakeAction | null>(null);

  const tier = onchain.stake.tier;
  const amount = onchain.stake.amount_human;
  const activeSales = onchain.stake.active_sales;
  const hasStake = tier !== "None";

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

      <div className="flex flex-wrap gap-2">
        {!hasStake ? (
          <Button
            type="button"
            onClick={() => setAction("deposit")}
            className="min-h-[44px]"
          >
            Deposit stake
          </Button>
        ) : null}
        {hasStake ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAction("topUp")}
            className="min-h-[44px]"
          >
            Top up
          </Button>
        ) : null}
        {hasStake ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAction("withdraw")}
            className="min-h-[44px]"
          >
            Initiate withdrawal
          </Button>
        ) : null}
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

      {action ? (
        <StakeActionDialog
          open={action !== null}
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          action={action}
          currentTier={tier}
          onSuccess={onProfileRefresh}
        />
      ) : null}
    </div>
  );
}
