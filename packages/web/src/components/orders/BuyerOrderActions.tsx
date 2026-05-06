/**
 * BuyerOrderActions — orchestrates the action surface on
 * /orders/[id]. J11.5 Block 4.D.
 *
 * Renders, conditionally :
 * - ConfirmDeliveryButton (when buyer canConfirmDelivery)
 * - OpenDisputeButton (when buyer canOpenDispute)
 * - WhatsAppShareButton (always)
 * - BlockscoutLinkButton (always)
 *
 * V1 simplification : confirm + dispute act on the FIRST eligible
 * item in the order. Multi-item orders surface 1 button per action
 * type. A future iteration could expand to per-item buttons inside
 * OrderItemsList rows, but the V1 buyer interface MVP targets the
 * single-item case (which is the realistic V1 cart-checkout flow
 * anyway).
 */
import { BlockscoutLinkButton } from "@/components/orders/BlockscoutLinkButton";
import { ConfirmDeliveryButton } from "@/components/orders/ConfirmDeliveryButton";
import { OpenDisputeButton } from "@/components/orders/OpenDisputeButton";
import { WhatsAppShareButton } from "@/components/orders/WhatsAppShareButton";
import {
  getEligibleActions,
  type OrderItemResponse,
  type OrderResponse,
} from "@/lib/orders/state";
import { cn } from "@/lib/utils";

export interface BuyerOrderActionsProps {
  order: OrderResponse;
  className?: string;
}

export function BuyerOrderActions({ order, className }: BuyerOrderActionsProps) {
  const actions = getEligibleActions(order, "buyer");
  const items = order.items ?? [];

  const confirmableItem = actions.canConfirmDelivery
    ? items.find((i) => i.status === "Shipped" || i.status === "Arrived")
    : undefined;

  const disputableItem = actions.canOpenDispute
    ? items.find(
        (i) =>
          i.status !== "Disputed" &&
          i.status !== "Released" &&
          i.status !== "Refunded",
      )
    : undefined;

  return (
    <section
      data-testid="buyer-order-actions"
      aria-label="Order actions"
      className={cn("flex flex-col gap-3", className)}
    >
      {confirmableItem && (
        <ConfirmDeliveryButton
          orderId={BigInt(order.onchain_order_id)}
          itemId={BigInt(confirmableItem.onchain_item_id)}
          itemLabel={itemLabel(confirmableItem)}
        />
      )}
      {disputableItem && (
        <OpenDisputeButton
          orderId={BigInt(order.onchain_order_id)}
          itemId={BigInt(disputableItem.onchain_item_id)}
          itemLabel={itemLabel(disputableItem)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <WhatsAppShareButton order={order} />
        <BlockscoutLinkButton />
      </div>
    </section>
  );
}

function itemLabel(item: OrderItemResponse): string {
  return `Item #${item.item_index + 1}`;
}
