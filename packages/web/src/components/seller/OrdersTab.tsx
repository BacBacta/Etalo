"use client";

import { Package, Truck } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OrderDeliveryAddressCard } from "@/components/orders/OrderDeliveryAddressCard";
import { MarkGroupShippedDialog } from "@/components/seller/MarkGroupShippedDialog";
import { PickListView } from "@/components/seller/PickListView";
import { Button } from "@/components/ui/button";
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useMilestoneOnce } from "@/hooks/useMilestoneOnce";
import { fireMilestone } from "@/lib/confetti/milestones";
import { formatRowDate } from "@/lib/format";
import {
  fetchSellerOrders,
  type SellerOrderItem,
  type SellerOrdersPage,
} from "@/lib/seller-api";
import {
  buyerLabel,
  deadlineInfo,
  ipfsImageUrl,
  isShippable,
  statusBadgeClass,
  summarizeOrders,
  type DeadlineUrgency,
} from "@/lib/sellerOrderHelpers";
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

const URGENCY_DEADLINE_CLASSES: Record<DeadlineUrgency, string> = {
  expired: "bg-rose-100 text-rose-800",
  urgent: "bg-rose-100 text-rose-800",
  warn: "bg-amber-100 text-amber-800",
  safe: "bg-emerald-50 text-emerald-700",
};

type ViewMode = "orders" | "pick-list";

export function OrdersTab({ address }: Props) {
  const [data, setData] = useState<SellerOrdersPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [view, setView] = useState<ViewMode>("orders");
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

  const aggregate = useMemo(
    () => (data ? summarizeOrders(data.orders) : null),
    [data],
  );

  return (
    <div className="space-y-4">
      {/* Aggregate banner — sticky context bar above the list/pick view.
          Always rendered when there's at least one shippable order so
          the seller's "what to ship next" pressure is visible without
          scrolling. */}
      {aggregate && aggregate.shippableOrderCount > 0 ? (
        <div
          data-testid="orders-aggregate-banner"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 tabular-nums"
        >
          <span className="font-medium">
            To ship: {aggregate.shippableOrderCount}{" "}
            {aggregate.shippableOrderCount === 1 ? "order" : "orders"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {aggregate.totalItemsToShip}{" "}
            {aggregate.totalItemsToShip === 1 ? "article" : "articles"}
          </span>
          {aggregate.earliestDeadline ? (
            <>
              <span aria-hidden>·</span>
              <span
                data-testid="orders-aggregate-deadline"
                data-urgency={aggregate.earliestDeadline.urgency}
              >
                next deadline{" "}
                <span className="font-semibold">
                  {aggregate.earliestDeadline.urgency === "expired"
                    ? "past due"
                    : aggregate.earliestDeadline.label}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* View toggle — orders (per-buyer) vs pick list (per-SKU).
          Pick list aggregates open orders so a seller fulfilling 5 of
          the same SKU sees `× 5` instead of 5 separate cards. */}
      <div
        role="tablist"
        aria-label="Orders view"
        className="inline-flex rounded-md border border-neutral-200 p-1"
        data-testid="orders-view-toggle"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "orders" ? "true" : "false"}
          onClick={() => setView("orders")}
          className={`min-h-[40px] rounded px-3 text-sm font-medium ${
            view === "orders"
              ? "bg-neutral-900 text-white"
              : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "pick-list" ? "true" : "false"}
          onClick={() => setView("pick-list")}
          className={`min-h-[40px] rounded px-3 text-sm font-medium ${
            view === "pick-list"
              ? "bg-neutral-900 text-white"
              : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          <Package className="mr-1 inline h-4 w-4" aria-hidden />
          Pick list
        </button>
      </div>

      {view === "orders" ? (
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
      ) : null}

      {data === null ? (
        <div
          className="space-y-3"
          data-testid="orders-skeleton"
        >
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
        </div>
      ) : view === "pick-list" ? (
        <PickListView orders={data.orders} />
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
          {data.orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              onShipClick={() =>
                setShipTarget({
                  dbOrderId: o.id,
                  onchainOrderId: o.onchain_order_id,
                })
              }
            />
          ))}
        </ul>
      )}

      {data && view === "orders" && totalNum !== null && data.orders.length < totalNum ? (
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

interface OrderRowProps {
  order: SellerOrderItem;
  onShipClick: () => void;
}

function OrderRow({ order, onShipClick }: OrderRowProps) {
  const canShip = isShippable(order.global_status);
  const dl = deadlineInfo(order.funded_at, order.global_status);
  const buyer = buyerLabel(order.delivery_address_snapshot, order.onchain_order_id);
  const lineItems = order.line_items ?? [];

  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-base font-medium tabular-nums">
          Order #{order.onchain_order_id}
        </span>
        <span
          data-testid="order-row-status"
          className={`rounded px-2 py-1 text-sm ${statusBadgeClass(order.global_status)}`}
        >
          {order.global_status}
        </span>
      </div>
      <div className="text-sm text-neutral-600 tabular-nums">
        {buyer} · {formatRawUsdt(order.total_amount_usdt)} USDT ·{" "}
        {formatRowDate(order.created_at_chain)} · {order.item_count}{" "}
        {order.item_count === 1 ? "item" : "items"}
      </div>

      {/* Deadline countdown — only renders for shippable orders with a
          fund timestamp. Codes urgency via color so the seller can scan
          the list and prioritize without reading every label. */}
      {dl ? (
        <div
          data-testid="order-row-deadline"
          data-urgency={dl.urgency}
          className={`mt-2 inline-flex items-center rounded px-2 py-1 text-sm font-medium ${URGENCY_DEADLINE_CLASSES[dl.urgency]}`}
        >
          {dl.urgency === "expired"
            ? "Past auto-refund deadline"
            : `Ship in ${dl.label} or order auto-refunds`}
        </div>
      ) : null}

      {/* Line items — what to pull from shelves. Fallback row appears
          when product_ids is null (legacy / pre-product-snapshot orders). */}
      {lineItems.length > 0 ? (
        <ul
          className="mt-3 space-y-1.5"
          data-testid="order-row-line-items"
        >
          {lineItems.map((item, idx) => (
            <li
              key={`${order.id}-${idx}`}
              className="flex items-center gap-2 text-sm text-neutral-800"
            >
              {item.image_ipfs_hash ? (
                // Plain <img> — 28 px thumbnail, see PickListRow note.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ipfsImageUrl(item.image_ipfs_hash) ?? ""}
                  alt=""
                  className="h-7 w-7 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <Package
                  className="h-5 w-5 flex-shrink-0 text-neutral-400"
                  aria-hidden
                />
              )}
              <span className="flex-1 truncate">{item.title}</span>
              <span className="flex-shrink-0 font-medium tabular-nums">
                × {item.qty}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Mark shipped is the action this row exists to enable when
          status is Funded / PartiallyShipped — promoted to primary
          variant + positioned ABOVE the delivery card so the CTA is
          the first action a thumb reaches for. */}
      {canShip ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="default"
            onClick={onShipClick}
            className="min-h-[44px] text-base"
          >
            <Truck className="mr-2 h-4 w-4" />
            Mark shipped
          </Button>
        </div>
      ) : null}

      {/* Delivery snapshot — shown only when the buyer has funded
          (snapshot non-null). Pre-fund orders skip the entire card so
          the list stays scannable when many orders are still Created. */}
      <div className="mt-3">
        <OrderDeliveryAddressCard
          snapshot={order.delivery_address_snapshot ?? null}
          orderId={order.onchain_order_id}
          hideWhenEmpty
        />
      </div>
    </li>
  );
}
