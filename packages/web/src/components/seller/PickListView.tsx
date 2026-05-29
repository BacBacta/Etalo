/**
 * PickListView — Vue B (item-centric) of the seller orders dashboard.
 *
 * Aggregates open (Funded + PartiallyShipped) orders by SKU so the
 * seller sees a single "Robe wax M × 12" row spanning N orders rather
 * than scrolling N order cards. Built for the multi-SKU multi-order
 * vendor — at scale the order-centric view becomes ergonomically
 * unusable for daily packing ops.
 *
 * The aggregation runs client-side off the same `SellerOrderItem[]`
 * payload OrdersTab already fetches — no extra round-trip. SKU key is
 * `(title, image_hash)` because line_items don't carry product_ids
 * (they're aggregated server-side from Order.product_ids → titles).
 *
 * Sort priority : earliest deadline first, then highest qty. SKUs
 * across orders with no deadline (shouldn't happen for shippable
 * orders, but defensive) sink to the bottom.
 */
"use client";

import { Package } from "@phosphor-icons/react";
import Image from "next/image";

import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import {
  aggregateOpenOrdersBySku,
  formatDuration,
  ipfsImageUrl,
  type AggregatedSku,
  type DeadlineUrgency,
} from "@/lib/sellerOrderHelpers";
import type { SellerOrderItem } from "@/lib/seller-api";

interface Props {
  orders: SellerOrderItem[];
}

const URGENCY_BADGE_CLASSES: Record<DeadlineUrgency, string> = {
  expired: "bg-rose-500 text-white",
  urgent: "bg-rose-500 text-white",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  safe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export function PickListView({ orders }: Props) {
  const skus = aggregateOpenOrdersBySku(orders);

  if (skus.length === 0) {
    return (
      <EmptyStateV5
        illustration="no-orders"
        title="Nothing to ship right now"
        description="Funded orders show up here grouped by article so you can pull stock in one trip."
      />
    );
  }

  return (
    <ul className="space-y-2" data-testid="pick-list">
      {skus.map((sku) => (
        <PickListRow key={sku.key} sku={sku} />
      ))}
    </ul>
  );
}

function PickListRow({ sku }: { sku: AggregatedSku }) {
  const imageUrl = ipfsImageUrl(sku.imageHash);
  const orderLabel =
    sku.orderCount === 1 ? "1 order" : `${sku.orderCount} orders`;

  return (
    <li
      data-testid="pick-list-row"
      className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-celo-dark-bg">
        {imageUrl ? (
          // next/image so the Vercel optimizer downscales the (up to
          // 2048 px) source to a ~48 px WebP — a plain <img> here would
          // ship the full-resolution original for a thumbnail.
          <Image
            src={imageUrl}
            alt=""
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package
            className="h-6 w-6 text-neutral-400 dark:text-celo-light/40"
            aria-hidden
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-medium text-neutral-900 dark:text-celo-light">
            {sku.title}
          </span>
          <span className="flex-shrink-0 text-base font-semibold tabular-nums text-neutral-900 dark:text-celo-light">
            × {sku.totalQty}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-600 tabular-nums dark:text-celo-light/70">
          <span>{orderLabel}</span>
          {sku.earliestUrgency && sku.earliestMsRemaining !== null ? (
            <span
              data-testid="pick-list-urgency"
              data-urgency={sku.earliestUrgency}
              className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${URGENCY_BADGE_CLASSES[sku.earliestUrgency]}`}
            >
              {sku.earliestUrgency === "expired"
                ? "Past deadline"
                : `Ship in ${formatDuration(sku.earliestMsRemaining)}`}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
