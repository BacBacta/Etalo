import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsSummary } from "@/hooks/useAnalyticsSummary";

export function ActiveOrdersCard() {
  const { data, isPending } = useAnalyticsSummary();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active orders</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <p className="text-3xl font-semibold tracking-tight">
              {data?.active_orders ?? 0}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data?.active_orders
                ? "Orders waiting for you to ship."
                : "No active orders yet."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
