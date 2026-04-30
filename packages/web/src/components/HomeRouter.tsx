"use client";

import { useEffect, useState } from "react";

import { DebugMiniPayOverlay } from "@/components/DebugMiniPayOverlay";
import { HomeLanding } from "@/components/HomeLanding";
import { HomeMiniPay } from "@/components/HomeMiniPay";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

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
  // Lazy synchronous init for instant view dispatch — eliminates
  // SSR→hydration flash for MiniPay tunnel context (Phase 4 hotfix #5).
  // SSR remains HomeLanding for SEO (window === undefined → fallback
  // "landing"); client first render swaps immediately to HomeMiniPay
  // if ngrok hostname signals or window.ethereum.isMiniPay are
  // detected at mount. useEffect retained as safety net for late
  // provider injection (Opera can inject window.ethereum.isMiniPay
  // after first paint on slower devices).
  //
  // Hydration divergence (server HomeLanding vs client HomeMiniPay
  // when MiniPay detected) is intentional — suppressHydrationWarning
  // applied on the wrapper div below to silence the expected mismatch.
  // Architecture follow-up : Option C (server-side UA hint via
  // headers()) recommended Phase 5 Polish to avoid the mismatch
  // entirely (zero client-specific divergence at SSR time).
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && detectMiniPay() ? "minipay" : "landing",
  );
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!detectMiniPay()) return; // Web visitors stay on HomeLanding.

    // Safety net : if lazy init missed (e.g. window.ethereum injected
    // late), bring view in line. No-op if already "minipay".
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
      <div suppressHydrationWarning>
        {view === "minipay" ? (
          <HomeMiniPay />
        ) : (
          <HomeLanding featuredSellers={featuredSellers} />
        )}
      </div>
      {showOnboarding ? (
        <OnboardingScreenV5
          title="Welcome to Etalo"
          description="Your digital stall, open 24/7. Buy and sell with African sellers using USDT escrow on Celo."
          ctaLabel="Get Started"
          onCtaClick={handleOnboarded}
        />
      ) : null}
      <DebugMiniPayOverlay />
    </>
  );
}
