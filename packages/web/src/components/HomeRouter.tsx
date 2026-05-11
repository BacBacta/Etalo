/**
 * HomeRouter — ADR-051 simplification.
 *
 * V1 funnel reduction (post-ADR-049 asset gen deferral) : the public
 * landing surface never renders the Mini App home, so we don't need
 * the dynamic-import dance with HomeMiniPay anymore. Public visitors
 * see HomeLanding directly. MiniPay visitors get a `router.replace`
 * to `/marketplace` so they land in the actual Mini App entry instead
 * of bouncing off the marketing landing.
 *
 * Keeping HomeMiniPay alive in the repo (orphaned but ready for V1.5
 * reactivation when the asset generator marketing pack returns).
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DebugMiniPayOverlay } from "@/components/DebugMiniPayOverlay";
import { HomeLanding } from "@/components/HomeLanding";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

interface Props {
  featuredSellers: FeaturedSeller[];
}

const ONBOARDED_KEY = "etalo-onboarded";
const LEGACY_MODE_PREFERENCE_KEY = "etalo-mode-preference";

export function HomeRouter({ featuredSellers }: Props) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_MODE_PREFERENCE_KEY);
    }

    if (!detectMiniPay()) return;

    // MiniPay visitors don't belong on the marketing landing — push
    // them straight into the marketplace (the Mini App entry that
    // ADR-035 originally routed via HomeMiniPay's "Browse marketplace"
    // CTA, now condensed to a direct redirect).
    const onboarded =
      window.localStorage.getItem(ONBOARDED_KEY) === "true";
    if (!onboarded) {
      setShowOnboarding(true);
      return;
    }
    router.replace("/marketplace");
  }, [router]);

  const handleOnboarded = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDED_KEY, "true");
    }
    setShowOnboarding(false);
    router.replace("/marketplace");
  };

  return (
    <>
      <HomeLanding featuredSellers={featuredSellers} />
      {showOnboarding ? (
        <OnboardingScreenV5
          title="Welcome to Etalo"
          description="Browse boutiques across Africa and pay with USDT escrow — your funds stay locked until you receive your order."
          ctaLabel="Browse marketplace"
          onCtaClick={handleOnboarded}
        />
      ) : null}
      <DebugMiniPayOverlay />
    </>
  );
}
