"use client";

import { Coins } from "lucide-react";

import { useCreditsBalance } from "@/hooks/useCreditsBalance";

interface Props {
  /** Optional callback. When supplied, a "Buy more" affordance is
   * rendered. Block 7b will pass an actual handler that opens the
   * BuyCreditsDialog (wagmi USDT approve + EtaloCredits.purchaseCredits
   * tx). For now the button is disabled with a "coming soon" hint. */
  onBuyClick?: () => void;
}

const LOW_BALANCE_THRESHOLD = 5;

export function CreditsBalance({ onBuyClick }: Props) {
  const { balance, loading, error } = useCreditsBalance();

  return (
    <div
      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4"
      data-testid="credits-balance"
    >
      <div className="flex items-center gap-3">
        <Coins className="h-6 w-6 text-amber-600" aria-hidden />
        <div>
          <div className="text-sm text-neutral-600">Marketing credits</div>
          <div className="text-xl font-semibold" data-testid="credits-amount">
            {loading ? "…" : error ? "?" : `${balance} credits`}
          </div>
          {!loading && !error && balance < LOW_BALANCE_THRESHOLD && (
            <div
              className="mt-1 text-sm text-amber-700"
              data-testid="low-balance-warning"
            >
              Low balance — purchase more soon
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onBuyClick}
        disabled
        title="Coming Block 7b"
        className="cursor-not-allowed text-sm text-neutral-500 underline disabled:opacity-50"
      >
        Buy more (Block 7b)
      </button>
    </div>
  );
}
