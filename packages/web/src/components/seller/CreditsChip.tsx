/**
 * CreditsChip — persistent credit-balance pill + purchase entry for the
 * seller dashboard header.
 *
 * ADR-049 exposed photo enhancement (which spends credits) in the
 * add-product flow, but the balance + purchase UI used to live only in
 * the hidden MarketingTab. This chip makes the balance always visible and
 * gives a one-tap path to buy more, independent of that tab.
 */
"use client";

import { Coins } from "@phosphor-icons/react";
import { useState } from "react";

import { BuyCreditsDialog } from "@/components/seller/marketing/BuyCreditsDialog";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";

export function CreditsChip() {
  const creditsQuery = useCreditsBalance();
  const [buyOpen, setBuyOpen] = useState(false);

  const balance = creditsQuery.data?.balance ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setBuyOpen(true)}
        data-testid="credits-chip"
        aria-label={`${balance} credits — buy more`}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-pill border border-celo-forest/30 bg-celo-forest-soft px-3 text-sm font-medium text-celo-forest transition-colors hover:bg-celo-forest/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-forest-bright/30 dark:bg-celo-forest-bright-soft dark:text-celo-forest-bright"
      >
        <Coins weight="fill" className="h-4 w-4" aria-hidden />
        {creditsQuery.isLoading ? "…" : balance}
        <span className="text-celo-forest/70 dark:text-celo-forest-bright/70">
          {balance === 1 ? "credit" : "credits"}
        </span>
        <span aria-hidden className="ml-0.5 text-base leading-none">
          +
        </span>
      </button>

      {/* BuyCreditsDialog self-reconciles the balance (optimistic update
          + indexer-lag poll), so no invalidate here. */}
      <BuyCreditsDialog open={buyOpen} onOpenChange={setBuyOpen} />
    </>
  );
}
