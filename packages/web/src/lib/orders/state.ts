/**
 * Buyer order state derivation logic — J11.5 Block 3.
 *
 * Sources :
 * - Auto-release schedule (V1 intra) : ADR-041 (single 3d intra timer,
 *   cross-border 20/70/10 staged release deferred V2)
 * - Inactivity refund deadline : ADR-019 (7d intra → permissionless
 *   `triggerAutoRefundIfInactive`)
 * - Item-level dispute state : EtaloEscrow.getItem() / EtaloDispute
 *   events (mirrored on `OrderItemResponse.status`)
 * - Hardcoded limits : ADR-026 (MAX_ORDER, MAX_TVL, etc.)
 * - Order/Item/Shipment status enums mirror Solidity EtaloTypes 1:1
 *   (see backend `app/models/enums.py`)
 *
 * V1 scope only — `is_cross_border` is always false per ADR-041, so
 * cross-border-specific paths (20/70/10 staged release) are not
 * exercised in V1 buyer interface. Helpers handle them defensively
 * for forward-compat with V2 re-enable.
 *
 * This file is intentionally TypeScript-only — no React, no fetch, no
 * web3 imports — so it stays light in the bundle and trivially unit-
 * testable. If a helper accidentally needs viem/wagmi, the import was
 * a mistake (likely confused with on-chain reads in `lib/escrow.ts`).
 */
import type { components } from "@/types/api.gen";

export type OrderStatus = components["schemas"]["OrderStatus"];
export type ItemStatus = components["schemas"]["ItemStatus"];
export type ShipmentStatus = components["schemas"]["ShipmentStatus"];

// J11.7 Block 8 — local extension : delivery_address_snapshot was
// added to OrderResponse server-side at Block 7 (the field stores the
// address picked at checkout). The api.gen.ts regen post-merge will
// replace this intersection with a no-op.
export type DeliveryAddressSnapshotJson = {
  phone_number?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  address_line?: string | null;
  landmark?: string | null;
  notes?: string | null;
};

export type OrderResponse = components["schemas"]["OrderResponse"] & {
  delivery_address_snapshot?: DeliveryAddressSnapshotJson | null;
};
export type OrderListResponse = Omit<
  components["schemas"]["OrderListResponse"],
  "items"
> & { items: OrderResponse[] };
export type OrderItemResponse = components["schemas"]["OrderItemResponse"];
export type ShipmentGroupResponse =
  components["schemas"]["ShipmentGroupResponse"];

export type Viewer = "buyer" | "seller";

export interface EligibleActions {
  /** Buyer can mark a shipped item as delivered (releases funds early). */
  canConfirmDelivery: boolean;
  /** Buyer can open a dispute on a funded order with at least one
   *  non-delivered, non-disputed item. */
  canOpenDispute: boolean;
  /** Buyer can cancel a not-yet-funded order. */
  canCancel: boolean;
  /** Anyone (permissionless) can trigger auto-release once the timer
   *  has elapsed for a shipped item. Surfaced to buyer for visibility. */
  canTriggerAutoRelease: boolean;
  /** Buyer can claim auto-refund (ADR-019) when the seller hasn't
   *  shipped within the inactivity deadline (7d intra / 14d cross).
   *  The contract function is permissionless ; the keeper does it
   *  automatically post-deadline, the UI button is the trustless
   *  fallback. Disabled when any item is `Disputed` (the contract
   *  reverts in that case — ADR-031). */
  canClaimRefund: boolean;
}

// ADR-019. Cross-border (14d) deferred V2 (ADR-041) but the contract
// still encodes both windows ; keep them aligned with the on-chain
// constants `AUTO_REFUND_INACTIVE_INTRA` / `_CROSS`.
const SELLER_INACTIVITY_INTRA_MS = 7 * 24 * 60 * 60 * 1000;
const SELLER_INACTIVITY_CROSS_MS = 14 * 24 * 60 * 60 * 1000;

const COMPLETED_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set<ItemStatus>([
  "Released",
  "Refunded",
]);

/**
 * Earliest auto-release timestamp across the order, or null if no
 * shipment group has been shipped yet (and therefore no timer started).
 *
 * For V1 intra orders : `majority_release_at` from the indexer is the
 * canonical 3-day timer per ADR-041. We take the EARLIEST across
 * groups because that's the next user-visible event ("auto-release in
 * X" countdown should reflect the soonest action, not the latest).
 *
 * Returns null if `order.shipment_groups` is undefined/empty or all
 * groups have null `majority_release_at` (none shipped).
 */
export function deriveAutoReleaseAt(order: OrderResponse): Date | null {
  const groups = order.shipment_groups ?? [];
  const timestamps = groups
    .map((g) => g.majority_release_at)
    .filter((t): t is string => t !== null && t !== undefined)
    .map((t) => new Date(t));
  if (timestamps.length === 0) return null;
  return new Date(Math.min(...timestamps.map((d) => d.getTime())));
}

/**
 * True if any item is in dispute, OR the order itself flipped to
 * `Disputed` (rare in V2 — only when every item is in dispute, see
 * backend enums.py note).
 */
export function isOrderDisputed(order: OrderResponse): boolean {
  if (order.global_status === "Disputed") return true;
  return (order.items ?? []).some((i) => i.status === "Disputed");
}

/**
 * Earliest `shipped_at` across all shipment groups, or null if no
 * group has shipped. The buyer interface uses this to show "Shipped on
 * <date>" once the seller has acted.
 */
