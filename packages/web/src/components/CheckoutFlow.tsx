"use client";

import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useChainId } from "wagmi";

import { CheckoutErrorView } from "@/components/CheckoutErrorView";
import { CheckoutSellerStatus } from "@/components/CheckoutSellerStatus";
import { CheckoutSuccessView } from "@/components/CheckoutSuccessView";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { InsufficientBalanceCTA } from "@/components/checkout/InsufficientBalanceCTA";
import {
  CheckoutDeliveryAddressStep,
  isCheckoutAddressReady,
} from "@/components/checkout/CheckoutDeliveryAddressStep";
import {
  EMPTY_INLINE_DELIVERY_FORM,
  type InlineDeliveryAddressData,
} from "@/components/checkout/InlineDeliveryAddressForm";
import { Button } from "@/components/ui/button";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";
import { useCheckoutBalanceGate } from "@/hooks/useCheckoutBalanceGate";
import { useSequentialCheckout } from "@/hooks/useSequentialCheckout";
import { useCartStore } from "@/lib/cart-store";
import type { ResolvedCart } from "@/lib/checkout";

interface Props {
  cart: ResolvedCart;
  // token: kept on signature for future Block 7 (order tracking link
  // back) — currently used only as cancellation context, not rendered.
  token: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  });
  const chainId = useChainId();

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

  const itemCount = cart.groups.reduce((sum, g) => sum + g.items.length, 0);
  const sellerCount = cart.groups.length;
  const sellerLabel = sellerCount === 1 ? "seller" : "sellers";

  // Pre-flight balance gate (J11 #1). Backend serializes total_usdt as
  // a Decimal-string ("25.98"); convert to raw 6-decimal bigint for
  // the on-chain balanceOf comparison.
  const requiredRaw = parseUnits(cart.total_usdt, 6);
  const balanceGate = useCheckoutBalanceGate(requiredRaw);

  if (state.phase === "idle") {
    const txCount = sellerCount === 1 ? "up to 3" : `up to ${1 + sellerCount * 2}`;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow dark:bg-celo-dark-elevated dark:shadow-none dark:ring-1 dark:ring-celo-light/10">
          <h1 className="mb-4 text-xl font-semibold text-celo-dark dark:text-celo-light">
            Confirm checkout
          </h1>
          <div className="mb-6 space-y-3">
            <p className="text-base text-celo-dark dark:text-celo-light">
              {sellerCount} {sellerLabel} · {itemCount} items
            </p>
            <p className="text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
              Total: {cart.total_usdt} USDT
            </p>
            <p className="text-sm text-neutral-600 dark:text-celo-light/70">
              You will sign {txCount} transactions (one USDT approval if
              needed, then create + fund per seller).
            </p>
          </div>

          {walletStr ? (
            <>
              <div className="mb-4">
                <CheckoutDeliveryAddressStep
                  wallet={walletStr}
                  value={deliveryFormData}
                  onChange={setDeliveryFormData}
                  expectedCountry={buyerCountry}
                />
              </div>

              {balanceGate.hasInsufficient ? (
                <InsufficientBalanceCTA deficitRaw={balanceGate.deficitRaw} />
              ) : (
                <Button
                  className="min-h-[44px] w-full text-base"
                  onClick={start}
                  disabled={balanceGate.isLoading || !addressReady}
                  data-testid="checkout-start"
                >
                  {addressReady
                    ? "Start checkout"
                    : "Fill the delivery address to continue"}
                </Button>
              )}
            </>
          ) : (
            // ADR-053 — no wallet detected (Chrome without injected
            // provider, or MiniPay still spinning up its connector).
            // Surface the ConnectWalletButton instead of a disabled
            // Start-checkout the user can't do anything with. The
            // button auto-shows "Connect wallet" if MetaMask/Trust
            // is injected, "Get MiniPay" otherwise.
            <div
              className="flex flex-col items-stretch gap-3"
              data-testid="checkout-connect-prompt"
            >
              <p className="text-sm text-neutral-700 dark:text-celo-light/70">
                Connect a wallet to enter your delivery address and pay
                with USDT escrow.
              </p>
              <ConnectWalletButton />
            </div>
          )}
        </div>
      </div>
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
  return (
    <main id="main" className="min-h-screen p-4">
      <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow dark:bg-celo-dark-elevated dark:shadow-none dark:ring-1 dark:ring-celo-light/10">
        <h1 className="mb-4 text-xl font-semibold text-celo-dark dark:text-celo-light">
          Processing checkout
        </h1>

        {state.phase === "allowance" ? (
          <div className="mb-4 rounded-md bg-blue-50 p-3 text-base text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">
            Approving USDT spending… (one-time per cart total)
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

        <Button
          variant="outline"
          className="mt-6 min-h-[44px] w-full text-base"
          onClick={cancel}
        >
          Cancel remaining
        </Button>

        <p className="mt-3 text-center text-sm text-neutral-500">
          Cancel only stops upcoming transactions. Sellers already paid
          stay paid; auto-refund kicks in if items don&apos;t ship.
        </p>
      </div>
    </main>
  );
}
