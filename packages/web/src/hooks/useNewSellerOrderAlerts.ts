/**
 * useNewSellerOrderAlerts — proactive "you got a new order" signal.
 *
 * The seller dashboard already polls the orders list (useSellerOrders,
 * 15-30 s). This hook subscribes to that SAME cache slot (page 1, 20 —
 * no extra request) and watches for order IDs it hasn't seen before. A
 * brand-new order fires a toast and bumps an unread counter that the
 * shell renders as a badge on the Orders tab — so a seller sitting on
 * Profile/Products still learns an order landed, instead of only
 * finding out if they happen to be looking at the Orders list.
 *
 * Scope (V1): in-app only — works while the app is open/foregrounded
 * (the poll pauses when the tab is hidden). The "even when the app is
 * closed" channel is WhatsApp/Twilio (separate, larger piece).
 *
 * Baseline rule: the first successful load is treated as "already seen"
 * (no toast for the seller's existing orders). Only IDs that appear in a
 * later poll are new. Status changes on an existing order don't re-alert
 * (same ID, already in the seen set) — only genuinely new orders do.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useSellerOrders } from "@/hooks/useSellerOrders";
import { formatRawUsdt } from "@/lib/usdt";

export interface UseNewSellerOrderAlertsResult {
  /** Count of new orders since the seller last opened the Orders tab. */
  newCount: number;
  /** Mark everything currently loaded as seen + reset the badge. */
  markSeen: () => void;
}

export function useNewSellerOrderAlerts(
  address: string | undefined,
): UseNewSellerOrderAlertsResult {
  // Shares the OrdersTab cache slot exactly (page 1, pageSize 20) so this
  // is a free subscriber, not a second network poll.
  const { data } = useSellerOrders({ address, page: 1, pageSize: 20 });
  const seenRef = useRef<Set<number> | null>(null);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const orders = data?.orders;
    if (!orders) return;
    const ids = orders.map((o) => o.onchain_order_id);

    // First load → baseline, no alert for pre-existing orders.
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }

    const fresh = orders.filter(
      (o) => !seenRef.current!.has(o.onchain_order_id),
    );
    if (fresh.length === 0) return;

    for (const o of fresh) seenRef.current!.add(o.onchain_order_id);

    if (fresh.length === 1) {
      const o = fresh[0];
      toast.success(`New order · #${o.onchain_order_id}`, {
        description: `${formatRawUsdt(o.total_amount_usdt)} USDT — ship to release funds`,
      });
    } else {
      toast.success(`${fresh.length} new orders`, {
        description: "Open the Orders tab to fulfil them.",
      });
    }
    setNewCount((c) => c + fresh.length);
  }, [data]);

  const markSeen = useCallback(() => {
    setNewCount(0);
    const orders = data?.orders;
    if (orders) seenRef.current = new Set(orders.map((o) => o.onchain_order_id));
  }, [data]);

  return { newCount, markSeen };
}
