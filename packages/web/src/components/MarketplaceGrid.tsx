import { MarketplaceProductCard } from "@/components/MarketplaceProductCard";
import type { MarketplaceProductItem } from "@/lib/api";

interface Props {
  products: MarketplaceProductItem[];
  /** Forwarded to each card. When the marketplace is filtered to a
   *  single country, the buyer already knows the country — surfacing
   *  it on each card line is repetition that costs precious truncation
   *  budget on the 360 px viewport. */
  hideSellerCountry?: boolean;
}

export function MarketplaceGrid({ products, hideSellerCountry }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, idx) => (
        <MarketplaceProductCard
          key={product.id}
          product={product}
          hideSellerCountry={hideSellerCountry}
          // LCP optimization — the first row of cards is above the
          // fold on every breakpoint we ship (mobile 2-col → 2 cards,
          // tablet 3-col → 3, desktop 4-col → 4). priority=true skips
          // Next.js' default lazy-loading + sets fetchpriority=high
          // on the img, so the LCP image starts downloading at the
          // same moment as the JS chunks parse. Index < 4 covers the
          // worst-case (desktop 4-col first row) without over-eager
          // loading on mobile.
          priority={idx < 4}
        />
      ))}
    </div>
  );
}
