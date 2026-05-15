/**
 * HomeRouter — ADR-053 chooser-first landing.
 *
 * Walks back ADR-052's auto-redirect-to-marketplace : the `/` route now
 * renders the `HomeMiniPay` chooser ("Browse marketplace" / "Open my
 * boutique") for every visitor (Chrome and MiniPay), so clicking the
 * Etalo logo from anywhere returns to the choice screen instead of
 * dumping the user into marketplace browse.
 *
 * Multi-wallet support (ADR-052) is preserved : both CTAs lead into
 * routes wrapped by the (app) layout's full Providers stack including
 * Wagmi, so wallet connect / cart still work end-to-end on Chrome.
 *
 * Onboarding overlay still shows on the first MiniPay open per device
 * (`etalo-onboarded` localStorage flag) before the chooser appears.
 *
 * `featuredSellers` is kept on the signature for backwards compat with
 * the page wrapper that prefetches them ; ignored by the chooser path.
 */
"use client";

import { useEffect, useState } from "react";

import { DebugMiniPayOverlay } from "@/components/DebugMiniPayOverlay";
import { HomeMiniPay } from "@/components/HomeMiniPay";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

interface Props {
  featuredSellers?: FeaturedSeller[];
}

const ONBOARDED_KEY = "etalo-onboarded";
const LEGACY_MODE_PREFERENCE_KEY = "etalo-mode-preference";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HomeRouter({ featuredSellers }: Props = {}) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.removeItem(LEGACY_MODE_PREFERENCE_KEY);

    const inMiniPay = detectMiniPay();
    const onboarded =
      window.localStorage.getItem(ONBOARDED_KEY) === "true";
    if (inMiniPay && !onboarded) {
      setShowOnboarding(true);
    }
    setMounted(true);
  }, []);

  const handleOnboarded = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDED_KEY, "true");
    }
    setShowOnboarding(false);
  };

  if (!mounted) {
    return <div className="min-h-screen" aria-hidden="true" />;
  }

  if (showOnboarding) {
    return (
      <>
        <OnboardingScreenV5
          title="Welcome to Etalo"
          description="Browse boutiques across Africa and pay with USDT escrow — your funds stay locked until you receive your order."
          ctaLabel="Get started"
          onCtaClick={handleOnboarded}
        />
        <DebugMiniPayOverlay />
      </>
    );
  }

  return (
    <>
      <HomeMiniPay />
      <DebugMiniPayOverlay />
    </>
  );
}
