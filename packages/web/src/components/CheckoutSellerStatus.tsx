"use client";

import { Check, CircleNotch, X } from "@phosphor-icons/react";

import { buildExplorerUrl, shortHash } from "@/lib/checkout-orchestration";
import type { SellerExecution } from "@/hooks/useSequentialCheckout";

interface Props {
  seller: SellerExecution;
  isCurrent: boolean;
  chainId: number | undefined;
}

const STATUS_LABEL: Record<SellerExecution["status"], string> = {
  pending: "Waiting…",
  creating: "Creating order…",
  funding: "Funding order…",
  success: "Order funded",
  error: "Failed",
  canceled: "Canceled",
};

function StatusIcon({ status }: { status: SellerExecution["status"] }) {
  if (status === "creating" || status === "funding") {
    return <CircleNotch className="h-5 w-5 animate-spin text-blue-600" />;
  }
  if (status === "success") {
    return <Check className="h-5 w-5 text-green-600" />;
  }
  if (status === "error" || status === "canceled") {
    return <X className="h-5 w-5 text-neutral-400" />;
  }
  return (
    <span className="inline-block h-5 w-5 rounded-full border-2 border-neutral-300" />
  );
}

export function CheckoutSellerStatus({ seller, isCurrent, chainId }: Props) {
  const isActive = isCurrent && (seller.status === "creating" || seller.status === "funding");
  const wrapperClass = isActive
    ? "rounded-md border border-blue-300 bg-blue-50 p-3"
    : "rounded-md border border-neutral-200 p-3";

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-3">
        <StatusIcon status={seller.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">
            {seller.sellerShopName}
          </p>
          <p className="text-sm text-neutral-600">
            {STATUS_LABEL[seller.status]}
            {seller.orderId !== undefined ? ` · order #${seller.orderId.toString()}` : ""}
          </p>
          {seller.error ? (
            <p className="mt-1 text-sm text-red-700">{seller.error}</p>
          ) : null}
        </div>
      </div>

      {(seller.createTxHash || seller.fundTxHash) ? (
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
      ) : null}
    </div>
  );
}
