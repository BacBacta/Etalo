"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { Button } from "@/components/ui/button";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import {
  fetchMarketplaceProducts,
  type MarketplaceProductItem,
} from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

export default function MarketplacePage() {
  const router = useRouter();
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);
  const [products, setProducts] = useState<MarketplaceProductItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) MiniPay gating — non-MiniPay users redirect to landing (HomeRouter
  // dispatches them to HomeMiniPay if it later detects MiniPay context).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const detected = detectMiniPay();
    setIsMiniPay(detected);
    if (!detected) {
      router.replace("/");
    }
  }, [router]);

  // 2) Initial fetch — fires only once MiniPay detected.
  useEffect(() => {
    if (isMiniPay !== true) return;
    let cancelled = false;
    fetchMarketplaceProducts(null, 20)
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        // OpenAPI schema treats omitted optionals as undefined; normalize.
        setCursor(data.pagination.next_cursor ?? null);
        setHasMore(data.pagination.has_more);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load marketplace. Please try again.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isMiniPay]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchMarketplaceProducts(cursor, 20);
      setProducts((prev) => [...prev, ...data.products]);
      setCursor(data.pagination.next_cursor ?? null);
      setHasMore(data.pagination.has_more);
    } catch {
      // Silent fail — user can retry by clicking Load more again.
    } finally {
      setLoadingMore(false);
    }
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

  if (loading) {
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h2 className="mb-3 text-xl font-semibold">
            Couldn&apos;t load marketplace
          </h2>
          <p className="mb-4 text-base text-neutral-700">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            className="min-h-[44px]"
          >
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

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">Marketplace</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Discover products from sellers across Africa
        </p>

        <MarketplaceGrid products={products} />

        {hasMore ? (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={handleLoadMore}
              disabled={loadingMore}
              variant="outline"
              className="min-h-[44px] min-w-[160px]"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
