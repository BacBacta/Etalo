"use client";

import { m, useReducedMotion } from "motion/react";

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

// Per-card stagger is index-driven but CAPPED at 8 slots so a freshly-
// appended "Load more" page (idx 20, 40, …) fades in near-together
// instead of waiting ~1s for a linear stagger to reach it. Cards carry
// stable `product.id` keys, so the entrance plays once on mount and
// never replays on a pull-to-refresh refetch.
const STAGGER_STEP = 0.04;
const STAGGER_CAP = 8;

// One near-critically-damped spring drives BOTH the mount entrance
// (opacity + 12px rise) and the tap press (scale 0.97). Spring over
// tween so the tap feels snappy and physical ; damping 30 keeps the
// entrance settle clean with no visible overshoot on opacity/y.
const CARD_SPRING = { type: "spring" as const, stiffness: 260, damping: 30 };

export function MarketplaceGrid({ products, hideSellerCountry }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, idx) => (
        <m.div
          key={product.id}
          // Reduced motion → render in final state immediately. The
          // entrance transition (with stagger delay) lives ON the
          // `animate` state so the `whileTap` press stays delay-free
          // and snappy regardless of the card's grid index.
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  opacity: 1,
                  y: 0,
                  transition: {
                    ...CARD_SPRING,
                    delay: Math.min(idx, STAGGER_CAP) * STAGGER_STEP,
                  },
                }
          }
          // Tactile press feedback — suppressed under reduced-motion.
          // The card's CSS hover-lift stays for pointer devices.
          whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
          transition={CARD_SPRING}
        >
          <MarketplaceProductCard
            product={product}
            hideSellerCountry={hideSellerCountry}
            // LCP optimization — the first row of cards is above the
            // fold on every breakpoint we ship (mobile 2-col → 2 cards,
            // tablet 3-col → 3, desktop 4-col → 4). priority=true skips
            // Next.js' default lazy-loading + sets fetchpriority=high
            // on the img, so the LCP image starts downloading at the
            // same moment as the JS chunks parse. Index < 4 covers the
            // worst-case (desktop 4-col first row) without over-eager
            // loading on mobile.
            priority={idx < 4}
          />
        </m.div>
      ))}
    </div>
  );
}
