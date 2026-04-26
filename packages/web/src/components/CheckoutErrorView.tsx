"use client";

import Link from "next/link";

import { CheckoutSellerStatus } from "@/components/CheckoutSellerStatus";
import type {
  CheckoutPhase,
  SellerExecution,
} from "@/hooks/useSequentialCheckout";

interface Props {
  sellers: SellerExecution[];
  phase: CheckoutPhase;
  globalError?: string;
  chainId: number | undefined;
}

const TITLES: Record<"partial" | "canceled" | "error", string> = {
  partial: "Partial checkout",
  canceled: "Checkout canceled",
  error: "Checkout failed",
};

export function CheckoutErrorView({
  sellers,
  phase,
  globalError,
  chainId,
}: Props) {
  const title =
    phase === "partial"
      ? `${sellers.filter((s) => s.status === "success").length} of ${sellers.length} ${
          sellers.length === 1 ? "order" : "orders"
        } complete`
      : TITLES[phase as "canceled" | "error"];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>

        {globalError ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-base text-red-800">
            {globalError}
          </div>
        ) : null}

        <div className="mb-6 space-y-3">
          {sellers.map((seller) => (
            <CheckoutSellerStatus
              key={seller.sellerHandle}
              seller={seller}
              isCurrent={false}
              chainId={chainId}
            />
          ))}
        </div>

        <div className="space-y-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
          >
            Back to Etalo
          </Link>
          <p className="text-center text-sm text-neutral-500">
            Funded orders are protected by escrow and auto-refund if items
            don&apos;t ship.
          </p>
        </div>
      </div>
    </div>
  );
}
