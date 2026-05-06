/**
 * OrderStatusBadge — visual status pill for buyer + seller order
 * surfaces. J11.5 Block 3.D.
 *
 * Color taxonomy (WCAG AA on light + dark backgrounds) :
 * - neutral (slate)  : Created, Cancelled, Refunded — pre-fund or
 *                       terminal-no-funds-moved
 * - info (blue)      : Funded, *Shipped, *Delivered — money in flight
 * - success (green)  : Completed — terminal happy path
 * - alert (red)      : Disputed — needs attention
 *
 * Sized text-sm (14 px) per CLAUDE.md design rules — text-xs (12 px)
 * is forbidden for secondary labels. The pill is tall enough to reach
 * the 44 px touch target along with surrounding card padding.
 */
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/orders/state";

const STATUS_LABEL: Record<OrderStatus, string> = {
  Created: "Awaiting payment",
  Funded: "Paid",
  PartiallyShipped: "Partially shipped",
  AllShipped: "Shipped",
  PartiallyDelivered: "Partially delivered",
  Completed: "Completed",
  Disputed: "Dispute open",
  Refunded: "Refunded",
  Cancelled: "Cancelled",
};

// Tailwind class strings — pinned literals so the JIT picks them up.
const STATUS_CLASSES: Record<OrderStatus, string> = {
  Created:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  Funded:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  PartiallyShipped:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  AllShipped:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  PartiallyDelivered:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  Completed:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  Disputed:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  Refunded:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  Cancelled:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
};

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`Order status: ${STATUS_LABEL[status]}`}
      data-status={status}
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full font-medium text-sm whitespace-nowrap",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export { STATUS_LABEL as ORDER_STATUS_LABEL };
