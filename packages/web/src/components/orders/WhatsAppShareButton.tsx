/**
 * WhatsAppShareButton — share a short order recap with the seller
 * via WhatsApp deep-link. J11.5 Block 4.D.
 *
 * Uses the universal `https://wa.me/?text=<encoded>` pattern (no
 * phone number — the user picks a contact in WhatsApp). Falls back
 * to plain text if seller_handle is null.
 */
import { WhatsappLogo } from "@phosphor-icons/react";

import type { OrderResponse } from "@/lib/orders/state";
import { formatRawUsdt } from "@/lib/usdt";
import { cn } from "@/lib/utils";

export interface WhatsAppShareButtonProps {
  order: OrderResponse;
  className?: string;
}

export function WhatsAppShareButton({
  order,
  className,
}: WhatsAppShareButtonProps) {
  const total = `${formatRawUsdt(order.total_amount_usdt)} USDT`;
  const shopRef = order.seller_handle
    ? `@${order.seller_handle}`
    : "the shop";
  const message = [
    `Hi, I'd like to check on my Etalo order #${order.onchain_order_id} from ${shopRef}.`,
    `Total: ${total}.`,
    `Status: ${order.global_status}.`,
  ].join("\n");

  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-share-button"
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "min-h-[44px] px-4 rounded-pill border border-slate-300 bg-white",
        "text-sm font-medium text-slate-700",
        "hover:bg-slate-50 hover:border-slate-400",
        "dark:border-celo-dark-surface dark:bg-celo-dark-bg dark:text-celo-light",
        "dark:hover:border-celo-light/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2",
        "transition-colors duration-150",
        className,
      )}
    >
      <WhatsappLogo size={16} weight="regular" aria-hidden="true" />
      <span>Share on WhatsApp</span>
    </a>
  );
}
