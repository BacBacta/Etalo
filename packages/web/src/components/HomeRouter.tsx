"use client";

import { useEffect, useState } from "react";

import { HomeLanding } from "@/components/HomeLanding";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";

interface Props {
  featuredSellers: FeaturedSeller[];
}

// J10-V5 Phase 4 Block 4b — first-visit overlay flag. Independent
// from the legacy `etalo-mode-preference` key (sticky preference that
// auto-redirected MiniPay visitors to /marketplace or /seller/
// dashboard on every paint, dropped this block).
const ONBOARDED_KEY = "etalo-onboarded";

export function HomeRouter({ featuredSellers }: Props) {
  // Initial paint always renders HomeLanding — keeps SSR consistent
  // with non-MiniPay first paint (SEO + crawlers + web visitors). The
  // onboarding overlay only mounts once the client useEffect has
  // confirmed we are in a MiniPay context AND the visitor has not
  // accepted the welcome screen before.
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const provider = (window as unknown as {
      ethereum?: { isMiniPay?: boolean };
    }).ethereum;
    const isMiniPay = provider?.isMiniPay === true;

    // Web visitors land on HomeLanding directly — the welcome overlay
    // would block the marketing surface SEO drives them to. Onboarding
    // is scoped to the Mini App entry path, where the surface is the
    // first thing a MiniPay user sees.
    if (!isMiniPay) return;

    const onboarded =
      window.localStorage.getItem(ONBOARDED_KEY) === "true";
    if (!onboarded) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboarded = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDED_KEY, "true");
    }
    setShowOnboarding(false);
  };

  return (
    <>
      <HomeLanding featuredSellers={featuredSellers} />
      {showOnboarding ? (
        <OnboardingScreenV5
          title="Welcome to Etalo"
          description="Your digital stall, open 24/7. Buy and sell with African sellers using USDT escrow on Celo."
          ctaLabel="Get Started"
          onCtaClick={handleOnboarded}
        />
      ) : null}
    </>
  );
}
