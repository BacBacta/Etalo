/**
 * MarketplaceRail — horizontal scroll-snap carousel of product cards for
 * the curated discovery sections ("New this week", "Top-rated boutiques").
 *
 * Reuses MarketplaceProductCard in fixed-width slots so the premium card
 * treatment (portrait image, develop reveal, social proof) is consistent
 * between the rails and the main grid. Bleed-to-edge (-mx-4 px-4) gives
 * the native-carousel feel established by the filter chip rows.
 */
"use client";

import { MarketplaceProductCard } from "@/components/MarketplaceProductCard";
import type { MarketplaceProductItem } from "@/lib/api";

interface Props {
  title: string;
  products: MarketplaceProductItem[];
  /** Drop the per-card country tag when the rail is already scoped to a
   *  single market (the buyer knows the country). */
  hideSellerCountry?: boolean;
}

export function MarketplaceRail({ title, products, hideSellerCountry }: Props) {
  if (products.length === 0) return null;

  return (
    <section className="mt-7" aria-label={title}>
      <h2 className="mb-3 font-display text-display-4 text-celo-dark dark:text-celo-light">
        {title}
      </h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((product) => (
          <div
            key={product.id}
            className="w-40 shrink-0 snap-start sm:w-44"
          >
            <MarketplaceProductCard
              product={product}
              hideSellerCountry={hideSellerCountry}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
