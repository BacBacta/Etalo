import Image from "next/image";
import Link from "next/link";

import { AddToCartIcon } from "@/components/AddToCartIcon";
import { CardV4 } from "@/components/ui/v4/Card";
import type { BoutiquePublic } from "@/lib/api";

interface Props {
  product: BoutiquePublic["products"][number];
  handle: string;
  sellerShopName: string;
  /** When true, the underlying Next/Image renders with `priority` so the
   *  first card image (above-the-fold LCP candidate) loads eagerly with
   *  fetchpriority=high. */
  priority?: boolean;
}

export function ProductCard({
  product,
  handle,
  sellerShopName,
  priority = false,
}: Props) {
  const isOutOfStock = product.stock <= 0;
  const price = Number(product.price_usdt).toFixed(2);
  return (
    <div className="relative">
      <CardV4
        variant="default"
        padding="none"
        interactive
        className="overflow-hidden"
        data-testid="product-card-wrapper"
      >
        <Link
          href={`/${handle}/${product.slug}`}
          className="block min-h-[44px] focus:outline-none focus:ring-2 focus:ring-celo-forest focus:ring-offset-2"
        >
          <div className="relative aspect-square bg-neutral-100 dark:bg-celo-dark-elevated">
            {product.primary_image_url ? (
              <Image
                src={product.primary_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
                priority={priority}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-celo-light/50">
                No image
              </div>
            )}
            {isOutOfStock ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-base font-medium text-white">
                Out of stock
              </div>
            ) : null}
          </div>
          <div className="p-3">
            <h3 className="line-clamp-2 text-base font-medium text-celo-dark dark:text-celo-light">
              {product.title}
            </h3>
            <p className="mt-1 text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
              {price} USDT
            </p>
          </div>
        </Link>
      </CardV4>
      <AddToCartIcon
        productId={product.id}
        productSlug={product.slug}
        sellerHandle={handle}
        sellerShopName={sellerShopName}
        title={product.title}
        priceUsdt={String(product.price_usdt)}
        imageUrl={product.primary_image_url ?? null}
        stock={product.stock}
      />
    </div>
  );
}
