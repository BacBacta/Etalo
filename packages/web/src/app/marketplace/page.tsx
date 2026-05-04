"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  PULL_RESISTANCE,
  PULL_TO_REFRESH_THRESHOLD_PX,
  PULL_VISUAL_CAP_PX,
  shouldTriggerRefreshOnRelease,
} from "@/app/marketplace/pull-to-refresh";
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

  // Sub-block 2.3b — pull-to-refresh state. `pullDistance` is the
  // visible translateY in px ; `isReleased` toggles the CSS transition
  // for the snap-back so the live drag stays jank-free. isPullingRef
  // and pullStartYRef stay outside React state to avoid re-rendering
  // on every pointermove tick.
  const [pullDistance, setPullDistance] = useState(0);
  const [isReleased, setIsReleased] = useState(false);
  const isPullingRef = useRef(false);
  const pullStartYRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Only initiate a pull when the page is scrolled to the very top.
    // Past zero, pointer events stay free for normal scroll / clicks.
    if (typeof window !== "undefined" && window.scrollY > 0) return;
    isPullingRef.current = true;
    pullStartYRef.current = e.clientY;
    setIsReleased(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPullingRef.current) return;
    const rawDelta = e.clientY - pullStartYRef.current;
    if (rawDelta <= 0) {
      // Upward drag aborts the gesture so the user can scroll without
      // fighting the pull state machine.
      isPullingRef.current = false;
      setIsReleased(true);
      setPullDistance(0);
      return;
    }
    const next = Math.min(rawDelta * PULL_RESISTANCE, PULL_VISUAL_CAP_PX);
    setPullDistance(next);
  };

  const handlePointerUp = () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (shouldTriggerRefreshOnRelease(pullDistance)) {
      query.refetch();
    }
    setIsReleased(true);
    setPullDistance(0);
  };

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
      <main id="main" className="min-h-screen" data-testid="marketplace-loading">
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
  const pullProgress = Math.min(pullDistance / PULL_TO_REFRESH_THRESHOLD_PX, 1);
  const pullThresholdReached = pullDistance >= PULL_TO_REFRESH_THRESHOLD_PX;

  // Snap-back uses a short CSS transition on transform / opacity ; live
  // pull stays transition-free so the indicator tracks the finger
  // 1:1 (minus the resistance constant). overscroll-contain on <main>
  // blocks the Android Chrome / WebView native pull-to-refresh from
  // firing in parallel and creating a double-refresh.
  const transitionClass = isReleased
    ? "transition-[transform,opacity] duration-300 ease-out"
    : "";

  return (
    <main
      id="main"
      className="relative min-h-screen overscroll-contain"
      data-testid="marketplace-pull-area"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Pull-to-refresh visual indicator. aria-hidden because the
          accessible refresh path is the visible Refresh button below ;
          this surface is touch-only enhancement. */}
      <div
        aria-hidden="true"
        data-testid="marketplace-pull-indicator"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3",
          transitionClass,
        )}
        style={{
          transform: `translateY(${Math.max(pullDistance - 40, 0)}px)`,
          opacity: pullProgress,
        }}
      >
        <div className="rounded-full bg-celo-light p-2 shadow-celo-md dark:bg-celo-dark-elevated dark:ring-1 dark:ring-celo-light/[8%]">
          <ArrowsClockwise
            aria-hidden="true"
            className={cn(
              "h-5 w-5 text-celo-dark transition-transform duration-200 dark:text-celo-light",
              isRefreshing && "animate-spin",
              !isRefreshing && pullThresholdReached && "rotate-180",
            )}
          />
        </div>
      </div>

      <div
        className={cn("min-h-screen", transitionClass)}
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
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
      </div>
    </main>
  );
}
