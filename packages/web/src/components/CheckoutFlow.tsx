"use client";

import type { ResolvedCart } from "@/lib/checkout";

interface Props {
  cart: ResolvedCart;
  // token: kept on signature so Étape 6.3 doesn't need a parent change.
  // Currently unused by the stub.
  token: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CheckoutFlow({ cart, token }: Props) {
  const itemCount = cart.groups.reduce((sum, g) => sum + g.items.length, 0);
  const sellerLabel = cart.groups.length === 1 ? "seller" : "sellers";

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="mb-3 text-xl font-semibold">MiniPay detected</h2>
        <p className="mb-4 text-base text-neutral-700">
          Multi-tx checkout flow coming in Étape 6.3.
        </p>
        <div className="space-y-1 text-sm text-neutral-600">
          <p>
            {cart.groups.length} {sellerLabel}
          </p>
          <p>{itemCount} items</p>
          <p>Total: {cart.total_usdt} USDT</p>
        </div>
      </div>
    </div>
  );
}
