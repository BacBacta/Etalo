/**
 * OrderDetailHeader — top of /orders/[id]. J11.5 Block 4.C.
 *
 * Renders : status badge, total USDT, seller @handle (links to the
 * boutique), order id short, created date. CLAUDE.md rule 5 — no raw
 * 0x. Falls back to "Unknown shop" if seller_handle is null.
 */
import Link from "next/link";

import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatRowDate } from "@/lib/format";
import type { OrderResponse } from "@/lib/orders/state";
import { formatRawUsdt } from "@/lib/usdt";
import { cn } from "@/lib/utils";

export interface OrderDetailHeaderProps {
  order: OrderResponse;
  className?: string;
}

export function OrderDetailHeader({ order, className }: OrderDetailHeaderProps) {
  const sellerLabel = order.seller_handle ?? null;

  return (
    <header
      data-testid="order-detail-header"
      className={cn(
        "flex flex-col gap-4 pb-4 border-b border-slate-200 dark:border-celo-dark-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-500 dark:text-celo-light/60">
            Order #{order.onchain_order_id}
          </p>
          <p className="text-sm text-slate-500 dark:text-celo-light/60 tabular-nums">
            {formatRowDate(order.created_at_chain)}
          </p>
        </div>
        <OrderStatusBadge status={order.global_status} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm text-slate-500 dark:text-celo-light/60">
            Shop
          </span>
          {sellerLabel ? (
            <Link
              href={`/${sellerLabel}`}
              className={cn(
                "font-medium text-base text-celo-forest hover:underline",
                "dark:text-celo-green",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 rounded-sm",
              )}
              data-testid="order-detail-seller-link"
            >
              @{sellerLabel}
            </Link>
          ) : (
            <span className="font-medium text-base text-slate-700 dark:text-celo-light/80">
              Unknown shop
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm text-slate-500 dark:text-celo-light/60">
            Total
          </span>
          <span
            className="font-semibold text-lg text-slate-900 dark:text-celo-light tabular-nums"
            data-testid="order-detail-total"
          >
            {formatRawUsdt(order.total_amount_usdt)} USDT
          </span>
        </div>
      </div>
    </header>
  );
}
