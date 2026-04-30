"use client";

import { useEffect, useState } from "react";

import { HomeLanding } from "@/components/HomeLanding";
import { HomeMiniPay } from "@/components/HomeMiniPay";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";

interface Props {
  featuredSellers: FeaturedSeller[];
}

// J10-V5 Phase 4 Block 4b — first-visit overlay flag. Independent
// from the legacy `etalo-mode-preference` key (sticky preference that
// auto-redirected MiniPay visitors to /marketplace or /seller/
// dashboard on every paint, dropped Block 4b).
const ONBOARDED_KEY = "etalo-onboarded";

type View = "landing" | "minipay";

export function HomeRouter({ featuredSellers }: Props) {
  // Initial render = HomeLanding so SSR / non-MiniPay first paint /
  // crawler output stay aligned (SEO marketing surface). The client
  // useEffect detects MiniPay context post-mount and swaps to
  // HomeMiniPay (split landed Block 4c — the dual-purpose landing was
  // creating UX trous for MiniPay users : Get-MiniPay store CTAs
  // absurd in MiniPay context, Discover-sellers preempting marketplace,
  // no explicit mode-selection path).
  const [view, setView] = useState<View>("landing");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const provider = (window as unknown as {
      ethereum?: { isMiniPay?: boolean };
    }).ethereum;
    const isMiniPay = provider?.isMiniPay === true;

    if (!isMiniPay) return; // Web visitors stay on HomeLanding.

    setView("minipay");

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
      {view === "minipay" ? (
        <HomeMiniPay />
      ) : (
        <HomeLanding featuredSellers={featuredSellers} />
      )}
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
