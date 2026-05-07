/**
 * Buyer order detail — `/orders/[id]`. J11.5 Block 4.F.
 *
 * State machine :
 * - Wallet not connected → "open from MiniPay" / connect-failed
 * - Wallet connected, order loading → SkeletonV5
 * - Order 404 → buyer-friendly "not found or no permission" surface
 *   (ADR-043 enumeration leak prevention — same shape regardless of
 *   whether the order genuinely doesn't exist or the caller isn't
 *   the buyer/seller)
 * - Order loaded → header + timer + items + actions
 *
 * Always passes `?caller=<address>` for the privacy filter
 * (Block 2 backend).
 */
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";

import { AutoReleaseTimer } from "@/components/orders/AutoReleaseTimer";
import { BuyerOrderActions } from "@/components/orders/BuyerOrderActions";
import { OrderDeliveryAddressCard } from "@/components/orders/OrderDeliveryAddressCard";
import { OrderDetailHeader } from "@/components/orders/OrderDetailHeader";
import { OrderItemsList } from "@/components/orders/OrderItemsList";
import { OrdersLoadingState } from "@/components/orders/OrdersLoadingState";
import { useBuyerOrderDetail } from "@/hooks/useBuyerOrderDetail";
import { useMinipay } from "@/hooks/useMinipay";
import { BuyerOrderNotFoundError } from "@/lib/orders/api";
import { deriveAutoReleaseAt } from "@/lib/orders/state";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  return (
    <main
      className="mx-auto max-w-2xl px-4 py-6 pb-[env(safe-area-inset-bottom)]"
      data-testid="order-detail-page"
    >
      <nav className="mb-4">
        <Link
          href="/orders"
          className="text-sm text-celo-forest hover:underline dark:text-celo-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 rounded-sm"
        >
          ← Back to my orders
        </Link>
      </nav>
      <BuyerOrderDetailInner orderId={orderId} />
    </main>
  );
}

function BuyerOrderDetailInner({ orderId }: { orderId: string | undefined }) {
  const { isInMinipay, isConnected, isConnecting } = useMinipay();
  const { address } = useAccount();

  if (isConnecting) {
    return <OrdersLoadingState />;
  }

  if (!isConnected) {
    return (
      <div
        role="status"
        className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-base dark:border-celo-dark-surface dark:bg-celo-dark-bg"
        data-testid="order-detail-not-connected"
      >
        {isInMinipay
          ? "Unable to connect. Please reopen MiniPay and try again."
          : "Please open this app from MiniPay to see your order."}
      </div>
    );
  }

  return <BuyerOrderDetailLoaded orderId={orderId} caller={address!} />;
}

function BuyerOrderDetailLoaded({
  orderId,
  caller,
}: {
  orderId: string | undefined;
  caller: string;
}) {
  const { data, isLoading, isError, error } = useBuyerOrderDetail({
    orderId,
    caller,
  });

  if (!orderId) {
    return <OrderNotFoundSurface />;
  }

  if (isLoading) {
    return <OrdersLoadingState />;
  }

  if (isError) {
    if (error instanceof BuyerOrderNotFoundError) {
      return <OrderNotFoundSurface />;
    }
    return (
      <div
        role="alert"
        data-testid="order-detail-error"
        className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200"
      >
        <p className="font-medium mb-1">We couldn’t load this order.</p>
        <p>{error?.message ?? "Unknown error"}</p>
      </div>
    );
  }

  if (!data) return <OrderNotFoundSurface />;

  const autoReleaseAt = deriveAutoReleaseAt(data);

  return (
    <article className="flex flex-col gap-6" data-testid="order-detail-loaded">
      <OrderDetailHeader order={data} />
      {autoReleaseAt && (
        <AutoReleaseTimer autoReleaseAt={autoReleaseAt} />
      )}
      <OrderItemsList order={data} />
      <OrderDeliveryAddressCard
        snapshot={data.delivery_address_snapshot ?? null}
        orderId={data.onchain_order_id}
      />
      <BuyerOrderActions order={data} />
    </article>
  );
}

function OrderNotFoundSurface() {
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-base dark:border-celo-dark-surface dark:bg-celo-dark-bg"
      data-testid="order-detail-not-found"
    >
      <p className="font-medium mb-2">
        Order not found or you don’t have permission to view it
      </p>
      <p className="text-sm text-slate-500 dark:text-celo-light/60">
        Make sure you’re connected with the same wallet that placed
        the order.
      </p>
    </div>
  );
}
