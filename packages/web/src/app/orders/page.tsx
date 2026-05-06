/**
 * Buyer order list — `/orders`. J11.5 Block 3.E.
 *
 * Lists the connected buyer's orders, click-through to detail.
 * MiniPay-gated via `useMinipay` (CLAUDE.md rule 7) — disconnected
 * users see a clear next step instead of a white screen.
 *
 * Bundle target : < 240 kB First Load JS per ADR-043 / SPRINT_J11_5
 * Block 9. The page imports only V5 components, TanStack Query
 * (already in bundle), wagmi useAccount, and pure-TS state helpers
 * — no Recharts, no transactional libs.
 */
"use client";

import { useAccount } from "wagmi";

import { OrderCard } from "@/components/orders/OrderCard";
import { OrdersEmptyState } from "@/components/orders/OrdersEmptyState";
import { OrdersLoadingState } from "@/components/orders/OrdersLoadingState";
import { useBuyerOrders } from "@/hooks/useBuyerOrders";
import { useMinipay } from "@/hooks/useMinipay";

export default function OrdersPage() {
  return (
    <main
      className="mx-auto max-w-2xl px-4 py-6 pb-[env(safe-area-inset-bottom)]"
      data-testid="orders-page"
    >
      <header className="mb-6">
        <h1 className="font-display text-display-3 text-celo-dark dark:text-celo-light">
          My orders
        </h1>
      </header>
      <BuyerOrdersList />
    </main>
  );
}

function BuyerOrdersList() {
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
        data-testid="orders-not-connected"
      >
        {isInMinipay
          ? "Unable to connect. Please reopen MiniPay and try again."
          : "Please open this app from MiniPay to see your orders."}
      </div>
    );
  }

  return <BuyerOrdersListConnected buyer={address!} />;
}

function BuyerOrdersListConnected({ buyer }: { buyer: string }) {
  const { data, isLoading, isError, error, refetch } = useBuyerOrders({
    buyer,
  });

  if (isLoading) return <OrdersLoadingState />;

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200"
        data-testid="orders-error"
      >
        <p className="font-medium mb-2">We couldn’t load your orders.</p>
        <p className="mb-3">{error?.message ?? "Unknown error"}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-pill bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) return <OrdersEmptyState />;

  return (
    <ul
      data-testid="orders-list"
      className="flex flex-col gap-3"
    >
      {items.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}
