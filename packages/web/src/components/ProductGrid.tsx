import { ProductCard } from "@/components/ProductCard";
import type { BoutiquePublic } from "@/lib/api";

type ProductItem = BoutiquePublic["products"][number];

interface Props {
  products: BoutiquePublic["products"];
  handle: string;
  sellerShopName: string;
}

export function ProductGrid({ products, handle, sellerShopName }: Props) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 px-4 py-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p: ProductItem, idx: number) => (
        <ProductCard
          key={p.id}
          product={p}
          handle={handle}
          sellerShopName={sellerShopName}
          // LCP optimization (Phase A P1) — first card image is almost
          // always the LCP element on /[handle] above-the-fold. Skip
          // Next.js' default lazy-loading on it.
          priority={idx === 0}
        />
      ))}
    </div>
  );
}
