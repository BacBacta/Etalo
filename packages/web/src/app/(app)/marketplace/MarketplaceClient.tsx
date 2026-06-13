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

import { ArrowsClockwise, GlobeHemisphereWest, MagnifyingGlass, Storefront, X } from "@phosphor-icons/react";
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
import { BuyerProtectionStrip } from "@/components/BuyerProtectionBadge";
import { CountryPromptBanner } from "@/components/CountryPromptBanner";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import type { MarketplaceProductItem } from "@/lib/api";
import {
  CategoryFilterChips,
  type CategoryFilterValue,
} from "@/components/marketplace/CategoryFilterChips";
import {
  CountryFilterChips,
  type CountryFilterValue,
} from "@/components/marketplace/CountryFilterChips";
import { FeaturedHero } from "@/components/marketplace/FeaturedHero";
import { MarketplaceRail } from "@/components/marketplace/MarketplaceRail";
import { MarketplaceSearchInput } from "@/components/marketplace/MarketplaceSearchInput";
import {
  SortDropdown,
  type SortValue,
} from "@/components/marketplace/SortDropdown";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { useBuyerCountry } from "@/hooks/useBuyerCountry";
import { useMarketplaceProducts } from "@/hooks/useMarketplaceProducts";
import { useMarketplaceSections } from "@/hooks/useMarketplaceSections";
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

// Curated featured pick — promote a *credible* product to the hero, not
// just the newest (`products[0]`). Prefer one that has an image, then a
// top-seller / proven boutique (most completed orders). Falls back to the
// first product so the hero never renders empty.
function pickFeaturedProduct(
  products: MarketplaceProductItem[],
): MarketplaceProductItem {
  const withImage = products.filter((p) => p.primary_image_url);
  const pool = withImage.length > 0 ? withImage : products;
  return [...pool].sort((a, b) => {
    const topDelta =
      (b.seller_is_top_seller ? 1 : 0) - (a.seller_is_top_seller ? 1 : 0);
    if (topDelta !== 0) return topDelta;
    return (b.seller_orders_completed ?? 0) - (a.seller_orders_completed ?? 0);
  })[0];
}

