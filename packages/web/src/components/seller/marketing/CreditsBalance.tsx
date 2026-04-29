"use client";

import { Coins } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { BuyCreditsDialog } from "@/components/seller/marketing/BuyCreditsDialog";
import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";

const LOW_BALANCE_THRESHOLD = 5;

// Indexer mirrors CreditsPurchased on its 30s polling cycle. We poll
// /credits/balance up to 4 times (10s, 20s, 30s, 40s) after a
// successful purchase so the balance updates quickly without forcing
// the seller to refresh manually.
const POST_BUY_POLL_DELAYS_MS = [10_000, 20_000, 30_000, 40_000] as const;

export function CreditsBalance() {
  const { balance, loading, error, refetch } = useCreditsBalance();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Cancel any pending polls when the component unmounts or a new
  // purchase succeeds before the previous one's polls have finished.
  const pollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPolls = () => {
    for (const t of pollTimersRef.current) clearTimeout(t);
    pollTimersRef.current = [];
  };
  useEffect(() => clearPolls, []);

  const onPurchaseSuccess = () => {
    clearPolls();
    void refetch();
    for (const delay of POST_BUY_POLL_DELAYS_MS) {
      pollTimersRef.current.push(
        setTimeout(() => {
          void refetch();
        }, delay),
      );
    }
  };

  return (
    <>
      <div
        className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4"
        data-testid="credits-balance"
      >
        <div className="flex items-center gap-3">
          <Coins className="h-6 w-6 text-amber-600" aria-hidden />
          <div>
            <div className="text-sm text-neutral-600">Marketing credits</div>
            <div className="text-xl font-semibold" data-testid="credits-amount">
              {loading ? (
                "…"
              ) : error ? (
                "?"
              ) : (
                <AnimatedNumber value={balance} decimals={0} suffix=" credits" />
              )}
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
          onClick={() => setDialogOpen(true)}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800 min-h-[44px]"
          data-testid="buy-more-btn"
        >
          Buy more
        </button>
      </div>

      <BuyCreditsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onPurchaseSuccess}
      />
    </>
  );
}
