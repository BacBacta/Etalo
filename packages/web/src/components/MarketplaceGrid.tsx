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
          // LCP optimization (Phase A P1) — first card image is the
          // marketplace LCP element. priority=true skips Next.js'
          // default lazy-loading + sets fetchpriority=high on the img.
          priority={idx === 0}
        />
      ))}
    </div>
  );
}
