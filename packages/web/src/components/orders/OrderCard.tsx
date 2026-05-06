/**
 * OrderCard — single buyer order summary row, click-through to detail.
 * J11.5 Block 3.D.
 *
 * Renders : seller_handle (CLAUDE.md rule 5 — never raw 0x), total
 * USDT, status badge, created date. Click navigates to
 * `/orders/[id]`. Keyboard-focusable, touch-target ≥ 44 px.
 *
 * Falls back to "Unknown shop" if seller_handle is null (seller hasn't
 * onboarded an off-chain profile yet — rare but possible since the
 * indexer can write Order rows before the seller has a User row).
 */
import Link from "next/link";

import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatRowDate } from "@/lib/format";
import type { OrderResponse } from "@/lib/orders/state";
import { formatRawUsdt } from "@/lib/usdt";
import { cn } from "@/lib/utils";

export interface OrderCardProps {
  order: OrderResponse;
  className?: string;
}

export function OrderCard({ order, className }: OrderCardProps) {
  const sellerLabel = order.seller_handle
    ? `@${order.seller_handle}`
    : "Unknown shop";

  return (
    <Link
      href={`/orders/${order.id}`}
      data-testid="order-card"
      data-order-id={order.id}
      className={cn(
        "block rounded-lg border border-slate-200 bg-white px-4 py-3",
        "hover:border-slate-300 hover:bg-slate-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
        "dark:border-celo-dark-surface dark:bg-celo-dark-bg dark:hover:border-celo-dark-surface/70",
        "transition-colors duration-150",
        // 44 px touch target via min-h
        "min-h-[44px]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-base text-slate-900 dark:text-celo-light truncate">
            {sellerLabel}
          </p>
          <p className="text-sm text-slate-500 dark:text-celo-light/60 tabular-nums">
            {formatRowDate(order.created_at_chain)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <p className="font-semibold text-base text-slate-900 dark:text-celo-light tabular-nums">
            {formatRawUsdt(order.total_amount_usdt)} USDT
          </p>
          <OrderStatusBadge status={order.global_status} />
        </div>
      </div>
    </Link>
  );
}
