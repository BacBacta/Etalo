/**
 * SellerOrderDisputeSection — renders N1 resolution cards inside a
 * seller OrderRow for any items currently in dispute.
 *
 * Why a dedicated component : the seller has no per-order detail
 * page (V1 dashboard is list-only), so the dispute surface has to
 * fold inline into each affected row. Buyers get the same UI on
 * `/orders/[id]` via the page-level wiring.
 *
 * Implementation : one chain-mirror fetch per row (cheap react-query
 * cached lookup against `/orders/{id}/items`), then one
 * \`useDisputeForItem\` per disputed item. Most rows have no disputed
 * items so the inner mapping renders nothing.
 *
 * Out of V1 scope : a global "Disputes need your attention" banner
 * at the top of OrdersTab (would need a `/sellers/{addr}/disputes`
 * backend endpoint we don't have yet — deferred to the dedicated
 * dispute-UI sprint that also adds N2/N3 surfaces).
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { N1ResolutionCard } from "@/components/orders/N1ResolutionCard";
import {
  DISPUTE_FOR_ITEM_QUERY_KEY,
  useDisputeForItem,
} from "@/hooks/useDisputeForItem";
import { fetchApi } from "@/lib/fetch-api";

// Subset of OrderItemResponse we actually consume. Avoids importing
// the full type which carries optional joined product data.
interface OrderItemMin {
  id: string;
  onchain_item_id: number;
  item_price_usdt: number;
  status: string;
}

const ORDER_ITEMS_QUERY_KEY = "order-items-for-seller" as const;

// Skip the items fetch entirely on order statuses where a dispute is
// impossible. Saves N×K queries on the dashboard for terminal /
// pre-fund orders.
const STATUSES_THAT_CAN_HAVE_DISPUTES = new Set([
  "Funded",
  "PartiallyShipped",
  "AllShipped",
  "PartiallyDelivered",
  "Disputed",
]);

export interface SellerOrderDisputeSectionProps {
  orderUuid: string;
  globalStatus: string;
  sellerAddress: string;
}

export function SellerOrderDisputeSection({
  orderUuid,
  globalStatus,
  sellerAddress,
}: SellerOrderDisputeSectionProps) {
  const enabled = STATUSES_THAT_CAN_HAVE_DISPUTES.has(globalStatus);
  const { data: items } = useQuery<OrderItemMin[]>({
    queryKey: [ORDER_ITEMS_QUERY_KEY, orderUuid],
    enabled,
    queryFn: async () => {
      const res = await fetchApi(`/orders/${orderUuid}/items`);
      if (!res.ok) throw new Error(`Items fetch failed: ${res.status}`);
      return (await res.json()) as OrderItemMin[];
    },
    // Refresh every 30 s so a fresh dispute opened by the buyer
    // surfaces in the seller's dashboard without a manual reload.
    refetchInterval: 30_000,
  });

  if (!enabled || !items) return null;
  const disputed = items.filter((it) => it.status === "Disputed");
  if (disputed.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-rose-200 px-4 py-4 dark:border-rose-800">
      {disputed.map((it) => (
        <DisputedItemBlock
          key={it.id}
          orderUuid={orderUuid}
          itemUuid={it.id}
          itemPriceRawUsdt={it.item_price_usdt}
          sellerAddress={sellerAddress}
        />
      ))}
    </div>
  );
}

function DisputedItemBlock({
  orderUuid,
  itemUuid,
  itemPriceRawUsdt,
  sellerAddress,
}: {
  orderUuid: string;
  itemUuid: string;
  itemPriceRawUsdt: number;
  sellerAddress: string;
}) {
  const { data: dispute, isLoading } = useDisputeForItem(orderUuid, itemUuid);
  if (isLoading || !dispute) return null;
  return (
    <N1ResolutionCard
      dispute={dispute}
      currentUserAddress={sellerAddress}
      itemPriceRawUsdt={itemPriceRawUsdt}
    />
  );
}

// Re-export the dispute query key so callers can invalidate after
// a successful proposal (the N1ResolutionCard already does this via
// useResolveN1Amicable's invalidateOnSuccess targeting the buyer
// order detail ; the seller-side mirror needs a separate refetch).
export { DISPUTE_FOR_ITEM_QUERY_KEY };
