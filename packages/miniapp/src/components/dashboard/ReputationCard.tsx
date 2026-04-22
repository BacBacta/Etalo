import { Star } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAnalyticsSummary,
  type ReputationBadge,
} from "@/hooks/useAnalyticsSummary";
import { cn } from "@/lib/utils";

const BADGE_LABEL: Record<ReputationBadge, string> = {
  new_seller: "New seller",
  active: "Active",
  top_seller: "Top Seller",
  suspended: "Suspended",
};

const BADGE_STYLE: Record<ReputationBadge, string> = {
  new_seller: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  top_seller: "bg-amber-500/15 text-amber-700",
  suspended: "bg-destructive/10 text-destructive",
};

export function ReputationCard() {
  const { data, isPending } = useAnalyticsSummary();
  const badge = data?.reputation.badge ?? "new_seller";
  const days = data?.reputation.auto_release_days ?? 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reputation</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Star className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">
                  {data?.reputation.score ?? 0} / 100
                </span>
                <span
                  className={cn(
                    "mt-0.5 w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                    BADGE_STYLE[badge],
                  )}
                >
                  {BADGE_LABEL[badge]}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Funds auto-release {days} day{days === 1 ? "" : "s"} after
              delivery.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
