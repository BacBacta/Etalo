import { Bell } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotifications,
  type NotificationItem,
} from "@/hooks/useNotifications";

const TYPE_LABEL: Record<string, string> = {
  order_created: "New order",
  order_shipped: "Order shipped",
  order_delivered: "Order delivered",
  dispute_opened: "Dispute opened",
  payout_released: "Payout released",
};

function labelFor(n: NotificationItem) {
  return TYPE_LABEL[n.notification_type] ?? n.notification_type;
}

function relative(from: string): string {
  const diff = (Date.now() - new Date(from).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function NotificationsCard() {
  const { data, isPending } = useNotifications(3);
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Bell className="h-5 w-5" />
            <p className="text-sm">You're all caught up.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{labelFor(n)}</span>
                  <span className="text-sm text-muted-foreground">
                    {relative(n.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
