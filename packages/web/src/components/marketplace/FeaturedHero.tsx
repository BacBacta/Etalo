/**
 * FeaturedHero — editorial focal point for the default marketplace view.
 *
 * Turns the flat "grid of equals" into a curated surface : the lead
 * product is promoted to a full-bleed cinematic banner with overlaid
 * title / price / seller and a primary "Shop" affordance. Shown only on
 * the unfiltered discovery view (no search, no category) — search and
 * category results stay a clean grid, matching premium-commerce norms
 * where the "home" is editorial and results are utilitarian.
 *
 * Pure frontend : the lead item is the first product of the existing
 * infinite query. True multi-rail curation ("Trending in Lagos") needs
 * backend signals (sales counts, geo) and is deferred as a feature.
 */
"use client";

import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { m, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import type { MarketplaceProductItem } from "@/lib/api";
import { countryName } from "@/lib/country";

const COUNTRY_FLAGS: Record<string, string> = {
  NGA: "🇳🇬",
  GHA: "🇬🇭",
  KEN: "🇰🇪",
};

interface Props {
  product: MarketplaceProductItem;
}

export function FeaturedHero({ product }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const country = countryName(product.seller_country);
  const flag = product.seller_country
    ? COUNTRY_FLAGS[product.seller_country]
    : undefined;

  return (
    <m.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 28 }}
      data-testid="marketplace-featured-hero"
    >
      <Link
        href={`/${product.seller_handle}/${product.slug}`}
        className="group relative block overflow-hidden rounded-3xl shadow-celo-lg transition-shadow duration-300 hover:shadow-celo-hero focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/5] w-full bg-celo-sand/40 dark:bg-celo-dark-elevated sm:aspect-[16/10]">
          {product.primary_image_url ? (
            <Image
              src={product.primary_image_url}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              priority
            />
          ) : null}

          {/* Cinematic scrim — anchors the overlaid type, always dark
              so the light text reads in both color schemes. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-celo-dark/85 via-celo-dark/25 to-transparent"
          />

          {/* "Featured" overline chip — frosted, top-left */}
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-celo-light/15 px-3 py-1 text-sm font-medium uppercase tracking-wider text-celo-light backdrop-blur-sm">
            <Sparkle weight="fill" className="h-3.5 w-3.5" aria-hidden />
            Featured
          </span>
        </div>

        {/* Overlaid content */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-display-2 leading-[1.05] text-celo-light">
              {product.title}
            </h2>
            <div className="flex items-center gap-2 text-celo-light/80">
              <span className="font-display text-display-4 tabular-nums text-celo-light">
                {Number(product.price_usdt).toFixed(2)}
                <span className="ml-1 text-sm font-medium text-celo-light/65">
                  USDT
                </span>
              </span>
              <span aria-hidden className="text-celo-light/40">
                ·
              </span>
              <span className="truncate text-sm">
                {flag ? `${flag} ` : ""}
                {product.seller_shop_name}
                {country ? ` — ${country}` : ""}
              </span>
            </div>
          </div>

          <span className="inline-flex h-11 w-fit items-center gap-1.5 rounded-pill bg-celo-light px-5 text-base font-medium text-celo-dark transition-transform duration-200 group-hover:translate-x-0.5">
            Shop now
            <ArrowRight weight="bold" className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </Link>
    </m.div>
  );
}
