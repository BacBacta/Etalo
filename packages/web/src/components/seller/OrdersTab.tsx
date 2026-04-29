"use client";

import { Truck } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MarkGroupShippedDialog } from "@/components/seller/MarkGroupShippedDialog";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { fireMilestone } from "@/lib/confetti/milestones";
import {
  fetchSellerOrders,
  formatRawUsdt,
  type SellerOrdersPage,
} from "@/lib/seller-api";

interface Props {
  address: string;
}

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

// Statuses where the seller can still mark items as shipped.
const SHIPPABLE_STATUSES = new Set(["Funded", "PartiallyShipped"]);

export function OrdersTab({ address }: Props) {
  const [data, setData] = useState<SellerOrdersPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [shipTarget, setShipTarget] = useState<{
    dbOrderId: string;
    onchainOrderId: number;
  } | null>(null);

  const refetch = useCallback(() => {
    fetchSellerOrders(address, 1, 20, statusFilter || undefined)
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [address, statusFilter]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // J10-V5 Block 7 — first-sale milestone. Track previous orders.length
  // and fire confetti when transition is 0 → ≥1 within the same mount.
  // Initial null → ≥1 (refetch lands with orders already present from a
  // past purchase) is NOT a first-sale event for this session, so the
  // ref stays null until the first refetch resolves.
  const prevOrdersCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const count = data.orders.length;
    const prev = prevOrdersCountRef.current;
    if (prev === 0 && count > 0) {
      fireMilestone("first-sale");
    }
    prevOrdersCountRef.current = count;
  }, [data]);

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

      {data === null ? (
        <div
          className="space-y-3"
          data-testid="orders-skeleton"
        >
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
        </div>
      ) : data.orders.length === 0 ? (
        <p className="text-base text-neutral-600">
          No orders{statusFilter ? ` with status "${statusFilter}"` : " yet"}.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.orders.map((o) => {
            const buyerShort = `${o.buyer_address.slice(0, 6)}…${o.buyer_address.slice(-4)}`;
            const canShip = SHIPPABLE_STATUSES.has(o.global_status);
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
                {canShip ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setShipTarget({
                          dbOrderId: o.id,
                          onchainOrderId: o.onchain_order_id,
                        })
                      }
                      className="min-h-[44px] text-base"
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Mark shipped
                    </Button>
                  </div>
                ) : null}
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

      {shipTarget ? (
        <MarkGroupShippedDialog
          open={shipTarget !== null}
          onOpenChange={(open) => {
            if (!open) setShipTarget(null);
          }}
          dbOrderId={shipTarget.dbOrderId}
          onchainOrderId={shipTarget.onchainOrderId}
          onSuccess={refetch}
        />
      ) : null}
    </div>
  );
}
