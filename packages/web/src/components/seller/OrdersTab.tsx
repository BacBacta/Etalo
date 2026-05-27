"use client";

import { Clock, Copy, MapPin, Package, Truck } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OrderDeliveryAddressCard } from "@/components/orders/OrderDeliveryAddressCard";
// MarkGroupShippedDialog was previously dynamic-imported (Phase A P0-2,
// ~10-15 kB saving), but MiniPay's WebView returned an error while
// fetching the chunk so the click had no observable effect and the
// seller couldn't ship. The bundle delta isn't worth a broken core
// flow ; switched to a static import.
import { MarkGroupShippedDialog } from "@/components/seller/MarkGroupShippedDialog";
import {
  SellerOrderDisputeSection,
  useOrderHasDispute,
} from "@/components/seller/SellerOrderDisputeSection";
import { PickListView } from "@/components/seller/PickListView";
import { Button } from "@/components/ui/button";
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useMilestoneOnce } from "@/hooks/useMilestoneOnce";
import {
  SELLER_ORDERS_QUERY_KEY,
  useSellerOrders,
} from "@/hooks/useSellerOrders";
import { fireMilestone } from "@/lib/confetti/milestones";
import { formatRowDate } from "@/lib/format";
import { type SellerOrderItem } from "@/lib/seller-api";
import {
  buyerLabel,
  deadlineInfo,
  ipfsImageUrl,
  isShippable,
  summarizeOrders,
  type DeadlineUrgency,
} from "@/lib/sellerOrderHelpers";
import { formatRawUsdt } from "@/lib/usdt";

// Block 6 sub-block 6.3 — MilestoneDialogV5 imported dynamically with
// ssr:false. The dialog is shown at most once per seller-wallet
// (guarded by useMilestoneOnce) AND only on the 0 → 1+ orders
// transition, so eager-loading its DialogV4 + ButtonV4 dependency
// chain (Radix + motion) for every dashboard mount is wasted weight.
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

// Status → dot color (Shopify pattern). Pre-fund / created = neutral,
// shippable orange (action needed), shipped blue (in transit),
// completed green, disputed red.
const STATUS_DOT_CLASSES: Record<string, string> = {
  Created: "bg-neutral-400",
  Funded: "bg-amber-500",
  PartiallyShipped: "bg-blue-500",
  AllShipped: "bg-blue-500",
  PartiallyDelivered: "bg-blue-600",
  Completed: "bg-emerald-500",
  Disputed: "bg-rose-500",
  Refunded: "bg-neutral-500",
};

// Per-urgency left-border + deadline-strip palette. The 4 px left
// border on each card lets the seller scan a long list and prioritize
// in one sweep (Shopify / Linear / Robinhood pattern).
const URGENCY_BORDER_CLASSES: Record<DeadlineUrgency, string> = {
  expired: "border-l-rose-500 dark:border-l-rose-400",
  urgent: "border-l-rose-500 dark:border-l-rose-400",
  warn: "border-l-amber-500 dark:border-l-amber-400",
  safe: "border-l-emerald-500 dark:border-l-emerald-400",
};

const URGENCY_STRIP_CLASSES: Record<DeadlineUrgency, string> = {
  expired:
    "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  urgent:
    "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  warn: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  safe: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
};

type ViewMode = "orders" | "pick-list";

