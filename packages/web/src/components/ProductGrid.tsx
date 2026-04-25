import { ProductCard } from "@/components/ProductCard";
import type { BoutiquePublic } from "@/lib/api";

type ProductItem = BoutiquePublic["products"][number];

interface Props {
  products: BoutiquePublic["products"];
  handle: string;
}

export function ProductGrid({ products, handle }: Props) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 px-4 py-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p: ProductItem) => (
        <ProductCard key={p.id} product={p} handle={handle} />
      ))}
    </div>
  );
}
