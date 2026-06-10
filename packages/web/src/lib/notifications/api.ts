/**
 * Notifications API client — reads the connected wallet's notification
 * feed (GET /api/v1/notifications, X-Wallet-Address auth per ADR-046).
 *
 * Rows are written by the indexer on order events (currently
 * `order_funded`); this is the read side that powers the in-app bell.
 */
import { fetchApi } from "@/lib/fetch-api";
import { walletAuthHeaders } from "@/lib/wallet-auth";

export interface NotificationPayload {
  onchain_order_id?: number;
  amount_usdt?: number;
}

export interface NotificationItem {
  id: string;
  channel: string;
  notification_type: string;
  payload: NotificationPayload | null;
  sent: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
}

export async function fetchNotifications(
  walletAddress: string,
  limit = 20,
): Promise<NotificationsResponse> {
  const res = await fetchApi(`/notifications?limit=${limit}`, {
    headers: walletAuthHeaders(walletAddress),
  });
  if (!res.ok) {
    throw new Error(`Notifications fetch failed: ${res.status}`);
  }
  return (await res.json()) as NotificationsResponse;
}
