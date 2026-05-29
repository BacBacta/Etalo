"use client";

import {
  Clock,
  Copy,
  MapPin,
  Package,
  Truck,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Image from "next/image";
import { toast } from "sonner";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DeliveryAddressSnapshot } from "@/components/orders/OrderDeliveryAddressCard";
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
import { countryName } from "@/lib/country";
import { formatRowDate } from "@/lib/format";
import { type SellerOrderItem } from "@/lib/seller-api";
import {
  buyerLabel,
  deadlineInfo,
  ipfsImageUrl,
  isShippable,
  statusPill,
  summarizeOrders,
  type DeadlineInfo,
  type DeadlineUrgency,
} from "@/lib/sellerOrderHelpers";
import { formatRawUsdt } from "@/lib/usdt";
import { buildWhatsAppCoordinateUrl } from "@/lib/whatsapp";

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
  { value: "Created", label: "Awaiting payment" },
  { value: "Funded", label: "To ship" },
  { value: "PartiallyShipped", label: "Partially shipped" },
  { value: "AllShipped", label: "Shipped" },
  { value: "PartiallyDelivered", label: "Partially delivered" },
  { value: "Completed", label: "Completed" },
  { value: "Disputed", label: "Disputed" },
  { value: "Refunded", label: "Refunded" },
];

// Per-urgency left-border palette. A 4 px left edge on each card lets the
// seller scan a long list and prioritize in one sweep (Shopify / Linear
// / Robinhood pattern). Kept subtle until the deadline turns loud ;
// disputes override it with rose (see OrderRow).
const URGENCY_BORDER_CLASSES: Record<DeadlineUrgency, string> = {
  expired: "border-l-rose-500 dark:border-l-rose-400",
  urgent: "border-l-rose-500 dark:border-l-rose-400",
  warn: "border-l-amber-400 dark:border-l-amber-400",
  safe: "border-l-emerald-400 dark:border-l-emerald-400",
};

