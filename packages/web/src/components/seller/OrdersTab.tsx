"use client";

import { useEffect, useState } from "react";

import {
  fetchSellerOrders,
  formatRawUsdt,
  type SellerOrdersPage,
} from "@/lib/seller-api";

interface Props {
  address: string;
}

// OrderStatus enum is title-case on the backend (Étape 8.1 gotcha).
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "Created", label: "Created" },
  { value: "Funded", label: "Funded" },
  { value: "PartiallyShipped", label: "Partially shipped" },
  { value: "AllShipped", label: "All shipped" },
  { value: "PartiallyDelivered", label: "Partially delivered" },
  { value: "Completed", label: "Completed" },
  { value: "Disputed", label: "Disputed" },
  { value: "Refunded", label: "Refunded" },
];

export function OrdersTab({ address }: Props) {
  const [data, setData] = useState<SellerOrdersPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetchSellerOrders(address, 1, 20, statusFilter || undefined)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, statusFilter]);

  const totalNum =
    data && typeof (data.pagination as Record<string, unknown>).total === "number"
      ? ((data.pagination as Record<string, unknown>).total as number)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="status-filter" className="text-base">
          Filter:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[44px] rounded-md border border-neutral-300 p-2 text-base"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {!data || data.orders.length === 0 ? (
        <p className="text-base text-neutral-600">
          No orders{statusFilter ? ` with status "${statusFilter}"` : " yet"}.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.orders.map((o) => {
            const buyerShort = `${o.buyer_address.slice(0, 6)}…${o.buyer_address.slice(-4)}`;
            return (
              <li
                key={o.id}
                className="rounded-md border border-neutral-200 p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-base font-medium">
                    Order #{o.onchain_order_id}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-1 text-sm">
                    {o.global_status}
                  </span>
                </div>
                <div className="text-sm text-neutral-600">
                  Buyer {buyerShort} · {formatRawUsdt(o.total_amount_usdt)}{" "}
                  USDT · {new Date(o.created_at_chain).toLocaleDateString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && totalNum !== null && data.orders.length < totalNum ? (
        <p className="text-sm text-neutral-500">
          Showing {data.orders.length} of {totalNum} — pagination coming.
        </p>
      ) : null}
    </div>
  );
}
