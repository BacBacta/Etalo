/**
 * Seller dashboard order helpers — fix/seller-orders-delivery-info.
 *
 * Pure functions backing OrdersTab + PickListView. Kept separate from
 * components so they're trivially unit-testable and the row markup
 * stays focused on layout.
 *
 * Privacy + UX rules these helpers enforce :
 * - Never surface a raw 0x… buyer address (CLAUDE.md rule 5). Derive a
 *   label from the delivery snapshot when available, fall back to an
 *   order-number-only string.
 * - Deadline countdown is rooted in ADR-041 + ADR-019 intra clause :
 *   funded orders auto-refund permissionlessly after 7 days of seller
 *   inactivity. Surface the time-left so the seller knows what to ship
 *   first ; never silently let it expire.
 */
import type { DeliveryAddressSnapshot } from "@/components/orders/OrderDeliveryAddressCard";
import { countryName } from "@/lib/country";

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// Per ADR-019 intra clause — funded order auto-refunds when the seller
// stays inactive past this window.
export const SELLER_INACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const SHIPPABLE_STATUSES: ReadonlySet<string> = new Set([
  "Funded",
  "PartiallyShipped",
]);

export function isShippable(globalStatus: string): boolean {
  return SHIPPABLE_STATUSES.has(globalStatus);
}

/** Privacy-respecting buyer label for a row. Never returns 0x…. */
export function buyerLabel(
  snapshot: DeliveryAddressSnapshot | null | undefined,
  onchainOrderId: number,
): string {
  if (snapshot) {
    const country = countryName(snapshot.country) ?? snapshot.country;
    if (snapshot.city && country) {
      return `Buyer in ${snapshot.city}, ${country}`;
    }
    if (snapshot.city) return `Buyer in ${snapshot.city}`;
    if (country) return `Buyer in ${country}`;
  }
  return `Order #${onchainOrderId}`;
}

export type DeadlineUrgency = "safe" | "warn" | "urgent" | "expired";

export interface DeadlineInfo {
  /** ms left until the seller-inactivity window closes. Negative when
   *  past deadline (auto-refund window opened, badge shows "expired"). */
  msRemaining: number;
  urgency: DeadlineUrgency;
  /** Compact label like "5d 12h" or "3h" suitable for a small badge. */
  label: string;
}

/** Compute the seller-inactivity deadline for a funded order.
 *  Returns null when the order is not in a state where the deadline
 *  applies (e.g. pre-fund, fully shipped, completed, refunded). */
export function deadlineInfo(
  fundedAt: string | null | undefined,
  globalStatus: string,
  now: Date = new Date(),
): DeadlineInfo | null {
  if (!fundedAt) return null;
  if (!isShippable(globalStatus)) return null;
  const fundedMs = new Date(fundedAt).getTime();
  if (Number.isNaN(fundedMs)) return null;
  const deadlineMs = fundedMs + SELLER_INACTIVITY_WINDOW_MS;
  const msRemaining = deadlineMs - now.getTime();

  let urgency: DeadlineUrgency;
  if (msRemaining <= 0) urgency = "expired";
  else if (msRemaining <= 24 * 60 * 60 * 1000) urgency = "urgent";
  else if (msRemaining <= 3 * 24 * 60 * 60 * 1000) urgency = "warn";
  else urgency = "safe";

  return { msRemaining, urgency, label: formatDuration(msRemaining) };
}

/** Compact "5d 12h" / "3h" / "20m" format. Always positive — sign is
 *  carried by `urgency` on the parent struct. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (ms <= 0) return "expired";
  if (days >= 1) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

/** Tailwind class set for the status badge. Keeps semantic meaning out
 *  of the markup so we don't repeat it across views. */
