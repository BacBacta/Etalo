import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useMinipay } from "@/hooks/useMinipay";

export interface NotificationItem {
  id: string;
  channel: string;
  notification_type: string;
  payload: Record<string, unknown> | null;
  sent: boolean;
  created_at: string;
}

export interface NotificationsListResponse {
  items: NotificationItem[];
  total: number;
}

export function useNotifications(limit = 3) {
  const { address, isConnected } = useMinipay();
  return useQuery({
    queryKey: ["notifications", address, limit],
    queryFn: () =>
      apiFetch<NotificationsListResponse>(
        `/notifications?limit=${limit}`,
        { wallet: address! },
      ),
    enabled: isConnected && Boolean(address),
    staleTime: 60_000,
  });
}
