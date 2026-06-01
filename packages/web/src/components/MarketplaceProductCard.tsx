"use client";

import { Storefront } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";

import { AddToCartIcon } from "@/components/AddToCartIcon";
import { CardV4 } from "@/components/ui/v4/Card";
import type { MarketplaceProductItem } from "@/lib/api";
import { countryName } from "@/lib/country";
import { cn } from "@/lib/utils";

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

  // Image "develop" reveal — heterogeneous seller photos pop in harshly
  // on a fast connection. Fading each in on decode gives the grid a
  // calm, uniform load rhythm regardless of per-image latency.
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Guard the cached/priority case: a fast-cached image can fire `load`
  // before React attaches onLoad, which would strand it at opacity-0.
  // On mount, if the underlying img is already complete, reveal it.
  useEffect(() => {
    if (imgRef.current?.complete) setImgLoaded(true);
  }, []);

  // Only darken the image bottom when the country chip actually sits
  // there — otherwise the scrim needlessly mutes clean product photos.
  const showFlag = Boolean(flag) && !hideSellerCountry;

  return (
    <div className="group relative">
      <CardV4
        variant="elevated"
        padding="none"
        interactive
        className="overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-celo-hero"
        data-testid="marketplace-product-card-wrapper"
      >
        <Link
          href={`/${product.seller_handle}/${product.slug}`}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2"
        >
          {/* Image area — portrait 3:4 for boutique gallery feel. An
              inset ring frames every photo identically so heterogeneous
              seller uploads (white-bg studio shots vs full-bleed photos)
              share one consistent edge treatment. */}
          <div className="relative aspect-[3/4] overflow-hidden rounded-t-3xl rounded-b-none bg-celo-sand/40 ring-1 ring-inset ring-celo-dark/[5%] dark:bg-celo-dark-elevated dark:ring-celo-light/[6%]">
            {product.primary_image_url ? (
              <Image
                ref={imgRef}
                src={product.primary_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                onLoad={() => setImgLoaded(true)}
                className={cn(
                  "object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-105",
                  imgLoaded ? "opacity-100" : "opacity-0",
                )}
                priority={priority}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <Storefront
                  className="h-8 w-8 text-celo-dark/20 dark:text-celo-light/20"
                  weight="light"
                  aria-hidden
                />
                <span className="text-sm text-celo-dark/40 dark:text-celo-light/40">
                  No image
                </span>
              </div>
            )}

            {/* Bottom gradient overlay — only when the country chip sits
                there ; otherwise we'd needlessly mute clean photos. */}
            {showFlag ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-celo-dark/50 to-transparent"
              />
            ) : null}

            {/* "New" badge — top-left, fixes text-xs → text-sm violation */}
            {isNew ? (
              <span
                className="absolute left-2 top-2 inline-flex items-center rounded-full bg-celo-yellow px-2.5 py-0.5 text-sm font-semibold uppercase tracking-wider text-celo-dark"
                aria-label="Recently added product"
              >
                New
              </span>
            ) : null}

            {/* Country flag chip — bottom-left over gradient overlay */}
            {showFlag ? (
              <span
                aria-label={`Ships from ${country ?? product.seller_country ?? ""}`}
                title={country ?? product.seller_country ?? undefined}
                className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-sm font-medium leading-none text-celo-dark shadow-celo-sm backdrop-blur-sm dark:bg-celo-dark-surface/85 dark:text-celo-light"
              >
                <span aria-hidden className="text-base leading-none">
                  {flag}
                </span>
                {country ?? product.seller_country}
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

          {/* Card meta — price is the visual hero (display-4 scale),
              title and seller descend in weight and size. */}
          <div className="px-3 pb-3 pt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-display-4 tabular-nums text-celo-dark dark:text-celo-light">
                {Number(product.price_usdt).toFixed(2)}
              </span>
              <span className="text-sm font-medium text-celo-dark/50 dark:text-celo-light/50">
                USDT
              </span>
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-celo-dark/85 dark:text-celo-light/85">
              {product.title}
            </h3>
            <p className="mt-1 truncate text-sm text-celo-dark/50 dark:text-celo-light/50">
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
MarketplaceProductCard.displayName = "MarketplaceProductCard";
