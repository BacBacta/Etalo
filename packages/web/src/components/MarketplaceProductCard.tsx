import Image from "next/image";
import Link from "next/link";

import { AddToCartIcon } from "@/components/AddToCartIcon";
import { CardV4 } from "@/components/ui/v4/Card";
import type { MarketplaceProductItem } from "@/lib/api";
import { countryName } from "@/lib/country";

interface Props {
  product: MarketplaceProductItem;
}

// Marketplace endpoint omits stock to keep the listing payload light;
// the cart-token POST re-validates against live stock at checkout.
// 999 = "assume available", surfaces the real out-of-stock error only
// when the buyer commits.
const ASSUMED_STOCK = 999;

export function MarketplaceProductCard({ product }: Props) {
  const country = countryName(product.seller_country);
  const sellerLine = country
    ? `${product.seller_shop_name} · ${country}`
    : product.seller_shop_name;

  return (
    <div className="relative">
      <CardV4
        variant="default"
        padding="none"
        interactive
        className="overflow-hidden"
        data-testid="marketplace-product-card-wrapper"
      >
        <Link
          href={`/${product.seller_handle}/${product.slug}`}
          className="block min-h-[44px] focus:outline-none focus:ring-2 focus:ring-celo-forest focus:ring-offset-2"
        >
          <div className="relative aspect-square bg-neutral-100">
            {product.primary_image_url ? (
              <Image
                src={product.primary_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                No image
              </div>
            )}
          </div>
          <div className="p-3">
            <h3 className="line-clamp-2 text-base font-medium">
              {product.title}
            </h3>
            <p className="mt-1 text-base font-semibold">
              {Number(product.price_usdt).toFixed(2)} USDT
            </p>
            <p className="mt-1 truncate text-sm text-neutral-600">
              {sellerLine}
            </p>
          </div>
        </Link>
      </CardV4>
      <AddToCartIcon
        productId={product.id}
        productSlug={product.slug}
        sellerHandle={product.seller_handle}
        sellerShopName={product.seller_shop_name}
        title={product.title}
        priceUsdt={String(product.price_usdt)}
        imageUrl={product.primary_image_url ?? null}
        stock={ASSUMED_STOCK}
      />
    </div>
  );
}
