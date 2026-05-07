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
      {products.map((product) => (
        <MarketplaceProductCard
          key={product.id}
          product={product}
          hideSellerCountry={hideSellerCountry}
        />
      ))}
    </div>
  );
}
