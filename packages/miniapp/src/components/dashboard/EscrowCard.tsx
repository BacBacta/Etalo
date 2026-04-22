import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsSummary } from "@/hooks/useAnalyticsSummary";
import { displayUsdt, parseUsdt } from "@/lib/usdt";

export function EscrowCard() {
  const { data, isPending } = useAnalyticsSummary();
  const inEscrow = data?.escrow.in_escrow ?? "0";
  const released = data?.escrow.released ?? "0";
  const empty = parseUsdt(inEscrow) === 0n && parseUsdt(released) === 0n;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escrow</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-24" />
          </div>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">
            Nothing in escrow yet.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">In escrow</dt>
              <dd className="mt-1 text-lg font-semibold">
                {displayUsdt(parseUsdt(inEscrow))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Released</dt>
              <dd className="mt-1 text-lg font-semibold">
                {displayUsdt(parseUsdt(released))}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
