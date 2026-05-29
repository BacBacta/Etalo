"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useChainId } from "wagmi";

import { CheckoutSellerStatus } from "@/components/CheckoutSellerStatus";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { InsufficientBalanceCTA } from "@/components/checkout/InsufficientBalanceCTA";
import {
  ChainMismatchBanner,
  useChainMatch,
} from "@/components/wallet/ChainMismatchBanner";

// Note : CheckoutSellerStatus + InsufficientBalanceCTA were briefly
// dynamic-imported here as a /checkout bundle optimisation, but both
// are conversion-critical (the buyer must see the InsufficientBalanceCTA
// the moment the balance gate resolves, not after a chunk-fetch
// roundtrip). Reverted ; the existing CheckoutErrorView /
// CheckoutSuccessView lazy-loads below are the safe ones because
// they only mount post-tx, never on the critical first-paint path.

// Phase A P1 (2026-05-15) — Success + Error views are unreachable on
// initial page render (only mounted after the buyer signs ≥ 1 tx,
// which always pivots out of the idle phase). Dynamic-import them to
// shave their static-render cost (Phosphor icons + tx hash + explorer
// URL helpers) off the /checkout eager bundle. ssr:false because they
// only fire client-side post-tx ; loading: () => null because the
// parent already controls the visibility.
const CheckoutErrorView = dynamic(
  () =>
    import("@/components/CheckoutErrorView").then((m) => m.CheckoutErrorView),
  { ssr: false, loading: () => null },
);
const CheckoutSuccessView = dynamic(
  () =>
    import("@/components/CheckoutSuccessView").then(
      (m) => m.CheckoutSuccessView,
    ),
  { ssr: false, loading: () => null },
);
import {
  CheckoutDeliveryAddressStep,
  isCheckoutAddressReady,
} from "@/components/checkout/CheckoutDeliveryAddressStep";
import {
  EMPTY_INLINE_DELIVERY_FORM,
  type InlineDeliveryAddressData,
} from "@/components/checkout/InlineDeliveryAddressForm";
import { CheckoutProgressStepper } from "@/components/checkout/CheckoutProgressStepper";
import { PremiumOrderSummary } from "@/components/checkout/PremiumOrderSummary";
import { Button } from "@/components/ui/button";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";
import { useCheckoutBalanceGate } from "@/hooks/useCheckoutBalanceGate";
import { useSequentialCheckout } from "@/hooks/useSequentialCheckout";
import { useCartStore } from "@/lib/cart-store";
import type { ResolvedCart } from "@/lib/checkout";

interface Props {
  cart: ResolvedCart;
  token: string;
}

