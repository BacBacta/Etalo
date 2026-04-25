import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAnalyticsSummary,
  type TimelinePoint,
} from "@/hooks/useAnalyticsSummary";
import { displayUsdt, parseUsdt } from "@/lib/usdt";
import { cn } from "@/lib/utils";

type Window = "h24" | "d7" | "d30";

const LABELS: Record<Window, string> = {
  h24: "24h",
  d7: "7d",
  d30: "30d",
};

export function RevenueCard() {
  const { data, isPending } = useAnalyticsSummary();
  const [window, setWindow] = useState<Window>("d7");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Revenue</CardTitle>
          <div className="flex gap-1">
            {(Object.keys(LABELS) as Window[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-sm font-medium",
                  window === w
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {LABELS[w]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-semibold tracking-tight">
              {displayUsdt(parseUsdt(data?.revenue[window] ?? "0"))}
            </p>
            <Sparkline points={data?.revenue.timeline_7d ?? []} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Sparkline({ points }: { points: TimelinePoint[] }) {
  const series = points.map((p) => ({
    d: p.date,
    v: Number(p.revenue_usdt),
  }));
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={series}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#revenue-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
