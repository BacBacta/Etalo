import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsSummary } from "@/hooks/useAnalyticsSummary";
import { displayUsdt, parseUsdt } from "@/lib/usdt";

const GATEWAY =
  import.meta.env.VITE_PINATA_GATEWAY_URL ??
  "https://gateway.pinata.cloud/ipfs";

export function TopProductsCard() {
  const { data, isPending } = useAnalyticsSummary();
  const items = data?.top_products ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top products</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex flex-1 flex-col gap-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your top sellers will show here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((p) => (
              <li key={p.product_id} className="flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
                  {p.image_ipfs_hash ? (
                    <img
                      src={`${GATEWAY}/${p.image_ipfs_hash}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {displayUsdt(parseUsdt(p.revenue_usdt))}
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
