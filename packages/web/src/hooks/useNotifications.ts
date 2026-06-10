/**
 * useNotifications — the connected wallet's notification feed for the
 * in-app bell. Inherits the app's 30s polling default (AppProviders) so
 * the bell surfaces new events without a manual refresh.
 */
import { useQuery } from "@tanstack/react-query";

import {
  fetchNotifications,
  type NotificationsResponse,
} from "@/lib/notifications/api";

export const NOTIFICATIONS_QUERY_KEY = "notifications";

export function useNotifications(
  address: string | null | undefined,
  enabled = true,
) {
  return useQuery<NotificationsResponse, Error>({
    queryKey: [NOTIFICATIONS_QUERY_KEY, address?.toLowerCase()],
    queryFn: () => {
      if (!address) throw new Error("address required");
      return fetchNotifications(address);
    },
    enabled: enabled && Boolean(address),
    staleTime: 30_000,
    retry: 1,
  });
}
