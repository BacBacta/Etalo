import { MarketplaceProductCard } from "@/components/MarketplaceProductCard";
import type { MarketplaceProductItem } from "@/lib/api";

interface Props {
  products: MarketplaceProductItem[];
}

export function MarketplaceGrid({ products }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <MarketplaceProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