export function deriveShippedAt(order: OrderResponse): Date | null {
  const groups = order.shipment_groups ?? [];
  const timestamps = groups
    .map((g) => g.shipped_at)
    .filter((t): t is string => t !== null && t !== undefined)
    .map((t) => new Date(t));
  if (timestamps.length === 0) return null;
  return new Date(Math.min(...timestamps.map((d) => d.getTime())));
}

/**
 * Approximate completion timestamp : the LATEST `final_release_after`
 * across groups when all items are in a terminal state (Released or
 * Refunded). Returns null if order is not yet completed.
 *
 * V1 caveat — there is no exact "released_at" in the schema (the
 * indexer doesn't currently surface item-level release tx timestamps).
 * `final_release_after` is the lower bound : funds were eligible to
 * release at this point, the actual `confirmItemDelivery` /
 * `triggerAutoReleaseForItem` tx may have been later. Good enough for
 * "Completed on <date>" UX ; if a later sprint adds released_at, swap
 * the source here.
 */
export function deriveCompletedAt(order: OrderResponse): Date | null {
  if (order.global_status !== "Completed" && order.global_status !== "Refunded") {
    return null;
  }
  const allTerminal = (order.items ?? []).every((i) =>
    COMPLETED_ITEM_STATUSES.has(i.status),
  );
  if (!allTerminal) return null;
  const groups = order.shipment_groups ?? [];
  const timestamps = groups
    .map((g) => g.final_release_after)
    .filter((t): t is string => t !== null && t !== undefined)
    .map((t) => new Date(t));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps.map((d) => d.getTime())));
}

/**
 * Derive the actions the viewer can take on this order, based on
 * order state + viewer role + business rules.
 *
 * Buyer perspective (V1 main consumer) :
 * - canConfirmDelivery : any item with status `Shipped` or `Arrived`
 *   (seller has shipped + tracking confirmed but buyer hasn't released
 *   funds yet)
 * - canOpenDispute : order is Funded/PartiallyShipped/AllShipped/
 *   PartiallyDelivered, has at least one non-disputed non-released
 *   item, and is not in a terminal status. The on-chain
 *   `EtaloDispute.openDispute` will revert if the timing is wrong ;
 *   this is the UX gate.
 * - canCancel : order is Created (pre-fund) only.
 * - canTriggerAutoRelease : any item is Shipped/Arrived AND its
 *   group's `majority_release_at` is in the past (buyer never has to
 *   trigger this themselves but it's surfaced for transparency — anyone
 *   can call permissionlessly, fee paid by caller).
 *
 * Seller perspective is stubbed for V1 — the seller dashboard
 * (`OrdersTab.tsx`) has its own action surface and does not use this
 * helper. Returns no eligible actions for `viewer === 'seller'` to
 * avoid drift between the two surfaces.
 */
export function getEligibleActions(
  order: OrderResponse,
  viewer: Viewer,
  now: Date = new Date(),
): EligibleActions {
  if (viewer === "seller") {
    return {
      canConfirmDelivery: false,
      canOpenDispute: false,
      canCancel: false,
      canTriggerAutoRelease: false,
      canClaimRefund: false,
    };
  }

  const items = order.items ?? [];
  const groups = order.shipment_groups ?? [];

  const hasShippedOrArrivedItem = items.some(
    (i) => i.status === "Shipped" || i.status === "Arrived",
  );

  const isTerminal =
    order.global_status === "Completed" ||
    order.global_status === "Refunded" ||
    order.global_status === "Cancelled";

  const hasDisputableItem = items.some(
    (i) =>
      i.status !== "Disputed" &&
      i.status !== "Released" &&
      i.status !== "Refunded",
  );

  const isPostFund = order.global_status !== "Created";

  // Auto-release eligibility — any group whose majority_release_at is
  // past now (item must still be Shipped/Arrived, otherwise nothing
  // to release).
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const canTriggerAutoRelease = items.some((i) => {
    if (i.status !== "Shipped" && i.status !== "Arrived") return false;
    if (!i.shipment_group_id) return false;
    const group = groupById.get(i.shipment_group_id);
    if (!group?.majority_release_at) return false;
    return new Date(group.majority_release_at).getTime() <= now.getTime();
  });

  // ADR-019 buyer-side claim. The on-chain contract requires the order
  // to still be in `Funded` (no shipment group created), `funded_at`
  // older than the inactivity window, and zero items in `Disputed`.
  // Mirror those checks UI-side so the button hides when the call
  // would revert.
  const isCrossBorder = Boolean(
    (order as unknown as { is_cross_border?: boolean }).is_cross_border,
  );
  const inactivityWindow = isCrossBorder
    ? SELLER_INACTIVITY_CROSS_MS
    : SELLER_INACTIVITY_INTRA_MS;
  const fundedAtMs = order.funded_at
    ? new Date(order.funded_at).getTime()
    : null;
  const pastDeadline =
    order.global_status === "Funded" &&
    fundedAtMs !== null &&
    !Number.isNaN(fundedAtMs) &&
    now.getTime() > fundedAtMs + inactivityWindow;
  const hasDisputedItem = items.some((i) => i.status === "Disputed");
  const canClaimRefund = pastDeadline && !hasDisputedItem;

  return {
    canConfirmDelivery: hasShippedOrArrivedItem && !isTerminal,
    canOpenDispute: isPostFund && !isTerminal && hasDisputableItem,
    canCancel: order.global_status === "Created",
    canTriggerAutoRelease,
    canClaimRefund,
  };
}