export function statusBadgeClass(globalStatus: string): string {
  switch (globalStatus) {
    case "Funded":
    case "PartiallyShipped":
      return "bg-amber-100 text-amber-800";
    case "AllShipped":
    case "PartiallyDelivered":
      return "bg-blue-100 text-blue-800";
    case "Completed":
      return "bg-emerald-100 text-emerald-800";
    case "Disputed":
      return "bg-rose-100 text-rose-800";
    case "Refunded":
      return "bg-neutral-200 text-neutral-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export function ipfsImageUrl(
  hash: string | null | undefined,
): string | null {
  if (!hash) return null;
  return `${PINATA_GATEWAY}${hash}`;
}

// ============================================================
// Pick list (Vue B) aggregation — fold all open orders' line_items
// into per-SKU rows the seller can act on as a batch.
// ============================================================

export interface AggregatedSku {
  /** Stable key for React. Composite of title + image hash because the
   *  SellerOrderItemSummary doesn't carry a product id (the on-chain
   *  Item struct doesn't either — products are identified off-chain
   *  via Order.product_ids). Two SKUs with identical title + image
   *  collapse, which is the right outcome for a pick list. */
  key: string;
  title: string;
  imageHash: string | null;
  totalQty: number;
  /** Number of distinct orders this SKU appears in. */
  orderCount: number;
  /** Closest ms remaining across the contributing orders, null when
   *  none of them have a deadline (all pre-fund / shipped). */
  earliestMsRemaining: number | null;
  earliestUrgency: DeadlineUrgency | null;
  /** onchain_order_id list — used for the row's "open orders" disclosure
   *  and for the future MarkBatchShipped call. */
  contributingOrderIds: number[];
}

interface AggregatableOrder {
  onchain_order_id: number;
  global_status: string;
  funded_at?: string | null;
  line_items?: Array<{
    title: string;
    qty: number;
    image_ipfs_hash?: string | null;
  }>;
}

/** Fold open (shippable) orders into per-SKU rows. Non-shippable orders
 *  are excluded — the pick list is for "what to ship today". */
export function aggregateOpenOrdersBySku(
  orders: AggregatableOrder[],
  now: Date = new Date(),
): AggregatedSku[] {
  const map = new Map<string, AggregatedSku>();
  for (const order of orders) {
    if (!isShippable(order.global_status)) continue;
    const items = order.line_items ?? [];
    if (items.length === 0) continue;
    const dl = deadlineInfo(order.funded_at, order.global_status, now);
    for (const it of items) {
      const imageHash = it.image_ipfs_hash ?? null;
      const key = `${it.title}::${imageHash ?? ""}`;
      const prev = map.get(key);
      if (prev) {
        prev.totalQty += it.qty;
        if (!prev.contributingOrderIds.includes(order.onchain_order_id)) {
          prev.contributingOrderIds.push(order.onchain_order_id);
          prev.orderCount = prev.contributingOrderIds.length;
        }
        if (
          dl &&
          (prev.earliestMsRemaining === null ||
            dl.msRemaining < prev.earliestMsRemaining)
        ) {
          prev.earliestMsRemaining = dl.msRemaining;
          prev.earliestUrgency = dl.urgency;
        }
      } else {
        map.set(key, {
          key,
          title: it.title,
          imageHash,
          totalQty: it.qty,
          orderCount: 1,
          earliestMsRemaining: dl ? dl.msRemaining : null,
          earliestUrgency: dl ? dl.urgency : null,
          contributingOrderIds: [order.onchain_order_id],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    // Most-urgent deadline first ; SKUs with no deadline at the bottom.
    const aMs = a.earliestMsRemaining ?? Number.POSITIVE_INFINITY;
    const bMs = b.earliestMsRemaining ?? Number.POSITIVE_INFINITY;
    if (aMs !== bMs) return aMs - bMs;
    return b.totalQty - a.totalQty;
  });
}

export interface OrdersAggregate {
  shippableOrderCount: number;
  totalItemsToShip: number;
  earliestDeadline: DeadlineInfo | null;
}

export function summarizeOrders(
  orders: AggregatableOrder[],
  now: Date = new Date(),
): OrdersAggregate {
  let shippableOrderCount = 0;
  let totalItemsToShip = 0;
  let earliest: DeadlineInfo | null = null;
  for (const order of orders) {
    if (!isShippable(order.global_status)) continue;
    shippableOrderCount += 1;
    for (const it of order.line_items ?? []) totalItemsToShip += it.qty;
    const dl = deadlineInfo(order.funded_at, order.global_status, now);
    if (dl && (earliest === null || dl.msRemaining < earliest.msRemaining)) {
      earliest = dl;
    }
  }
  return { shippableOrderCount, totalItemsToShip, earliestDeadline: earliest };
}