function MarketplaceLoadingShell() {
  return (
    <main id="main" className="min-h-screen" data-testid="marketplace-detecting">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <MarketplaceHero refreshDisabled />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCardV2 key={i} />
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
      // Set "all" explicitly in the URL so the memo doesn't fall back to
      // buyerCountry when the user deliberately clears the country filter.
      // Deleting the param would make urlCountry=null → countryFilter=buyerCountry
      // (e.g. NGA), ignoring the user's intent.
      params.set("country", next);
      router.replace(`${pathname}?${params.toString()}`);
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

  // The "discovery" view = no search, no category, default sort. Both
  // the editorial hero and the curated rails only surface here ; search
  // and category results stay a clean utilitarian grid.
  const isDiscovery =
    sortValue === "newest" &&
    categoryFilter === "all" &&
    urlQ.trim().length === 0;

  // Editorial featured hero — gated on >4 results so promoting the lead
  // never guts a thin grid. The hero product is excluded from the grid
  // to avoid a duplicate card. A country filter is fine: a featured pick
  // from that market still reads as curated.
  const showFeatured = isDiscovery && products.length > 4;
  const featuredProduct = showFeatured ? pickFeaturedProduct(products) : null;
  // Exclude the featured pick from the grid by id (it may not be index 0
  // anymore now that the hero is curated rather than newest-first).
  const gridProducts =
    featuredProduct !== null
      ? products.filter((p) => p.id !== featuredProduct.id)
      : products;

  // Curated discovery rails (New this week / Top-rated boutiques). Only
  // fetched on the discovery view ; scoped to the active country filter.
  const sectionsQuery = useMarketplaceSections({
    country: countryFilter,
    enabled: isDiscovery,
  });
  const sections = isDiscovery ? sectionsQuery.data?.sections ?? [] : [];

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
        <div className="mx-auto max-w-3xl px-4 py-4">
          <MarketplaceHero refreshDisabled />
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCardV2 key={i} />
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
            className="flex flex-col items-center gap-4 rounded-3xl border border-celo-sand bg-gradient-to-br from-celo-light to-celo-sand/40 p-8 text-center shadow-celo-sm dark:border-celo-light/[8%] dark:from-celo-dark-elevated dark:to-celo-dark-surface"
          >
            {/* Contextual icon — visual anchor for each empty state */}
            <span
              aria-hidden
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-celo-sand dark:bg-celo-dark-surface"
            >
              {hasSearchQuery ? (
                <MagnifyingGlass className="h-7 w-7 text-celo-forest dark:text-celo-forest-bright" weight="light" />
              ) : filteredOnCountry ? (
                <GlobeHemisphereWest className="h-7 w-7 text-celo-forest dark:text-celo-forest-bright" weight="light" />
              ) : (
                <Storefront className="h-7 w-7 text-celo-forest dark:text-celo-forest-bright" weight="light" />
              )}
            </span>

            {hasSearchQuery ? (
              <div className="space-y-2">
                <h2 className="font-display text-display-4 text-celo-dark dark:text-celo-light">
                  No products match &ldquo;{urlQ}&rdquo;
                </h2>
                <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
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
              </div>
            ) : filteredOnCountry ? (
              <div className="space-y-2">
                <h2 className="font-display text-display-4 text-celo-dark dark:text-celo-light">
                  No sellers in {countryName(countryFilter) ?? countryFilter}{" "}
                  yet
                </h2>
                <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
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
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="font-display text-display-4 text-celo-dark dark:text-celo-light">
                  No products yet
                </h2>
                <p className="text-sm text-celo-dark/60 dark:text-celo-light/60">
                  Etalo&apos;s marketplace is just getting started. Check back
                  soon!
                </p>
              </div>
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
          <MarketplaceHero
            isRefreshing={isRefreshing}
            onRefresh={() => query.refetch()}
          />

          <div className="mt-5">
            <MarketplaceSearchInput
              value={urlQ}
              onChange={updateSearchQuery}
            />
          </div>

          {/* Escrow guarantee — Etalo's core trust signal, stated once
              prominently at the top of the shopping surface. */}
          <BuyerProtectionStrip className="mt-4" />

          {showCountryBanner ? (
            <div className="mt-4">
              <CountryPromptBanner
                wallet={walletStr!}
                onSaved={(c) => {
                  handleBannerDismiss();
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

          <div className="mt-4 space-y-3">
            <CountryFilterChips
              value={countryFilter}
              onChange={updateCountryFilter}
              disabled={isRefreshing}
            />
            <CategoryFilterChips
              value={categoryFilter}
              onChange={updateCategoryFilter}
              disabled={isRefreshing}
            />
          </div>

          {/* Editorial focal point on the unfiltered discovery view */}
          {featuredProduct ? (
            <div className="mt-5">
              <FeaturedHero product={featuredProduct} />
            </div>
          ) : null}

          {/* Curated rails — horizontal carousels of New this week +
              Top-rated boutiques. Empty rails are omitted server-side. */}
          {sections.map((section) => (
            <MarketplaceRail
              key={section.key}
              // The top_rated rail shows one product per trusted boutique;
              // "From top-rated boutiques" reads truthfully (they're
              // products, not boutique cards).
              title={
                section.key === "top_rated"
                  ? "From top-rated boutiques"
                  : section.title
              }
              products={section.products}
              hideSellerCountry={countryFilter !== "all"}
            />
          ))}

          {/* "Browse all" divider — only when rails precede the grid, so
              the full listing reads as a distinct zone below the curation. */}
          {sections.length > 0 ? (
            <h2 className="mt-7 font-display text-display-4 text-celo-dark dark:text-celo-light">
              Browse all
            </h2>
          ) : null}

          {/* Results meta strip — active filter chips on the left,
              count + sort dropdown on the right. Always rendered so
              the layout stays stable between filter states. */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ActiveFiltersBar
              countryFilter={countryFilter}
              categoryFilter={categoryFilter}
              searchQuery={urlQ}
              productCount={products.length}
              onClearCountry={() => updateCountryFilter("all")}
              onClearCategory={() => updateCategoryFilter("all")}
              onClearSearch={() => updateSearchQuery("")}
              onResetAll={() => {
                updateCountryFilter("all");
                updateCategoryFilter("all");
                updateSearchQuery("");
              }}
            />
            <div className="flex-shrink-0">
              <SortDropdown
                value={sortValue}
                onChange={updateSort}
                disabled={isRefreshing}
              />
            </div>
          </div>

          <div className="mt-5">
            <MarketplaceGrid
              products={gridProducts}
              hideSellerCountry={countryFilter !== "all"}
            />
          </div>

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

// =====================================================================
// MarketplaceHero — branded header strip with title, subtitle, and the
// refresh button. Same wrapper used by the skeleton state so the
// transition skeleton → loaded doesn't shift the title row.
// =====================================================================

interface MarketplaceHeroProps {
  isRefreshing?: boolean;
  refreshDisabled?: boolean;
  onRefresh?: () => void;
}

function MarketplaceHero({
  isRefreshing = false,
  refreshDisabled = false,
  onRefresh,
}: MarketplaceHeroProps) {
  // Warm gradient strip with subtle dot pattern + two-level typographic
  // lockup. -mx-4 bleeds to page edges (same pattern as filter chips).
  // rounded-b-3xl matches CardV4 language. Stays compact on 360 px.
  return (
    <div className="relative -mx-4 overflow-hidden rounded-b-3xl bg-gradient-to-r from-celo-light to-celo-sand px-4 py-4 dark:from-celo-dark-elevated dark:to-celo-dark-surface">
      {/* Decorative dot pattern — purely visual, aria-hidden */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #476520 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-celo-forest/70 dark:text-celo-forest-bright/70">
            Etalo
          </p>
          <h1 className="font-display text-display-3 text-celo-dark dark:text-celo-light">
            Marketplace
          </h1>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || refreshDisabled}
            aria-label="Refresh marketplace products"
            data-testid="marketplace-refresh"
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-celo-dark transition-colors hover:bg-celo-forest/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:text-celo-light dark:hover:bg-celo-forest-bright/15"
          >
            <ArrowsClockwise
              className={cn("h-5 w-5", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
          </button>
        ) : (
          <div className="h-11 w-11 flex-shrink-0" aria-hidden />
        )}
      </div>
    </div>
  );
}

// =====================================================================
// ActiveFiltersBar — visible recap of what's currently filtered with
// per-filter remove buttons + a "Reset all" link when 2+ filters
// stack. Shows a count of matched products when no filter is active
// so the buyer still gets context.
// =====================================================================

interface ActiveFiltersBarProps {
  countryFilter: CountryFilterValue;
  categoryFilter: CategoryFilterValue;
  searchQuery: string;
  productCount: number;
  onClearCountry: () => void;
  onClearCategory: () => void;
  onClearSearch: () => void;
  onResetAll: () => void;
}

function ActiveFiltersBar({
  countryFilter,
  categoryFilter,
  searchQuery,
  productCount,
  onClearCountry,
  onClearCategory,
  onClearSearch,
  onResetAll,
}: ActiveFiltersBarProps) {
  const activeCount =
    (countryFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0);

  if (activeCount === 0) {
    return (
      <p
        className="text-sm text-neutral-600 tabular-nums dark:text-celo-light/70"
        data-testid="marketplace-results-count"
      >
        <span className="font-semibold text-celo-dark dark:text-celo-light">
          {productCount}
        </span>{" "}
        {productCount === 1 ? "product" : "products"}
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="marketplace-active-filters"
    >
      <span className="text-sm text-neutral-500 dark:text-celo-light/60">
        Filters:
      </span>
      {countryFilter !== "all" ? (
        <FilterPill
          label={countryName(countryFilter) ?? countryFilter}
          onRemove={onClearCountry}
        />
      ) : null}
      {categoryFilter !== "all" ? (
        <FilterPill
          label={
            categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1)
          }
          onRemove={onClearCategory}
        />
      ) : null}
      {searchQuery.trim().length > 0 ? (
        <FilterPill label={`"${searchQuery.trim()}"`} onRemove={onClearSearch} />
      ) : null}
      {activeCount >= 2 ? (
        <button
          type="button"
          onClick={onResetAll}
          className="text-sm font-medium text-celo-forest underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:text-celo-green"
        >
          Reset all
        </button>
      ) : null}
      <span
        className="ml-auto text-sm text-neutral-500 tabular-nums dark:text-celo-light/60"
        aria-live="polite"
      >
        {productCount} {productCount === 1 ? "match" : "matches"}
      </span>
    </div>
  );
}

interface FilterPillProps {
  label: string;
  onRemove: () => void;
}

function FilterPill({ label, onRemove }: FilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-celo-forest/30 bg-celo-forest-soft px-2 py-0.5 text-sm font-medium text-celo-forest dark:border-celo-green/30 dark:bg-celo-forest-bright-soft dark:text-celo-light">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-celo-forest/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:hover:bg-celo-green/20"
      >
        <X className="h-3 w-3" weight="bold" aria-hidden />
      </button>
    </span>
  );
}

// =====================================================================
// SkeletonCardV2 — mirrors the premium MarketplaceProductCard shape:
// portrait 3:4 image + price (h-6) + 2 title rows + seller row.
// =====================================================================

function SkeletonCardV2() {
  return (
    <div
      className="overflow-hidden rounded-3xl border border-celo-dark/[8%] bg-celo-light shadow-celo-md dark:border-celo-light/[8%] dark:bg-celo-dark-elevated"
      role="status"
      aria-label="Loading product"
    >
      <SkeletonV5
        variant="rectangle"
        className="aspect-[3/4] w-full rounded-t-3xl rounded-b-none"
      />
      <div className="space-y-2 px-3 pb-3 pt-2.5">
        <SkeletonV5 variant="text" className="h-6 w-16" />
        <SkeletonV5 variant="text" className="h-4 w-full" />
        <SkeletonV5 variant="text" className="h-4 w-3/4" />
        <SkeletonV5 variant="text" className="h-4 w-1/2" />
      </div>
    </div>
  );
}
