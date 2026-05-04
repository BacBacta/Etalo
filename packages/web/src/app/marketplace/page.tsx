"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useMarketplaceProducts } from "@/hooks/useMarketplaceProducts";
import { detectMiniPay } from "@/lib/minipay-detect";
import { cn } from "@/lib/utils";

export default function MarketplacePage() {
  const router = useRouter();
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);

  // MiniPay gating — non-MiniPay users redirect to landing (HomeRouter
  // dispatches them to HomeMiniPay if it later detects MiniPay context).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const detected = detectMiniPay();
    setIsMiniPay(detected);
    if (!detected) {
      router.replace("/");
    }
  }, [router]);

  // Sub-block 2.3a — useInfiniteQuery replaces the previous useState
  // (products / cursor / hasMore / loading / loadingMore / error) +
  // useEffect plumbing. The query is gated on MiniPay detection so it
  // never fires on the redirect-in-flight branch (non-MiniPay visitors
  // bounce to "/" before any network round-trip).
  const query = useMarketplaceProducts({ enabled: isMiniPay === true });

  const products = useMemo(
    () => query.data?.pages.flatMap((page) => page.products) ?? [],
    [query.data],
  );

  if (isMiniPay === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-base text-neutral-600">Loading…</p>
      </div>
    );
  }

  // Redirect in flight — render nothing during the transition.
  if (isMiniPay === false) return null;

  if (query.isPending) {
    return (
      <main className="min-h-screen" data-testid="marketplace-loading">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="mb-1 text-xl font-semibold">Marketplace</h1>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonV5 key={i} variant="card" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (query.isError && products.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h2 className="mb-3 text-xl font-semibold">
            Couldn&apos;t load marketplace
          </h2>
          <p className="mb-4 text-base text-neutral-700">
            Failed to load marketplace. Please try again.
          </p>
          <Button onClick={() => query.refetch()} className="min-h-[44px]">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h2 className="mb-3 text-xl font-semibold">No products yet</h2>
          <p className="text-base text-neutral-700">
            Etalo&apos;s marketplace is just getting started. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Sub-block 2.3a — MANDATORY visible Refresh button. Pull-to-refresh
  // gesture (sub-block 2.3b) is a touch-only enhancement ; keyboard and
  // screen-reader users need a parallel affordance to invalidate the
  // marketplace cache. The button stays disabled while a refetch is in
  // flight (`isFetching`, scoped to the active page request — does not
  // include `isFetchingNextPage`) so it can't be spam-clicked, and the
  // icon spins via `animate-spin` to mirror the gesture's feedback loop.
  const isRefreshing = query.isFetching && !query.isFetchingNextPage;
  const isLoadingMore = query.isFetchingNextPage;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Marketplace</h1>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={isRefreshing}
            aria-label="Refresh marketplace products"
            data-testid="marketplace-refresh"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-celo-dark transition-colors hover:bg-celo-forest-soft disabled:opacity-50 dark:text-celo-light dark:hover:bg-celo-forest-bright-soft"
          >
            <ArrowsClockwise
              className={cn("h-5 w-5", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
          </button>
        </div>
        <p className="mb-6 text-sm text-neutral-600">
          Discover products from sellers across Africa
        </p>

        <MarketplaceGrid products={products} />

        {query.hasNextPage ? (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => query.fetchNextPage()}
              disabled={isLoadingMore}
              variant="outline"
              className="min-h-[44px] min-w-[160px]"
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
