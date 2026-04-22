import { Card, CardContent } from "@/components/ui/card";
import { ShopHandle } from "@/components/shared/ShopHandle";
import { displayUsdt } from "@/lib/usdt";
import { STABLECOIN_LABEL } from "@/lib/terminology";
import type { OrderInitiateResponse } from "@/hooks/useOrderInitiate";

export function CheckoutSummary({
  initiate,
}: {
  initiate: OrderInitiateResponse;
}) {
  const amountBigInt = BigInt(initiate.amount_raw);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          {initiate.product.image_url ? (
            <img
              src={initiate.product.image_url}
              alt=""
              className="h-20 w-20 rounded-md object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-md bg-muted" />
          )}
          <div className="flex flex-col justify-between">
            <p className="text-base font-medium">{initiate.product.title}</p>
            <ShopHandle
              handle={initiate.seller.shop_handle}
              name={initiate.seller.shop_name}
              className="text-sm"
            />
          </div>
        </div>

        <dl className="flex flex-col gap-2 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-medium">{displayUsdt(amountBigInt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Payment</dt>
            <dd>{STABLECOIN_LABEL}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Network fee</dt>
            <dd>~$0.01</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Auto-release</dt>
            <dd>
              {initiate.auto_release_days_estimate} days after shipment
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
