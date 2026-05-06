/**
 * OrderItemsList — per-item state breakdown for /orders/[id].
 * J11.5 Block 4.C.
 *
 * Shows each item's status + price + (if relevant) shipment group
 * timestamps. The buyer sees this to understand which items have
 * shipped, which are awaiting confirmation, which are in dispute.
 */
import type {
  ItemStatus,
  OrderItemResponse,
  OrderResponse,
  ShipmentGroupResponse,
} from "@/lib/orders/state";
import { formatRawUsdt } from "@/lib/usdt";
import { cn } from "@/lib/utils";

const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  Pending: "Pending shipment",
  Shipped: "Shipped",
  Arrived: "Arrived",
  Delivered: "Delivered",
  Released: "Funds released",
  Disputed: "Dispute open",
  Refunded: "Refunded",
};

const ITEM_STATUS_CLASSES: Record<ItemStatus, string> = {
  Pending: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  Shipped: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  Arrived: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  Delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  Released:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  Disputed: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  Refunded: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
};

export interface OrderItemsListProps {
  order: OrderResponse;
  className?: string;
}

export function OrderItemsList({ order, className }: OrderItemsListProps) {
  const items = order.items ?? [];
  if (items.length === 0) {
    return null;
  }

  // Map shipment_groups by id for fast lookup.
  const groups = order.shipment_groups ?? [];
  const groupById = new Map<string, ShipmentGroupResponse>(
    groups.map((g) => [g.id, g]),
  );

  return (
    <section
      data-testid="order-items-list"
      aria-label="Order items"
      className={cn("flex flex-col gap-2", className)}
    >
      <h2 className="text-sm font-medium text-slate-700 dark:text-celo-light/80">
        Items ({items.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            group={item.shipment_group_id ? groupById.get(item.shipment_group_id) : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

interface OrderItemRowProps {
  item: OrderItemResponse;
  group: ShipmentGroupResponse | undefined;
}

function OrderItemRow({ item, group }: OrderItemRowProps) {
  return (
    <li
      data-testid="order-item-row"
      data-item-id={item.id}
      data-item-status={item.status}
      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-celo-dark-surface dark:bg-celo-dark-bg"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-slate-900 dark:text-celo-light">
          Item #{item.item_index + 1}
        </span>
        <span className="text-sm text-slate-500 dark:text-celo-light/60 tabular-nums">
          {formatRawUsdt(item.item_price_usdt)} USDT
        </span>
        {group?.shipped_at && (
          <span className="text-sm text-slate-500 dark:text-celo-light/60">
            Shipped {formatRowShortDate(group.shipped_at)}
          </span>
        )}
      </div>
      <span
        aria-label={`Item status: ${ITEM_STATUS_LABEL[item.status]}`}
        data-status={item.status}
        className={cn(
          "inline-flex items-center px-2.5 py-1 rounded-full font-medium text-sm whitespace-nowrap",
          ITEM_STATUS_CLASSES[item.status],
        )}
      >
        {ITEM_STATUS_LABEL[item.status]}
      </span>
    </li>
  );
}

function formatRowShortDate(iso: string): string {
  // Same locale-pin as `formatRowDate` in lib/format.ts but compact —
  // "May 4" instead of "May 4, 2026". Keeps the row dense without a
  // full date redundancy with the order header.
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export { ITEM_STATUS_LABEL };
