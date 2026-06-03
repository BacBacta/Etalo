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
import dynamic from "next/dynamic";

import { BlockscoutLinkButton } from "@/components/orders/BlockscoutLinkButton";
import { WhatsAppShareButton } from "@/components/orders/WhatsAppShareButton";
import {
  getEligibleActions,
  type OrderItemResponse,
  type OrderResponse,
} from "@/lib/orders/state";
import { cn } from "@/lib/utils";

// All 4 conditional action buttons (Confirm / Dispute / Claim refund /
// the dispute dialog) are dynamic-imported. Each pulls in wagmi write
// hooks + viem encoders + Phosphor icons + the escrow ABI ; only
// rendered when `getEligibleActions` says the buyer can act. Most
// orders only ever surface 1 of these on a given page-view, so eager-
// loading all 3 buttons + the dispute dialog wastes ~25-30 kB of
// First Load JS on /orders/[id] (was 224 kB total post-claim-refund-
// addition, target ≤ 200 kB). `ssr: false` because they all use
// wagmi hooks ; `loading: () => null` because the parent already
// gates visibility on action eligibility.
const OpenDisputeButton = dynamic(
  () =>
    import("@/components/orders/OpenDisputeButton").then((m) => ({
      default: m.OpenDisputeButton,
    })),
  { ssr: false, loading: () => null },
);
const ConfirmDeliveryButton = dynamic(
  () =>
    import("@/components/orders/ConfirmDeliveryButton").then(
      (m) => m.ConfirmDeliveryButton,
    ),
  { ssr: false, loading: () => null },
);
const ClaimRefundButton = dynamic(
  () =>
    import("@/components/orders/ClaimRefundButton").then(
      (m) => m.ClaimRefundButton,
    ),
  { ssr: false, loading: () => null },
);

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

  // A primary action is what the buyer is most likely here to do :
  // confirm a delivery, claim an overdue refund, or open a dispute.
  // We surface the dock only when at least one of the three is
  // eligible — otherwise the page is informational and the secondary
  // row (share + blockscout) sits flush at the bottom on its own.
  const hasPrimaryAction =
    Boolean(confirmableItem) ||
    Boolean(disputableItem) ||
    actions.canClaimRefund;

  return (
    <section
      data-testid="buyer-order-actions"
      aria-label="Order actions"
      className={cn("flex flex-col gap-4", className)}
    >
      {/* Secondary actions row — always visible, but small and out of
          the primary CTA visual weight. WhatsApp deeplink + on-chain
          explorer are useful any time but should never compete with
          Confirm Delivery for the buyer's tap. */}
      <div
        data-testid="buyer-order-actions-secondary"
        className="flex flex-wrap gap-2"
      >
        <WhatsAppShareButton order={order} />
        <BlockscoutLinkButton />
      </div>

      {/* Primary action dock — sticky at the bottom of the order
          page so the CTA stays within thumb reach during scroll.
          Pattern adapted from ProfileTab.tsx:309 (sticky bottom-2).
          The parent page wraps content in `pb-[env(safe-area-inset-
          bottom)]` so the dock clears the MiniPay nav bar on iOS. */}
      {hasPrimaryAction ? (
        <div
          data-testid="buyer-order-actions-primary"
          className="sticky bottom-2 z-10 -mx-1 flex flex-col gap-2 rounded-2xl border border-celo-dark/5 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-celo-light/10 dark:bg-celo-dark-elevated/95"
        >
          {confirmableItem && (
            <>
              {/* Nudge — give the buyer a reason to confirm rather than
                  do nothing. Confirming pays the seller immediately
                  (it doesn't waive buyer protection — disputes stay open
                  until release). Framing it as helping the seller +
                  noting the auto-release fallback removes the "why
                  bother" friction that otherwise leaves every honest
                  order to drain the full timer. */}
              <p
                data-testid="confirm-delivery-nudge"
                className="px-1 text-sm text-neutral-600 dark:text-celo-light/65"
              >
                Got your order? Confirming releases payment to the seller
                right away. If you don&apos;t, it releases automatically
                once the protection window ends.
              </p>
              <ConfirmDeliveryButton
                orderId={BigInt(order.onchain_order_id)}
                itemId={BigInt(confirmableItem.onchain_item_id)}
                itemLabel={itemLabel(confirmableItem)}
              />
            </>
          )}
          {actions.canClaimRefund && (
            <ClaimRefundButton orderId={BigInt(order.onchain_order_id)} />
          )}
          {disputableItem && (
            <OpenDisputeButton
              orderId={BigInt(order.onchain_order_id)}
              itemId={BigInt(disputableItem.onchain_item_id)}
              itemLabel={itemLabel(disputableItem)}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

function itemLabel(item: OrderItemResponse): string {
  return `Item #${item.item_index + 1}`;
}
