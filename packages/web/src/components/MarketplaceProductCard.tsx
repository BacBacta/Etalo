import Image from "next/image";
import Link from "next/link";
import { memo } from "react";

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
  /** LCP optimization — when true, the underlying Next/Image renders
   *  with `priority` so the first card image (above-the-fold LCP
   *  candidate) loads eagerly with fetchpriority=high. */
  priority?: boolean;
}

// Marketplace endpoint omits stock to keep the listing payload light ;
// the cart-token POST re-validates against live stock at checkout.
// 999 = "assume available", surfaces the real out-of-stock error only
// when the buyer commits.
const ASSUMED_STOCK = 999;

// Country flag emojis surfaced on the card as a subtle backdrop-blur
// chip top-left when the marketplace is in the "All countries" view.
// Same map lives in CountryFilterChips so the visual language is
// consistent across the filter bar and the result cards.
const COUNTRY_FLAGS: Record<string, string> = {
  NGA: "🇳🇬",
  GHA: "🇬🇭",
  KEN: "🇰🇪",
};

// "New" badge cutoff — anything pinned to IPFS within the last 7
// days gets a small pill, gives the marketplace a sense of freshness
// without needing real time-based queries.
const NEW_BADGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function MarketplaceProductCardImpl({
  product,
  hideSellerCountry = false,
  priority = false,
}: Props) {
  const country = countryName(product.seller_country);
  const flag = product.seller_country
    ? COUNTRY_FLAGS[product.seller_country]
    : undefined;

  const isNew = (() => {
    if (!product.created_at) return false;
    const created = new Date(product.created_at).getTime();
    if (Number.isNaN(created)) return false;
    return Date.now() - created < NEW_BADGE_THRESHOLD_MS;
  })();

  return (
    <div className="group relative">
      <CardV4
        variant="default"
        padding="none"
        interactive
        className="overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-celo-light/5"
        data-testid="marketplace-product-card-wrapper"
      >
        <Link
          href={`/${product.seller_handle}/${product.slug}`}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2"
        >
          {/* Image area — square. Light/dark backdrops kept from the
              previous design ; on hover the image subtly zooms (1.05)
              to give the card a tactile feel. */}
          <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-celo-dark-elevated">
            {product.primary_image_url ? (
              <Image
                src={product.primary_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                priority={priority}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-celo-light/50">
                No image
              </div>
            )}

            {/* Floating overlays on the image. Top-left : country flag
                chip (hidden when the marketplace is already filtered to
                that country). Top-right : the cart "+" button. Bottom-
                left : "New" pill for recently-pinned products. All use
                backdrop-blur so they don't fight the underlying photo. */}
            {flag && !hideSellerCountry ? (
              <span
                aria-label={`Ships from ${country ?? product.seller_country ?? ""}`}
                title={country ?? product.seller_country ?? undefined}
                className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-celo-light/90 px-2 py-1 text-sm font-medium leading-none text-celo-dark shadow-sm backdrop-blur dark:bg-celo-dark-bg/85 dark:text-celo-light"
              >
                <span aria-hidden className="text-base leading-none">
                  {flag}
                </span>
                {country ?? product.seller_country}
              </span>
            ) : null}

            {isNew ? (
              <span
                className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-celo-yellow/95 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-celo-dark shadow-sm backdrop-blur"
                aria-label="Recently added product"
              >
                New
              </span>
            ) : null}

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

          {/* Card meta : price-prominent over title (Robinhood / Shop
              pattern). USDT suffix is muted so the eye lands on the
              number first. Seller name in a smaller, lighter row to
              keep the hierarchy clean even on long boutique names. */}
          <div className="p-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums text-celo-dark dark:text-celo-light">
                {Number(product.price_usdt).toFixed(2)}
              </span>
              <span className="text-sm text-neutral-500 dark:text-celo-light/60">
                USDT
              </span>
            </div>
            <h3 className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-celo-dark dark:text-celo-light">
              {product.title}
            </h3>
            <p className="mt-1.5 truncate text-sm text-neutral-500 dark:text-celo-light/60">
              {product.seller_shop_name}
            </p>
          </div>
        </Link>
      </CardV4>
    </div>
  );
}

// React.memo wrap (PR3.2 LCP) — the marketplace grid mounts up to
// 20 cards per page (4 cols × 5 rows on lg) and re-renders on every
// pull-to-refresh tick + active-filter pill click. The product
// object reference is stable across re-renders (TanStack Query
// memoizes the page array) so a shallow compare hits 100 % of the
// time — saves ~20 React reconciliation passes per parent re-render
// on a full page of cards. AddToCartIcon is the only mutable bit
// inside ; it manages its own state.
export const MarketplaceProductCard = memo(MarketplaceProductCardImpl);