export function CheckoutFlow({ cart, token }: Props) {
  const { address: wallet } = useAccount();
  const walletStr = wallet?.toLowerCase() ?? "";
  // ADR-050 — buyer types address inline at checkout. Form data lives
  // here in the parent ; the InlineDeliveryAddressForm is fully
  // controlled. Snapshot persistence happens post-fund via
  // setOrderDeliverySnapshotInline (see useSequentialCheckout).
  const [deliveryFormData, setDeliveryFormData] =
    useState<InlineDeliveryAddressData>(EMPTY_INLINE_DELIVERY_FORM);

  const buyerCountryQuery = useBuyerCountry({ wallet: walletStr });
  const buyerCountry = buyerCountryQuery.data?.country ?? null;

  const addressReady = isCheckoutAddressReady({
    formData: deliveryFormData,
    expectedCountry: buyerCountry,
  });

  const { state, start, cancel } = useSequentialCheckout(cart, {
    deliveryFormData: addressReady ? deliveryFormData : null,
    token,
  });
  const chainId = useChainId();
  const { isMatch: chainMatches } = useChainMatch();

  // Stable references so the cleanup effect doesn't fire repeatedly.
  const clearSellerItems = useCartStore((s) => s.clearSellerItems);
  const clearCart = useCartStore((s) => s.clearCart);

  // Cart cleanup on terminal phases. Run once per phase transition.
  useEffect(() => {
    if (state.phase === "success") {
      clearCart();
    } else if (state.phase === "partial") {
      for (const seller of state.sellers) {
        if (seller.status === "success") {
          clearSellerItems(seller.sellerHandle);
        }
      }
    }
    // We intentionally depend on phase + sellers length: the sellers
    // array reference changes on every status update, but we only want
    // the cleanup to fire when phase enters the terminal states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.sellers.length, clearCart, clearSellerItems]);

  const sellerCount = cart.groups.length;

  // Pre-flight balance gate (J11 #1). Backend serializes total_usdt as
  // a Decimal-string ("25.98"); convert to raw 6-decimal bigint for
  // the on-chain balanceOf comparison.
  const requiredRaw = parseUnits(cart.total_usdt, 6);
  const balanceGate = useCheckoutBalanceGate(requiredRaw);

  if (state.phase === "idle") {
    const txCount = sellerCount === 1 ? "up to 3" : `up to ${1 + sellerCount * 2}`;
    return (
      <main
        id="main"
        className="min-h-screen bg-celo-light-subtle pb-32 dark:bg-celo-dark-bg"
      >
        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-6">
          <PremiumOrderSummary cart={cart} buyerCountry={buyerCountry} />

          {walletStr ? (
            <>
              <CheckoutDeliveryAddressStep
                wallet={walletStr}
                value={deliveryFormData}
                onChange={setDeliveryFormData}
                expectedCountry={buyerCountry}
              />

              <ChainMismatchBanner />

              {balanceGate.hasInsufficient ? (
                <InsufficientBalanceCTA deficitRaw={balanceGate.deficitRaw} />
              ) : null}
            </>
          ) : (
            // ADR-053 — no wallet detected (Chrome without injected
            // provider, or MiniPay still spinning up its connector).
            // Surface the ConnectWalletButton instead of a disabled
            // Start-checkout the user can't do anything with. The
            // button auto-shows "Connect wallet" if MetaMask/Trust
            // is injected, "Get MiniPay" otherwise.
            <div
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
              data-testid="checkout-connect-prompt"
            >
              <p className="mb-3 text-base text-celo-dark dark:text-celo-light">
                Connect a wallet to enter your delivery address and pay with
                USDT escrow.
              </p>
              <ConnectWalletButton />
            </div>
          )}
        </div>

        {walletStr && !balanceGate.hasInsufficient ? (
          // Sticky bottom CTA — keeps "Start checkout" within reach
          // however far the buyer scrolls through the delivery form,
          // which is the recurring pain point on long African form
          // fills. Pairs the action button with a single quiet line
          // recapping the sign cost so the buyer commits with eyes
          // open. Safe-area inset preserves the home-bar gap on iOS.
          <div
            className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-4 pb-[env(safe-area-inset-bottom,0)] pt-3"
            data-testid="checkout-sticky-cta"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-celo-md backdrop-blur dark:border-celo-light/10 dark:bg-celo-dark-elevated/95">
              <Button
                className="min-h-[48px] w-full text-base"
                onClick={start}
                disabled={
                  balanceGate.isLoading || !addressReady || !chainMatches
                }
                data-testid="checkout-start"
              >
                {addressReady
                  ? `Pay ${Number(cart.total_usdt).toFixed(2)} USDT`
                  : "Fill the delivery address to continue"}
              </Button>
              <p className="mt-1.5 text-center text-sm text-neutral-500 dark:text-celo-light/55">
                You&apos;ll sign {txCount} {txCount === "up to 3" ? "txs" : "transactions"}.
                Escrow holds funds until delivery.
              </p>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  if (state.phase === "success") {
    return <CheckoutSuccessView sellers={state.sellers} chainId={chainId} />;
  }

  if (
    state.phase === "partial" ||
    state.phase === "canceled" ||
    state.phase === "error"
  ) {
    return (
      <CheckoutErrorView
        sellers={state.sellers}
        phase={state.phase}
        globalError={state.globalError}
        chainId={chainId}
      />
    );
  }

  // Phases: 'allowance' | 'executing' — show progress.
  // approveSkipped lets the stepper render the approve dot as already
  // done for buyers whose USDT allowance was sufficient at idle time
  // (the hook skips the approve writeContract in that case). We infer
  // it from state.approveTxHash : absent in executing phase = skipped.
  const approveSkipped =
    state.phase === "executing" && !state.approveTxHash;
  return (
    <main
      id="main"
      className="min-h-screen bg-celo-light-subtle p-4 dark:bg-celo-dark-bg"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated">
        <div className="mb-5">
          <CheckoutProgressStepper
            phase={state.phase}
            sellers={state.sellers}
            approveSkipped={approveSkipped}
          />
        </div>

        {state.phase === "allowance" ? (
          <div className="mb-4 rounded-md bg-celo-yellow-soft p-3 text-base text-celo-dark dark:bg-celo-yellow/20 dark:text-celo-light">
            Approving USDT spending in your wallet…
            <span className="ml-1 text-sm text-neutral-600 dark:text-celo-light/60">
              one-time per cart total
            </span>
          </div>
        ) : null}

        <div className="space-y-3">
          {state.sellers.map((seller, i) => (
            <CheckoutSellerStatus
              key={seller.sellerHandle}
              seller={seller}
              isCurrent={i === state.currentSellerIndex}
              chainId={chainId}
            />
          ))}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg bg-celo-forest-soft px-3 py-2.5 text-sm text-celo-forest-dark dark:bg-celo-forest-bright-soft dark:text-celo-forest-bright">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-current"
          />
          <p>
            Each paid seller is now held in escrow. Auto-release in 3 days
            if you don&apos;t flag a problem.
          </p>
        </div>

        <Button
          variant="outline"
          className="mt-5 min-h-[44px] w-full text-base"
          onClick={cancel}
        >
          Cancel remaining
        </Button>

        <p className="mt-3 text-center text-sm text-neutral-500 dark:text-celo-light/55">
          Cancel only stops upcoming transactions. Sellers already paid
          stay paid; auto-refund kicks in if items don&apos;t ship.
        </p>
      </div>
    </main>
  );
}
