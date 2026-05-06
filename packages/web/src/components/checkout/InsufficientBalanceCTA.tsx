"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { displayUsdtFromBigint } from "@/lib/usdt";
import {
  MINIPAY_DEEPLINKS,
  navigateToMiniPayDeeplink,
} from "@/lib/minipay-deeplinks";

interface Props {
  /** Shortfall in raw 6-decimal USDT units (bigint from useCheckoutBalanceGate). */
  deficitRaw: bigint;
  /**
   * Optional override for the navigation handler. Tests pass a stub
   * to assert the button behaviour without touching `window.location`.
   * Defaults to navigating to the MiniPay Add Cash deeplink.
   */
  onDeposit?: () => void;
}

const DEFICIT_ID = "insufficient-balance-deficit";

export function InsufficientBalanceCTA({ deficitRaw, onDeposit }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the deposit CTA when this component mounts so a
  // keyboard user can press Enter immediately. Pairs with aria-live
  // below to signal the state change to screen readers.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const handleDeposit =
    onDeposit ?? (() => navigateToMiniPayDeeplink("ADD_CASH"));

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-100"
      data-testid="insufficient-balance-cta"
    >
      <h2 className="mb-2 text-base font-semibold">
        Insufficient stablecoin balance
      </h2>
      <p id={DEFICIT_ID} className="mb-4 text-base">
        You need {displayUsdtFromBigint(deficitRaw)} more to complete
        this order. Deposit in MiniPay to continue.
      </p>
      <Button
        ref={buttonRef}
        onClick={handleDeposit}
        aria-describedby={DEFICIT_ID}
        className="min-h-[44px] w-full text-base"
        data-testid="deposit-in-minipay"
      >
        Deposit in MiniPay
      </Button>
      <p className="mt-3 text-sm text-amber-900/70 dark:text-amber-100/70">
        After your deposit completes, return to this tab — the balance
        re-checks automatically.
      </p>
    </div>
  );
}

// Re-export so tests can import the deeplink target without pulling
// the whole minipay-deeplinks module separately.
export { MINIPAY_DEEPLINKS };
