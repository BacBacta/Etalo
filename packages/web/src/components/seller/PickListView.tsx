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
  expired: "bg-rose-100 text-rose-800",
  urgent: "bg-rose-100 text-rose-800",
  warn: "bg-amber-100 text-amber-800",
  safe: "bg-emerald-50 text-emerald-700",
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
      className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 dark:border-celo-light/10"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100 dark:bg-celo-dark-elevated">
        {imageUrl ? (
          // Plain <img> avoids next/image domain config for a 48 px
          // thumbnail — bundle/perf cost is negligible at this size.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
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
              className={`rounded px-2 py-0.5 text-sm font-medium ${URGENCY_BADGE_CLASSES[sku.earliestUrgency]}`}
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
