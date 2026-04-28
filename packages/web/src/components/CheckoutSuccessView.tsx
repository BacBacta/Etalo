"use client";

import { Check } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buildExplorerUrl, shortHash } from "@/lib/checkout-orchestration";
import type { SellerExecution } from "@/hooks/useSequentialCheckout";

interface Props {
  sellers: SellerExecution[];
  chainId: number | undefined;
}

export function CheckoutSuccessView({ sellers, chainId }: Props) {
  const sellerCount = sellers.length;
  const sellerLabel = sellerCount === 1 ? "seller" : "sellers";
  const orderLabel = sellerCount === 1 ? "order" : "orders";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Check className="h-7 w-7 text-green-700" />
          </div>
          <h1 className="text-xl font-semibold">Checkout complete</h1>
          <p className="mt-1 text-base text-neutral-700">
            {sellerCount} {orderLabel} created across {sellerCount}{" "}
            {sellerLabel}.
          </p>
        </div>

        <div className="mb-6 space-y-3">
          {sellers.map((seller) => (
            <div
              key={seller.sellerHandle}
              className="rounded-md border border-neutral-200 p-3"
            >
              <p className="text-base font-medium">{seller.sellerShopName}</p>
              <p className="mt-1 text-sm text-neutral-600">
                Order #{seller.orderId?.toString() ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {seller.createTxHash ? (
                  <a
                    href={buildExplorerUrl(seller.createTxHash, chainId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    create {shortHash(seller.createTxHash)}
                  </a>
                ) : null}
                {seller.fundTxHash ? (
                  <a
                    href={buildExplorerUrl(seller.fundTxHash, chainId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    fund {shortHash(seller.fundTxHash)}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {/* /orders route lands in Block 7+. The link here is a stub
              and will resolve once the route exists. */}
          <Link
            href="/orders"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
          >
            View my orders
          </Link>
          <Link
            href="/"
            className="block text-center text-sm text-neutral-600 underline"
          >
            Browse more shops
          </Link>
        </div>
      </div>
    </div>
  );
}

// Re-export Button so the parent doesn't need to import it just to compose
// fallback CTAs. (Kept as named export for tree-shaking sanity.)
export { Button };
