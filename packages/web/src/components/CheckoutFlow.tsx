"use client";

import { useEffect } from "react";
import { useChainId } from "wagmi";

import { CheckoutErrorView } from "@/components/CheckoutErrorView";
import { CheckoutSellerStatus } from "@/components/CheckoutSellerStatus";
import { CheckoutSuccessView } from "@/components/CheckoutSuccessView";
import { Button } from "@/components/ui/button";
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
  const { state, start, cancel } = useSequentialCheckout(cart);
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

  if (state.phase === "idle") {
    const txCount = sellerCount === 1 ? "up to 3" : `up to ${1 + sellerCount * 2}`;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
          <h1 className="mb-4 text-xl font-semibold">Confirm checkout</h1>
          <div className="mb-6 space-y-3">
            <p className="text-base">
              {sellerCount} {sellerLabel} · {itemCount} items
            </p>
            <p className="text-base font-semibold tabular-nums">
              Total: {cart.total_usdt} USDT
            </p>
            <p className="text-sm text-neutral-600">
              You will sign {txCount} transactions (one USDT approval if
              needed, then create + fund per seller).
            </p>
          </div>
          <Button
            className="min-h-[44px] w-full text-base"
            onClick={start}
          >
            Start checkout
          </Button>
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
    <div className="min-h-screen p-4">
      <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-xl font-semibold">Processing checkout</h1>

        {state.phase === "allowance" ? (
          <div className="mb-4 rounded-md bg-blue-50 p-3 text-base text-blue-900">
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
    </div>
  );
}
