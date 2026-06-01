/**
 * /marketplace — server component shell with SSR data injection.
 *
 * Phase A P1 (2026-05-15) — refactor from a `"use client"` page that
 * fetched products only after hydration → useQuery → response (LCP
 * gated at ~6.7 s by `resourceLoadDelay`). Now :
 *
 *   1. Server reads searchParams (country / q / category / sort).
 *   2. Creates a fresh QueryClient and `prefetchInfiniteQuery` for the
 *      first page using the SAME query key shape as the client hook
 *      `useMarketplaceProducts` so the cache hit is transparent.
 *   3. Wraps `<MarketplaceClient>` in `HydrationBoundary` carrying the
 *      dehydrated state — TanStack Query rehydrates on the client and
 *      the first product images start downloading from Pinata (with
 *      `priority` + the layout's `<link rel="preconnect">`) at the
 *      same time as the JS chunks parse, instead of after.
 *
 * No auth wiring (ADR-036 unaffected) because /marketplace is the
 * public funnel surface — buyer country comes from `useBuyerCountry`
 * client-side post-mount and only refines the filter, doesn't block
 * the first paint.
 *
 * The previous `Suspense` wrapper around `MarketplaceClient` is now
 * inside the client component itself (still required for
 * `useSearchParams` per Next.js App Router).
 */
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import MarketplaceClient from "@/app/(app)/marketplace/MarketplaceClient";
import { fetchMarketplaceProducts } from "@/lib/api";
import { MARKETPLACE_PRODUCTS_QUERY_KEY } from "@/hooks/useMarketplaceProducts";

// force-dynamic so the server reads the correct searchParams on each
// request. SSR prefetch is restricted to the initial load (no country/
// category/sort/q filters) so that HydrationBoundary's `state` prop
// never changes during client-side country-filter navigation.
// Changing the dehydrated state on subsequent RSC renders caused
// TanStack Query to re-hydrate while the client was mid-reconciliation,
// producing a crash. Country filter changes are purely client-side.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

function getStringParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return null;
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const rawCountry = getStringParam(searchParams?.country);
  const rawCategory = getStringParam(searchParams?.category);
  const rawSort = getStringParam(searchParams?.sort);
  const rawQ = getStringParam(searchParams?.q)?.trim() ?? "";

  // Only SSR-prefetch the unfiltered first page (initial load).
  // Once the user applies a country / category / sort / search filter,
  // the client fetches those results independently. This prevents the
  // HydrationBoundary from receiving a new `state` prop on every filter
  // navigation, which caused a hydration-during-reconciliation crash.
  const isInitialUnfilteredLoad =
    (!rawCountry || rawCountry === "all") &&
    (!rawCategory || rawCategory === "all") &&
    (!rawSort || rawSort === "newest") &&
    rawQ.length === 0;

  if (!isInitialUnfilteredLoad) {
    // Filtered navigations — let the client handle data fetching.
    return <MarketplaceClient />;
  }

  // TanStack Query v5 defaults skip dehydrating queries with the
  // server's default staleTime of 0. Match the client hook's 30 s so
  // the prefetched data survives the round-trip to the client cache.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });

  // Best-effort prefetch of the unfiltered first page for LCP.
  let dehydratedState: ReturnType<typeof dehydrate> | null = null;
  try {
    await queryClient.prefetchInfiniteQuery({
      queryKey: [
        ...MARKETPLACE_PRODUCTS_QUERY_KEY,
        "all",
        "",
        "all",
        "newest",
      ],
      queryFn: () =>
        fetchMarketplaceProducts({
          cursor: null,
          limit: 20,
          country: null,
          q: null,
          category: null,
          sort: null,
        }),
      initialPageParam: null as string | null,
    });
    dehydratedState = dehydrate(queryClient);
  } catch {
    // Silent fallback — client will fetch on mount.
  }

  return (
    <HydrationBoundary state={dehydratedState ?? undefined}>
      <MarketplaceClient />
    </HydrationBoundary>
  );
}
