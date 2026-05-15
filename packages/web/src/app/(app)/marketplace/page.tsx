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
import { isValidCategoryCode } from "@/lib/categories";
import { isValidCountryCode } from "@/components/CountrySelector";
import { fetchMarketplaceProducts } from "@/lib/api";
import { MARKETPLACE_PRODUCTS_QUERY_KEY } from "@/hooks/useMarketplaceProducts";

// `searchParams` arrive as a Record<string, string | string[]> in
// Next.js 14 App Router. Force-dynamic because the prefetch depends
// on URL state — static prerender of /marketplace?country=NGA wouldn't
// match /marketplace?country=GHA.
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
  // Resolve filters from URL — same shape as the client's URL-derived
  // memos so the prefetched cache key matches what the client computes.
  const rawCountry = getStringParam(searchParams?.country);
  const rawCategory = getStringParam(searchParams?.category);
  const rawSort = getStringParam(searchParams?.sort);
  const rawQ = getStringParam(searchParams?.q)?.trim() ?? "";

  const country =
    rawCountry && rawCountry !== "all" && isValidCountryCode(rawCountry)
      ? rawCountry
      : null;
  const category =
    rawCategory && rawCategory !== "all" && isValidCategoryCode(rawCategory)
      ? rawCategory
      : null;
  const sort =
    rawSort === "price_asc" || rawSort === "price_desc" ? rawSort : null;
  const q = rawQ.length > 0 ? rawQ : null;

  const queryClient = new QueryClient();
  // Best-effort prefetch — if the backend is down or slow the client
  // will refetch on mount. We never block the page render on this.
  try {
    await queryClient.prefetchInfiniteQuery({
      queryKey: [
        ...MARKETPLACE_PRODUCTS_QUERY_KEY,
        country ?? "all",
        q ?? "",
        category ?? "all",
        sort ?? "newest",
      ],
      queryFn: () =>
        fetchMarketplaceProducts({
          cursor: null,
          limit: 20,
          country,
          q,
          category,
          sort,
        }),
      initialPageParam: null as string | null,
    });
  } catch {
    // Silent fallback — let the client retry. The `/marketplace`
    // backend has its own Cache-Control so this rarely costs more than
    // a CDN hit.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MarketplaceClient />
    </HydrationBoundary>
  );
}
