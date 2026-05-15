/**
 * MarketplaceClient — interactive shell for /marketplace.
 *
 * Holds all the client state : URL search params, country/category/sort
 * filters, search input, pull-to-refresh gesture, infinite query.
 *
 * Phase A P1 (2026-05-15) — split out of `page.tsx` so the page itself
 * becomes a server component that can `prefetchInfiniteQuery` the
 * first page of products + dehydrate into HydrationBoundary. Net :
 * the first product image starts loading at the same time as the JS
 * chunks instead of waiting for hydration → useQuery → response,
 * which previously gated LCP at ~6.7 s on this route.
 */
"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount } from "wagmi";

import {
  PULL_RESISTANCE,
  PULL_TO_REFRESH_THRESHOLD_PX,
  PULL_VISUAL_CAP_PX,
  shouldTriggerRefreshOnRelease,
} from "@/app/(app)/marketplace/pull-to-refresh";
import { CountryPromptBanner } from "@/components/CountryPromptBanner";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import {
  CategoryFilterChips,
  type CategoryFilterValue,
} from "@/components/marketplace/CategoryFilterChips";
import {
  CountryFilterChips,
  type CountryFilterValue,
} from "@/components/marketplace/CountryFilterChips";
import { MarketplaceSearchInput } from "@/components/marketplace/MarketplaceSearchInput";
import {
  SortDropdown,
  type SortValue,
} from "@/components/marketplace/SortDropdown";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";
import { useMarketplaceProducts } from "@/hooks/useMarketplaceProducts";
import { isValidCountryCode } from "@/components/CountrySelector";
import { isValidCategoryCode } from "@/lib/categories";
import { countryName } from "@/lib/country";
import { cn } from "@/lib/utils";

const COUNTRY_PROMPT_DISMISSED_KEY = "country-prompt-dismissed";

function readDismissedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(COUNTRY_PROMPT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function MarketplaceLoadingShell() {
  return (
    <main id="main" className="min-h-screen" data-testid="marketplace-detecting">
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

export default function MarketplaceClient() {
  // Next.js App Router : useSearchParams must be inside a Suspense
  // boundary — wrapping the body so static prerender works for the
  // outer shell while client-only filter state hydrates inside.
  return (
    <Suspense fallback={<MarketplaceLoadingShell />}>
      <MarketplaceClientInner />
    </Suspense>
  );
}

function MarketplaceClientInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ADR-052 — marketplace browse no longer gates on MiniPay context.
  // Chrome visitors (with or without an injected wallet) can browse
  // freely. Wallet-required actions (add to cart, checkout) prompt
  // for connection at the moment they're needed instead of behind a
  // route-level gate.

  // Country filter resolution priority :
  //   1. URL ?country=NGA → user override always wins
  //   2. useBuyerCountry profile country → auto-detected when wallet
  //      connected (MiniPay auto, Chrome via ConnectWalletButton)
  //   3. "all" → no filter, show every market
  const { address: wallet, isConnected } = useAccount();
  const walletStr = wallet?.toLowerCase();
  const buyerCountryQuery = useBuyerCountry({
    wallet: walletStr,
    enabled: isConnected,
  });
  const buyerCountry = buyerCountryQuery.data?.country ?? null;

  const urlCountry = searchParams?.get("country") ?? null;
  const urlQ = searchParams?.get("q") ?? "";
  const urlCategory = searchParams?.get("category") ?? null;
  const urlSort = searchParams?.get("sort") ?? null;
  const countryFilter: CountryFilterValue = useMemo(() => {
    if (urlCountry === "all") return "all";
    if (urlCountry && isValidCountryCode(urlCountry)) return urlCountry;
    if (buyerCountry && isValidCountryCode(buyerCountry)) return buyerCountry;
    return "all";
  }, [urlCountry, buyerCountry]);
  const categoryFilter: CategoryFilterValue = useMemo(() => {
    if (urlCategory === "all" || urlCategory === null) return "all";
    if (isValidCategoryCode(urlCategory)) return urlCategory;
    return "all";
  }, [urlCategory]);
  const sortValue: SortValue = useMemo(() => {
    if (urlSort === "price_asc" || urlSort === "price_desc") return urlSort;
    return "newest";
  }, [urlSort]);

  const updateCountryFilter = useCallback(
    (next: CountryFilterValue) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "all") {
        params.delete("country");
      } else {
        params.set("country", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // Search query lives in URL state so a buyer who shared a deeplink
  // (or hit back) gets the same filtered listing. Updates are debounced
  // upstream by MarketplaceSearchInput so router.replace is hit at most
  // once per ~300 ms of typing — no per-keystroke history pollution.
  const updateSearchQuery = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const trimmed = next.trim();
      if (trimmed.length === 0) {
        params.delete("q");
      } else {
        params.set("q", trimmed);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const updateCategoryFilter = useCallback(
    (next: CategoryFilterValue) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "all") {
        params.delete("category");
      } else {
        params.set("category", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const updateSort = useCallback(
    (next: SortValue) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      // "newest" is the default — keep the URL clean for shareable
      // links.
      if (next === "newest") {
        params.delete("sort");
      } else {
        params.set("sort", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // CountryPromptBanner — shows once per session when buyer is connected
  // but has no country in their profile. Session-only dismiss (re-prompt
  // next visit) so the user is gently nudged toward declaring country
  // without permanent silencing.
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    readDismissedFromStorage(),
  );
  const handleBannerDismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(COUNTRY_PROMPT_DISMISSED_KEY, "true");
      } catch {
        // Private mode / quota — non-fatal.
      }
    }
    setBannerDismissed(true);
  }, []);
  const showCountryBanner =
    isConnected &&
    walletStr !== undefined &&
    buyerCountryQuery.isSuccess &&
    buyerCountry === null &&
    !bannerDismissed;

  // Sub-block 2.3a — useInfiniteQuery replaces the previous useState
  // (products / cursor / hasMore / loading / loadingMore / error) +
  // useEffect plumbing. Always enabled post-ADR-052 (no MiniPay gate).
  const query = useMarketplaceProducts({
    enabled: true,
    country: countryFilter,
    q: urlQ,
    category: categoryFilter,
    sort: sortValue,
  });

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
    const filteredOnCountry = countryFilter !== "all";
    const hasSearchQuery = urlQ.trim().length > 0;
    return (
      <main
        id="main"
        className="min-h-screen"
      >
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="mb-3 text-xl font-semibold">Marketplace</h1>
          <MarketplaceSearchInput
            value={urlQ}
            onChange={updateSearchQuery}
            className="mb-3"
          />
          <CountryFilterChips
            value={countryFilter}
            onChange={updateCountryFilter}
            className="mb-3"
          />
          <CategoryFilterChips
            value={categoryFilter}
            onChange={updateCategoryFilter}
            className="mb-3"
          />
          <SortDropdown
            value={sortValue}
            onChange={updateSort}
            className="mb-6"
          />
          <div
            data-testid="marketplace-empty"
            className="flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white p-8 text-center dark:border-celo-light/[8%] dark:bg-celo-dark-elevated"
          >
            {hasSearchQuery ? (
              <>
                <h2 className="mb-2 text-lg font-medium">
                  No products match &ldquo;{urlQ}&rdquo;
                </h2>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Try a different word or clear the search.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateSearchQuery("")}
                  data-testid="marketplace-empty-clear-search"
                  className="min-h-[44px]"
                >
                  Clear search
                </Button>
              </>
            ) : filteredOnCountry ? (
              <>
                <h2 className="mb-2 text-lg font-medium">
                  No sellers in {countryName(countryFilter) ?? countryFilter}{" "}
                  yet
                </h2>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Try &quot;All countries&quot; or check back soon.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateCountryFilter("all")}
                  data-testid="marketplace-empty-clear-filter"
                  className="min-h-[44px]"
                >
                  + All countries
                </Button>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-medium">No products yet</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Etalo&apos;s marketplace is just getting started. Check back
                  soon!
                </p>
              </>
            )}
          </div>
        </div>
      </main>
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
          {/* Subtitle "Discover products from sellers across Africa"
              dropped : low contrast on dark mode + redundant context
              given the country chips below. ~24 px reclaimed above the
              fold on a 360 px viewport. */}

          <MarketplaceSearchInput
            value={urlQ}
            onChange={updateSearchQuery}
            className="mb-3"
          />

          {showCountryBanner ? (
            <div className="mb-4">
              <CountryPromptBanner
                wallet={walletStr!}
                onSaved={(c) => {
                  // Persist a session dismiss so the banner doesn't re-show
                  // mid-browse after the user just resolved it. The next
                  // page reload re-checks profile.country and skips the
                  // banner naturally.
                  handleBannerDismiss();
                  // Sync the URL filter to the picked country if no
                  // explicit override was set.
                  if (urlCountry === null) {
                    updateCountryFilter(c);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleBannerDismiss}
                data-testid="country-prompt-dismiss"
                className="mt-2 inline-flex min-h-[44px] items-center px-2 text-sm text-neutral-500 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:text-celo-light/70"
              >
                Not now
              </button>
            </div>
          ) : null}

          <CountryFilterChips
            value={countryFilter}
            onChange={updateCountryFilter}
            className="mb-3"
            disabled={isRefreshing}
          />
          <CategoryFilterChips
            value={categoryFilter}
            onChange={updateCategoryFilter}
            className="mb-3"
            disabled={isRefreshing}
          />
          <SortDropdown
            value={sortValue}
            onChange={updateSort}
            className="mb-6"
            disabled={isRefreshing}
          />

          <MarketplaceGrid
            products={products}
            hideSellerCountry={countryFilter !== "all"}
          />

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
