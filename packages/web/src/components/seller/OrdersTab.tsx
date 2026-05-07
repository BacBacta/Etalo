"use client";

import { Truck } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderDeliveryAddressCard } from "@/components/orders/OrderDeliveryAddressCard";
import { MarkGroupShippedDialog } from "@/components/seller/MarkGroupShippedDialog";
import { Button } from "@/components/ui/button";
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useMilestoneOnce } from "@/hooks/useMilestoneOnce";
import { fireMilestone } from "@/lib/confetti/milestones";
import { formatRowDate } from "@/lib/format";
import {
  fetchSellerOrders,
  type SellerOrdersPage,
} from "@/lib/seller-api";
import { formatRawUsdt } from "@/lib/usdt";

// Block 6 sub-block 6.3 — MilestoneDialogV5 imported dynamically with
// ssr:false. The dialog is shown at most once per seller-wallet
// (guarded by useMilestoneOnce) AND only on the 0 → 1+ orders
// transition, so eager-loading its DialogV4 + ButtonV4 dependency
// chain (Radix + motion) for every dashboard mount is wasted weight.
// Static import busted the 280 kB strict First Load trigger by 1 kB
// on the first run of 6.3 ; lazy-loading reclaims the bundle budget.
// loading: () => null because the dialog renders into a Radix Portal
// that is invisible until `open` flips, so no fallback shape is
// required during the chunk fetch window.
const MilestoneDialogV5 = dynamic(
  () =>
    import("@/components/ui/v5/MilestoneDialog").then((mod) => ({
      default: mod.MilestoneDialogV5,
    })),
  { ssr: false, loading: () => null },
);

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
  //
  // Block 6 sub-block 6.3 extension : same trigger ALSO opens the
  // celebratory MilestoneDialogV5, gated by the cross-session one-shot
  // guard (useMilestoneOnce). Confetti continues to fire independently
  // — additive, not a replacement. Pattern : Robinhood transaction
  // success — confetti behind, dialog focal-point at the same moment.
  const prevOrdersCountRef = useRef<number | null>(null);
  const { shouldShow: showFirstSaleDialog, markShown: markFirstSaleShown } =
    useMilestoneOnce("first-sale");
  const [milestoneOpen, setMilestoneOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const count = data.orders.length;
    const prev = prevOrdersCountRef.current;
    if (prev === 0 && count > 0) {
      fireMilestone("first-sale");
      // Dialog open is gated by the persistent one-shot guard so a
      // seller who has already seen the celebration on a previous
      // device session doesn't get it re-fired.
      if (showFirstSaleDialog) {
        setMilestoneOpen(true);
      }
    }
    prevOrdersCountRef.current = count;
  }, [data, showFirstSaleDialog]);

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
        statusFilter ? (
          <p className="text-base text-neutral-600">
            No orders with status &ldquo;{statusFilter}&rdquo;.
          </p>
        ) : (
          <EmptyStateV5
            illustration="no-orders"
            title="No orders yet"
            description="Share your boutique link with customers to receive your first sale."
          />
        )
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
                  <span className="text-base font-medium tabular-nums">
                    Order #{o.onchain_order_id}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-1 text-sm">
                    {o.global_status}
                  </span>
                </div>
                <div className="text-sm text-neutral-600 tabular-nums">
                  Buyer {buyerShort} · {formatRawUsdt(o.total_amount_usdt)}{" "}
                  USDT · {formatRowDate(o.created_at_chain)} · {o.item_count}{" "}
                  {o.item_count === 1 ? "item" : "items"}
                </div>
                {/* Delivery snapshot — shipping context directly inline.
                    Pre-fund orders show the neutral "will appear once
                    funded" message ; post-fund orders show full address
                    + WhatsApp coordinate deeplink. ADR-044 / J11.7 Block 8
                    component reused here. */}
                <div className="mt-3">
                  <OrderDeliveryAddressCard
                    snapshot={o.delivery_address_snapshot ?? null}
                    orderId={o.onchain_order_id}
                  />
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
        <p className="text-sm text-neutral-500 tabular-nums">
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

      <MilestoneDialogV5
        open={milestoneOpen}
        onOpenChange={setMilestoneOpen}
        variant="first-sale"
        title="First sale!"
        description="Congratulations on your first completed order. Keep growing your boutique — momentum builds from here."
        ctaLabel="Continue"
        onCtaClick={markFirstSaleShown}
      />
    </div>
  );
}
