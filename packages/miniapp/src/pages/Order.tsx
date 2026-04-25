import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useMinipay } from "@/hooks/useMinipay";
import { apiFetch } from "@/lib/api";
import { celoSepolia } from "@/lib/chain";
import { displayUsdt, parseUsdt } from "@/lib/usdt";

interface OrderView {
  id: string;
  onchain_order_id: number | null;
  buyer_address: string;
  seller_address: string;
  amount_usdt: string;
  commission_usdt: string;
  status: string;
  is_cross_border: boolean;
  tx_hash: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  created: "Order created",
  funded: "Paid — waiting for seller to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  disputed: "In dispute",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export default function Order() {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const { address } = useMinipay();

  const { data, isPending, isError } = useQuery({
    queryKey: ["orders", orderId, address],
    queryFn: () =>
      apiFetch<OrderView>(`/orders/${orderId}`, { wallet: address! }),
    enabled: Boolean(orderId) && Boolean(address),
  });

  return (
    <MobileLayout
      header={
        <div className="flex w-full items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate("/seller")}
          >
            Back
          </Button>
          <h1 className="flex-1 text-center text-base font-semibold">Order</h1>
          <span className="w-14" aria-hidden />
        </div>
      }
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load this order.
        </div>
      ) : (
        <Body order={data} />
      )}
    </MobileLayout>
  );
}

function Body({ order }: { order: OrderView }) {
  const autoDays = order.is_cross_border ? 7 : 3;
  const explorerUrl = order.tx_hash
    ? `${celoSepolia.blockExplorers.default.url}/tx/${order.tx_hash}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="mt-0.5 font-semibold">
                {displayUsdt(parseUsdt(order.amount_usdt))}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Commission</dt>
              <dd className="mt-0.5 font-semibold">
                {displayUsdt(parseUsdt(order.commission_usdt))}
              </dd>
            </div>
            {order.onchain_order_id !== null ? (
              <div>
                <dt className="text-muted-foreground">On-chain ID</dt>
                <dd className="mt-0.5 font-semibold">
                  #{order.onchain_order_id}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="mt-0.5 font-semibold">
                {order.is_cross_border ? "Cross-border" : "Intra-Africa"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Funds auto-release {autoDays} days after the seller marks the order
        as shipped.
      </p>

      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium underline"
        >
          View funding transaction <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
