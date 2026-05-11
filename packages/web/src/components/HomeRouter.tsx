/**
 * HomeRouter — ADR-052 uniform UX.
 *
 * Every visitor (Chrome or MiniPay) lands on the same marketplace
 * browse experience. ADR-052 collapsed the dual-surface UX delta —
 * no more separate HomeLanding "Welcome" page in Chrome. Onboarding
 * still runs once on first MiniPay open (familiar pattern).
 *
 * HomeLanding component stays in the repo as dormant code for V1.5+
 * reactivation when the asset generator marketing pack returns and
 * we need a dedicated landing-for-asset-share page again.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DebugMiniPayOverlay } from "@/components/DebugMiniPayOverlay";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

interface Props {
  // Kept on the signature for backwards compat with the page wrapper
  // that still fetches them in case ADR-052 is reverted ; ignored
  // by the redirect-to-marketplace path.
  featuredSellers?: FeaturedSeller[];
}

const ONBOARDED_KEY = "etalo-onboarded";
const LEGACY_MODE_PREFERENCE_KEY = "etalo-mode-preference";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HomeRouter({ featuredSellers }: Props = {}) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Defensive cleanup of legacy keys from previous architecture passes.
    window.localStorage.removeItem(LEGACY_MODE_PREFERENCE_KEY);

    // Onboarding is shown once per device on the first MiniPay open
    // (the legacy first-time MiniPay seller pattern). Chrome visitors
    // skip onboarding — they get the marketplace immediately, which is
    // ADR-052's "same UX everywhere" guarantee. Onboarding will move to
    // a wallet-aware trigger in a follow-up when connect flows mature.
    const inMiniPay = detectMiniPay();
    const onboarded =
      window.localStorage.getItem(ONBOARDED_KEY) === "true";
    if (inMiniPay && !onboarded) {
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
      {/* Minimal placeholder while the redirect to /marketplace is in
          flight — keeps SSR happy and avoids a flash of unstyled
          content. The marketplace itself renders its own skeleton. */}
      <div className="min-h-screen" aria-hidden="true" />
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
