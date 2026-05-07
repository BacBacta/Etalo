import Image from "next/image";
import Link from "next/link";

import { AddToCartIcon } from "@/components/AddToCartIcon";
import { CardV4 } from "@/components/ui/v4/Card";
import type { MarketplaceProductItem } from "@/lib/api";
import { countryName } from "@/lib/country";

interface Props {
  product: MarketplaceProductItem;
  /** When true, the seller meta line drops the trailing `· {country}`
   *  suffix because the marketplace is already filtered to that
   *  country (UX rule 5). Default false (All countries view shows
   *  the country tag for context). */
  hideSellerCountry?: boolean;
}

// Marketplace endpoint omits stock to keep the listing payload light;
// the cart-token POST re-validates against live stock at checkout.
// 999 = "assume available", surfaces the real out-of-stock error only
// when the buyer commits.
const ASSUMED_STOCK = 999;

export function MarketplaceProductCard({
  product,
  hideSellerCountry = false,
}: Props) {
  const country = countryName(product.seller_country);
  const sellerLine =
    country && !hideSellerCountry
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
          {/* Image area : neutral-100 in light, neutral-800 in dark so
              the placeholder no longer burns as a stark white square
              on dark mode (the screenshot bug — bg-neutral-100 had no
              dark variant). */}
          <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
            {product.primary_image_url ? (
              <Image
                src={product.primary_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
                No image
              </div>
            )}
            {/* `+` button moved to the IMAGE area's top-right so it
                never overlaps the price/seller meta footer (the
                screenshot showed it covering the seller line on the
                Red Ankara Dress card). The image area is large + has
                its own backdrop, so a circular button reads cleanly. */}
            <AddToCartIcon
              productId={product.id}
              productSlug={product.slug}
              sellerHandle={product.seller_handle}
              sellerShopName={product.seller_shop_name}
              title={product.title}
              priceUsdt={String(product.price_usdt)}
              imageUrl={product.primary_image_url ?? null}
              stock={ASSUMED_STOCK}
              position="top-right"
            />
          </div>
          {/* Card meta : price-prominent (display-4 + tabular-nums)
              over the title because price is the primary buyer-side
              decision driver. Title second, seller third. Pattern
              borrowed from Robinhood / Shop. */}
          <div className="p-3">
            <p className="text-base font-semibold tabular-nums text-celo-dark dark:text-celo-light">
              {Number(product.price_usdt).toFixed(2)} USDT
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-medium text-celo-dark dark:text-celo-light">
              {product.title}
            </h3>
            <p className="mt-1 truncate text-sm text-neutral-600 dark:text-neutral-400">
              {sellerLine}
            </p>
          </div>
        </Link>
      </CardV4>
    </div>
  );
}