// WhatsApp brand action — filled green, recognizable, premium. Reused on
// every shippable/snapshot-bearing row so the seller can coordinate
// delivery without hunting for a buried button.
const WHATSAPP_ACTION_CLASSES = [
  "inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5",
  "rounded-lg bg-celo-green px-4 text-base font-medium text-white",
  "transition-colors hover:bg-celo-green-hover",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-green",
  "focus-visible:ring-offset-2 dark:focus-visible:ring-offset-celo-dark-elevated",
].join(" ");

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
            className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-base text-celo-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light sm:flex-none"
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
      className="rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-celo-light/60">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${urgencyText}`}>
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
  const snapshot = (order.delivery_address_snapshot ??
    null) as DeliveryAddressSnapshot | null;
  const buyer = buyerLabel(snapshot, order.onchain_order_id);
  const lineItems = order.line_items ?? [];
  const pill = statusPill(order.global_status);
  // Dispute escalation : when any item is in dispute, override the
  // ship-deadline visual (which is meaningless mid-dispute) with a
  // rose border + badge so the seller spots the row immediately.
  // Cache slot is shared with SellerOrderDisputeSection below so this
  // hook adds zero network round-trips for the common case.
  const hasDispute = useOrderHasDispute(order.id, order.global_status);

  const waUrl = snapshot
    ? buildWhatsAppCoordinateUrl({
        phone: snapshot.phone_number,
        country: snapshot.country,
        orderId: order.onchain_order_id,
      })
    : null;

  // 4 px left border keyed to urgency lets sellers scan a long list and
  // pick what to ship next without reading every label. Neutral edge for
  // orders without an active deadline (Created / Shipped / Completed).
  // Disputes win over urgency.
  const borderColor = hasDispute
    ? "border-l-rose-500 dark:border-l-rose-400"
    : dl
      ? URGENCY_BORDER_CLASSES[dl.urgency]
      : "border-l-neutral-200 dark:border-l-celo-light/10";

  const handleCopyAddress = () => {
    if (!snapshot) return;
    const lines = [
      snapshot.recipient_name,
      snapshot.address_line,
      snapshot.area,
      [snapshot.city, snapshot.region].filter(Boolean).join(", "),
      countryName(snapshot.country) ?? snapshot.country,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard
      .writeText(lines)
      .then(() => toast.success("Address copied"))
      .catch(() => toast.error("Couldn't copy"));
  };

  const hasActions =
    canShip || optimisticShipped || waUrl !== null || snapshot !== null;

  return (
    <li
      className={`overflow-hidden rounded-2xl border border-neutral-200 border-l-4 bg-white shadow-celo-sm transition-shadow hover:shadow-celo-md dark:border-celo-light/10 dark:bg-celo-dark-elevated ${borderColor}`}
    >
      {/* Header — status pill (+ dispute badge) + meta on the left,
          amount on the right. The pill carries the humanized status +
          dot ; the meta line folds order id / date / item count into one
          quiet row so the card reads top-to-bottom without competing
          signals. */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="order-row-status"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${pill.className}`}
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${pill.dotClassName}`}
              />
              {pill.label}
            </span>
            {hasDispute ? (
              <span
                data-testid="order-row-dispute-badge"
                className="inline-flex flex-shrink-0 items-center rounded-full bg-rose-100 px-2.5 py-1 text-sm font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
              >
                Dispute
              </span>
            ) : null}
          </div>
          <div className="truncate text-sm tabular-nums text-neutral-500 dark:text-celo-light/60">
            #{order.onchain_order_id} · {formatRowDate(order.created_at_chain)} ·{" "}
            {order.item_count} {order.item_count === 1 ? "item" : "items"}
          </div>
        </div>
        <span className="flex-shrink-0 text-lg font-semibold tabular-nums text-celo-dark dark:text-celo-light">
          {formatRawUsdt(order.total_amount_usdt)} USDT
        </span>
      </div>

      {/* Buyer line — only when a snapshot gives us a meaningful,
          privacy-safe label (never the 0x… wallet, CLAUDE.md rule 5).
          Anonymous orders skip this row : the #id above already names
          them, so repeating "Order #N" here would be noise. */}
      {snapshot ? (
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <BuyerAvatar snapshot={snapshot} fallbackLabel={buyer} />
          <span className="truncate text-base font-medium text-celo-dark dark:text-celo-light">
            {buyer}
          </span>
        </div>
      ) : null}

      {/* Deadline — progressive urgency. Calm inline chip while there's
          time ; loud full-width pulsing strip once it's urgent / past so
          the seller can't miss the auto-refund risk. */}
      {dl ? (
        <div className="px-4 pt-3">
          <DeadlineBadge dl={dl} />
        </div>
      ) : null}

      {/* Line items — 40 px thumbnails, qty pill right-aligned. */}
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
                <Image
                  src={ipfsImageUrl(item.image_ipfs_hash) ?? ""}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-celo-dark-bg">
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

      {/* Compact ship-to summary — recipient + area · city, country.
          The full standalone card stays on the buyer-facing order page ;
          here we keep it tight and let the action row own WhatsApp. */}
      {snapshot ? <ShipToSummary snapshot={snapshot} /> : null}

      {/* Action zone — primary CTA (or the post-ship syncing chip), then
          WhatsApp + copy as a balanced pair. WhatsApp is now first-class
          (was buried inside the old address card) so the seller can
          coordinate delivery in one tap. */}
      {hasActions ? (
        <div className="space-y-2 px-4 py-4">
          {canShip ? (
            <Button
              type="button"
              variant="default"
              onClick={onShipClick}
              className="min-h-[44px] w-full text-base"
            >
              <Truck className="mr-2 h-4 w-4" />
              Mark shipped
            </Button>
          ) : optimisticShipped ? (
            <div
              data-testid="order-row-shipped-syncing"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 text-base font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <Truck className="h-4 w-4" weight="fill" />
              <span>Shipped — syncing on-chain…</span>
            </div>
          ) : null}
          {waUrl || snapshot ? (
            <div className="flex gap-2">
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="order-row-whatsapp"
                  aria-label="Coordinate delivery via WhatsApp"
                  className={WHATSAPP_ACTION_CLASSES}
                >
                  <WhatsappLogo className="h-5 w-5" weight="fill" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
              {snapshot ? (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  aria-label="Copy delivery address"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-base font-medium text-celo-dark transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/20 dark:text-celo-light dark:hover:bg-celo-dark-bg"
                >
                  <Copy className="h-4 w-4" weight="regular" aria-hidden />
                  Copy
                </button>
              ) : null}
            </div>
          ) : null}
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

/** Compact delivery summary for a seller row. Privacy-safe : the buyer
 *  phone is never printed (escrow-bypass risk) — coordination happens
 *  through the WhatsApp deeplink in the action row. */
function ShipToSummary({ snapshot }: { snapshot: DeliveryAddressSnapshot }) {
  const locality = [
    snapshot.area,
    snapshot.city,
    countryName(snapshot.country) ?? snapshot.country,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!snapshot.recipient_name && !locality && !snapshot.address_line) {
    return null;
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-celo-light/10 dark:bg-celo-dark-bg/40">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-celo-light/60">
        <MapPin className="h-4 w-4" weight="regular" aria-hidden />
        <span>Ship to</span>
      </div>
      {snapshot.recipient_name ? (
        <p className="text-base font-medium text-celo-dark dark:text-celo-light">
          {snapshot.recipient_name}
        </p>
      ) : null}
      {locality ? (
        <p className="text-sm text-neutral-700 dark:text-celo-light/75">
          {locality}
        </p>
      ) : null}
      {snapshot.address_line ? (
        <p className="mt-0.5 break-words text-sm text-neutral-500 dark:text-celo-light/55">
          {snapshot.address_line}
        </p>
      ) : null}
    </div>
  );
}

const DEADLINE_LOUD_CLASSES: Record<"urgent" | "expired", string> = {
  urgent: "bg-rose-500 text-white",
  expired: "bg-rose-600 text-white",
};

const DEADLINE_SOFT_CLASSES: Record<"safe" | "warn", string> = {
  safe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

function deadlineCopy(dl: DeadlineInfo): string {
  switch (dl.urgency) {
    case "expired":
      return "Past auto-refund deadline — funds may return to buyer";
    case "urgent":
      return `Urgent — ship within ${dl.label}`;
    case "warn":
      return `Ship soon — ${dl.label} left`;
    case "safe":
    default:
      return `Ships within ${dl.label}`;
  }
}

function DeadlineBadge({ dl }: { dl: DeadlineInfo }) {
  const loud = dl.urgency === "urgent" || dl.urgency === "expired";
  const className = loud
    ? `flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold animate-celo-pulse ${DEADLINE_LOUD_CLASSES[dl.urgency as "urgent" | "expired"]}`
    : `inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${DEADLINE_SOFT_CLASSES[dl.urgency as "safe" | "warn"]}`;
  return (
    <div
      data-testid="order-row-deadline"
      data-urgency={dl.urgency}
      className={className}
    >
      <Clock className="h-4 w-4 flex-shrink-0" weight="regular" aria-hidden />
      <span>{deadlineCopy(dl)}</span>
    </div>
  );
}

// Compact avatar : first letter of the recipient name (or city) as a
// monogram. We never display the buyer's wallet or any PII to the seller
// (CLAUDE.md rule 5 + ADR-043), so the snapshot is the only identity
// source — anonymous orders never reach this component (the buyer line
// is skipped when there's no snapshot).
function BuyerAvatar({
  snapshot,
  fallbackLabel,
}: {
  snapshot: DeliveryAddressSnapshot;
  fallbackLabel: string;
}) {
  const source =
    snapshot.recipient_name?.trim() ||
    snapshot.city?.trim() ||
    fallbackLabel;
  const initial = (source.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-celo-forest-soft text-sm font-semibold text-celo-forest dark:bg-celo-forest-bright-soft dark:text-celo-light"
    >
      {initial}
    </span>
  );
}