export function OrdersTab({ address }: Props) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [view, setView] = useState<ViewMode>("orders");
  const [shipTarget, setShipTarget] = useState<{
    dbOrderId: string;
    onchainOrderId: number;
  } | null>(null);

  const ordersQuery = useSellerOrders({
    address,
    page: 1,
    pageSize: 20,
    status: statusFilter || undefined,
  });
  const data = ordersQuery.isPending || ordersQuery.isError
    ? null
    : (ordersQuery.data ?? null);

  // Optimistic "I just shipped this" set. Indexer lag means
  // `global_status` stays "Funded" for up to 30 s after the seller's
  // tx confirms — without this, the row stays in shippable state and
  // the seller can double-tap the action. We clear an id once the
  // refetched data shows the order has advanced past the shippable
  // statuses.
  const [optimisticallyShipped, setOptimisticallyShipped] = useState<
    Set<number>
  >(new Set());

  // Centralized invalidation point used after a successful
  // markShipped mutation. Also kicks off a 30 s burst of 5 s polls so
  // the optimistic state flips back to real data fast — beats waiting
  // for the next default 30 s indexer cycle.
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: SELLER_ORDERS_QUERY_KEY });
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 5_000;
      void queryClient.invalidateQueries({ queryKey: SELLER_ORDERS_QUERY_KEY });
      if (elapsed >= 30_000) clearInterval(interval);
    }, 5_000);
  }, [queryClient]);

  const handleShipSuccess = useCallback(
    (onchainOrderId: number) => {
      setOptimisticallyShipped((prev) => {
        const next = new Set(prev);
        next.add(onchainOrderId);
        return next;
      });
      refetch();
    },
    [refetch],
  );

  // Once the refetched order is no longer in a shippable state, drop
  // the optimistic id — the real status pill takes over.
  useEffect(() => {
    if (!data || optimisticallyShipped.size === 0) return;
    const stillShippable = new Set(
      data.orders
        .filter((o) => isShippable(o.global_status))
        .map((o) => o.onchain_order_id),
    );
    setOptimisticallyShipped((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (!stillShippable.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data, optimisticallyShipped.size]);

  // J10-V5 Block 7 — first-sale milestone confetti + dialog.
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
    <div className="space-y-5">
      {/* KPI tiles — replace the previous dense amber band. 3 metrics
          at a glance : open orders to ship, total items pending,
          next-deadline countdown (urgency-colored). */}
      {aggregate && aggregate.shippableOrderCount > 0 ? (
        <div
          data-testid="orders-aggregate-banner"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          <KpiTile
            label="To ship"
            value={String(aggregate.shippableOrderCount)}
            sub={
              aggregate.shippableOrderCount === 1 ? "order" : "orders"
            }
            icon={<Package className="h-4 w-4" weight="regular" />}
          />
          <KpiTile
            label="Items"
            value={String(aggregate.totalItemsToShip)}
            sub={
              aggregate.totalItemsToShip === 1 ? "article" : "articles"
            }
            icon={<Truck className="h-4 w-4" weight="regular" />}
          />
          <KpiTile
            label="Next deadline"
            value={
              aggregate.earliestDeadline
                ? aggregate.earliestDeadline.urgency === "expired"
                  ? "Past due"
                  : aggregate.earliestDeadline.label
                : "—"
            }
            sub={aggregate.earliestDeadline ? "remaining" : ""}
            urgency={aggregate.earliestDeadline?.urgency}
            testId="orders-aggregate-deadline"
            icon={<Clock className="h-4 w-4" weight="regular" />}
          />
        </div>
      ) : null}

      {/* View toggle — orders (per-buyer) vs pick list (per-SKU). */}
      <div
        role="tablist"
        aria-label="Orders view"
        className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1 dark:border-celo-light/15 dark:bg-celo-dark-elevated"
        data-testid="orders-view-toggle"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setView(view === "orders" ? "pick-list" : "orders");
          } else if (e.key === "Home") {
            e.preventDefault();
            setView("orders");
          } else if (e.key === "End") {
            e.preventDefault();
            setView("pick-list");
          }
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "orders" ? "true" : "false"}
          tabIndex={view === "orders" ? 0 : -1}
          onClick={() => setView("orders")}
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${
            view === "orders"
              ? "bg-celo-dark text-celo-light shadow-sm dark:bg-celo-light dark:text-celo-dark"
              : "text-neutral-700 hover:text-celo-dark dark:text-celo-light/70 dark:hover:text-celo-light"
          }`}
        >
          Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "pick-list" ? "true" : "false"}
          tabIndex={view === "pick-list" ? 0 : -1}
          onClick={() => setView("pick-list")}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest ${
            view === "pick-list"
              ? "bg-celo-dark text-celo-light shadow-sm dark:bg-celo-light dark:text-celo-dark"
              : "text-neutral-700 hover:text-celo-dark dark:text-celo-light/70 dark:hover:text-celo-light"
          }`}
        >
          <Package className="h-4 w-4" aria-hidden />
          Pick list
        </button>
      </div>

      {view === "orders" ? (
        <div className="flex items-center gap-2">
          <label
            htmlFor="status-filter"
            className="text-sm text-neutral-600 dark:text-celo-light/70"
          >
            Filter:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[44px] flex-1 rounded-md border border-neutral-300 bg-white px-3 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light sm:flex-none"
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
        <div className="space-y-3" data-testid="orders-skeleton">
          <SkeletonV5 variant="card" className="h-32" />
          <SkeletonV5 variant="card" className="h-32" />
          <SkeletonV5 variant="card" className="h-32" />
        </div>
      ) : view === "pick-list" ? (
        <PickListView orders={data.orders} />
      ) : data.orders.length === 0 ? (
        statusFilter ? (
          <p className="text-base text-neutral-600 dark:text-celo-light/70">
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
        <ul className="space-y-3">
          {data.orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              sellerAddress={address}
              optimisticShipped={optimisticallyShipped.has(o.onchain_order_id)}
              onShipClick={() => {
                setShipTarget({
                  dbOrderId: o.id,
                  onchainOrderId: o.onchain_order_id,
                });
              }}
            />
          ))}
        </ul>
      )}

      {data && view === "orders" && totalNum !== null && data.orders.length < totalNum ? (
        <p className="text-sm text-neutral-500 tabular-nums dark:text-celo-light/60">
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
          onSuccess={() => handleShipSuccess(shipTarget.onchainOrderId)}
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

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  urgency?: DeadlineUrgency;
  testId?: string;
}

function KpiTile({ label, value, sub, icon, urgency, testId }: KpiTileProps) {
  const urgencyText =
    urgency === "expired" || urgency === "urgent"
      ? "text-rose-700 dark:text-rose-300"
      : urgency === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : urgency === "safe"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-celo-dark dark:text-celo-light";
  return (
    <div
      data-testid={testId}
      data-urgency={urgency}
      className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <div className="mb-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-celo-light/60">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-semibold tabular-nums ${urgencyText}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-sm text-neutral-500 dark:text-celo-light/50">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

interface OrderRowProps {
  order: SellerOrderItem;
  onShipClick: () => void;
  // True from the moment the seller's ship tx confirms until the
  // indexer-updated `global_status` no longer reports the order as
  // shippable. Drives the "syncing" pill + button hide so the seller
  // can't double-tap during the 0-30 s indexer lag.
  optimisticShipped: boolean;
  // Seller's own wallet — passed down to the inline dispute section
  // so N1ResolutionCard knows which party the current user is.
  sellerAddress: string;
}

// memo'd : OrdersTab renders 20+ rows in a .map() and the parent
// state (search input, filter chips, ship-dialog open) changes
// frequently. `order` is referentially stable per row across parent
// re-renders ; `onShipClick` is a closure — consumers should pass a
// useCallback-stabilised handler for memo to bite.
const OrderRow = memo(function OrderRow({
  order,
  onShipClick,
  optimisticShipped,
  sellerAddress,
}: OrderRowProps) {
  const canShip = isShippable(order.global_status) && !optimisticShipped;
  const dl = deadlineInfo(order.funded_at, order.global_status);
  const buyer = buyerLabel(order.delivery_address_snapshot, order.onchain_order_id);
  const lineItems = order.line_items ?? [];
  const snapshot = order.delivery_address_snapshot ?? null;
  // Dispute escalation : when any item is in dispute, override the
  // ship-deadline visual (which is meaningless mid-dispute) with a
  // rose border + badge so the seller spots the row immediately.
  // Cache slot is shared with SellerOrderDisputeSection below so this
  // hook adds zero network round-trips for the common case.
  const hasDispute = useOrderHasDispute(order.id, order.global_status);

  // 4 px left border keyed to urgency lets sellers scan a long list and
  // pick what to ship next without reading every label. Falls back to
  // a neutral border for orders without an active deadline (Created /
  // Completed / Disputed / Refunded). Disputes win over urgency.
  const borderColor = hasDispute
    ? "border-l-rose-500 dark:border-l-rose-400"
    : dl
      ? URGENCY_BORDER_CLASSES[dl.urgency]
      : "border-l-neutral-200 dark:border-l-celo-light/10";

  const statusDotColor =
    STATUS_DOT_CLASSES[order.global_status] ?? "bg-neutral-400";

  const handleCopyAddress = () => {
    if (!snapshot) return;
    const lines = [
      snapshot.recipient_name,
      snapshot.address_line,
      snapshot.area,
      [snapshot.city, snapshot.region].filter(Boolean).join(", "),
      snapshot.country,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard
      .writeText(lines)
      .then(() => toast.success("Address copied"))
      .catch(() => toast.error("Couldn't copy"));
  };

  return (
    <li
      className={`overflow-hidden rounded-xl border border-neutral-200 border-l-4 bg-white dark:border-celo-light/10 dark:bg-celo-dark-elevated ${borderColor}`}
    >
      {/* Header strip : order id + status + amount. Distinct visual
          band so the list reads like a feed of cards, not a flat
          stack of paragraphs. */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3 dark:border-celo-light/10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${statusDotColor}`}
          />
          <span
            data-testid="order-row-status"
            className="text-sm font-medium text-celo-dark dark:text-celo-light"
          >
            {order.global_status}
          </span>
          <span
            aria-hidden
            className="text-neutral-300 dark:text-celo-light/30"
          >
            ·
          </span>
          <span className="truncate text-sm tabular-nums text-neutral-500 dark:text-celo-light/60">
            #{order.onchain_order_id}
          </span>
          {hasDispute ? (
            <span
              data-testid="order-row-dispute-badge"
              className="ml-1 inline-flex flex-shrink-0 items-center rounded-full bg-rose-100 px-2 py-0.5 text-sm font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
            >
              Dispute
            </span>
          ) : null}
        </div>
        <span className="flex-shrink-0 text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
          {formatRawUsdt(order.total_amount_usdt)} USDT
        </span>
      </div>

      {/* Body : buyer + date + item count, more compact than the previous
          dense one-line `·`-separated string. Two visible rows now :
          a primary "buyer" line and a small meta line. */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BuyerAvatar label={buyer} />
            <span className="truncate text-base font-medium text-celo-dark dark:text-celo-light">
              {buyer}
            </span>
          </div>
          <span className="flex-shrink-0 text-sm text-neutral-500 tabular-nums dark:text-celo-light/60">
            {formatRowDate(order.created_at_chain)}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-neutral-500 dark:text-celo-light/60">
          {order.item_count} {order.item_count === 1 ? "item" : "items"}
        </div>
      </div>

      {/* Deadline strip — full-width band, color-coded urgency. Only
          for shippable orders past funding. */}
      {dl ? (
        <div
          data-testid="order-row-deadline"
          data-urgency={dl.urgency}
          className={`mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium ${URGENCY_STRIP_CLASSES[dl.urgency]}`}
        >
          <Clock className="h-4 w-4 flex-shrink-0" weight="regular" />
          <span>
            {dl.urgency === "expired"
              ? "Past auto-refund deadline — funds may return to buyer"
              : `Ship within ${dl.label} or order auto-refunds`}
          </span>
        </div>
      ) : null}

      {/* Line items — 40 px thumbnails with breathing room. qty pill
          right-aligned. */}
      {lineItems.length > 0 ? (
        <ul
          className="mx-4 mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-celo-light/10"
          data-testid="order-row-line-items"
        >
          {lineItems.map((item, idx) => (
            <li
              key={`${order.id}-${idx}`}
              className="flex items-center gap-3"
            >
              {item.image_ipfs_hash ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ipfsImageUrl(item.image_ipfs_hash) ?? ""}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-neutral-100 dark:bg-celo-dark-bg">
                  <Package
                    className="h-5 w-5 text-neutral-400 dark:text-celo-light/40"
                    aria-hidden
                  />
                </div>
              )}
              <span className="flex-1 truncate text-sm text-celo-dark dark:text-celo-light">
                {item.title}
              </span>
              <span className="flex-shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-sm font-medium tabular-nums text-celo-dark dark:bg-celo-dark-bg dark:text-celo-light">
                × {item.qty}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Action zone — primary CTA + secondary actions. Separated from
          the data zone by spacing + alignment so the seller's eye
          lands here when scanning a row top-to-bottom. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {canShip ? (
          <Button
            type="button"
            variant="default"
            onClick={onShipClick}
            className="min-h-[44px] flex-1 text-base sm:flex-none"
          >
            <Truck className="mr-2 h-4 w-4" />
            Mark shipped
          </Button>
        ) : optimisticShipped ? (
          <div
            data-testid="order-row-shipped-syncing"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-emerald-50 px-3 text-base font-medium text-emerald-800 sm:flex-none dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <Truck className="h-4 w-4" weight="fill" />
            <span>Shipped — syncing on-chain…</span>
          </div>
        ) : null}
        {snapshot ? (
          <button
            type="button"
            onClick={handleCopyAddress}
            aria-label="Copy delivery address"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-celo-dark hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:text-celo-light dark:hover:bg-celo-dark-bg"
          >
            <Copy className="h-4 w-4" weight="regular" />
            Copy address
          </button>
        ) : null}
      </div>

      {/* Delivery card — folded into the row when snapshot present. */}
      {snapshot ? (
        <div className="px-4 pb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-celo-light/60">
            <MapPin className="h-4 w-4" weight="regular" />
            <span>Ship to</span>
          </div>
          <OrderDeliveryAddressCard
            snapshot={snapshot}
            orderId={order.onchain_order_id}
            hideWhenEmpty
          />
        </div>
      ) : null}

      {/* Inline dispute resolution — renders nothing unless the order
          contains a disputed item. Seller has no per-order detail
          page in V1, so the N1 amicable surface folds into the row. */}
      <SellerOrderDisputeSection
        orderUuid={order.id}
        globalStatus={order.global_status}
        sellerAddress={sellerAddress}
      />
    </li>
  );
});
OrderRow.displayName = "OrderRow";

// Compact avatar : first letter of buyer label, monogram-style. Cheap
// alternative to a real photo since we never display the buyer's wallet
// or any PII to the seller (CLAUDE.md rule #5 + ADR-043).
function BuyerAvatar({ label }: { label: string }) {
  const initial = (label.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-celo-forest-soft text-sm font-semibold text-celo-forest dark:bg-celo-forest-bright-soft dark:text-celo-light"
    >
      {initial}
    </span>
  );
}
