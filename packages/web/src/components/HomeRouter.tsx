"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";

import { DebugMiniPayOverlay } from "@/components/DebugMiniPayOverlay";
import { HomeLanding } from "@/components/HomeLanding";
import { OnboardingScreenV5 } from "@/components/ui/v5/OnboardingScreen";
import type { FeaturedSeller } from "@/lib/api";
import { detectMiniPay } from "@/lib/minipay-detect";

// Phase 4 hotfix #6 — HomeMiniPay rendered client-only via next/dynamic
// + ssr: false. The previous lazy-init + suppressHydrationWarning
// approach (hotfix #5, 69ba6ea) eliminated the visible flash but did
// NOT cover structural divergence — React strict hydration threw
// error #5 ("Expected server HTML to contain a matching <img> in
// <div>") because HomeMiniPay's landing-hero <img> has no analogue
// in HomeLanding at the same DOM position. With ssr: false, the
// server NEVER ships HomeMiniPay markup; the client mounts it after
// hydration as a separate Suspense child, so React has no SSR HTML
// to match against the client tree.
//
// webpackPrefetch: true asks the browser to fetch the chunk during
// idle CPU time, so by the time useEffect detects MiniPay and
// triggers the swap, the chunk is usually already in cache. The
// Suspense fallback below keeps HomeLanding on screen during chunk
// load so the perceived swap stays visually continuous (no blank
// flash).
//
// Architecture follow-up Phase 5 Option C : server-side UA hint via
// Next.js `headers()` middleware would let us SSR HomeMiniPay
// directly when the MiniPay UA is recognised — eliminates ALL
// transition (hotfix #6 = pragmatic tactical, Option C = strategic).
const HomeMiniPayDynamic = dynamic(
  () =>
    import(/* webpackPrefetch: true */ "@/components/HomeMiniPay").then(
      (mod) => ({ default: mod.HomeMiniPay }),
    ),
  { ssr: false },
);

interface Props {
  featuredSellers: FeaturedSeller[];
}

// J10-V5 Phase 4 Block 4b — first-visit overlay flag. Independent
// from the legacy `etalo-mode-preference` key (sticky preference that
// auto-redirected MiniPay visitors to /marketplace or /seller/
// dashboard on every paint, dropped Block 4b).
const ONBOARDED_KEY = "etalo-onboarded";

// Phase 4 hotfix #7 — defensive cleanup of the legacy sticky-mode key
// dropped in Block 4b (4279186). Mike observed live in MiniPay
// WebView : load `/` → URL flips to `/marketplace` before HomeMiniPay
// V5 can paint (h1 "Welcome to Etalo" never visible in the DOM).
// Source-code audit found NO call site that can navigate `/` →
// `/marketplace` without a user click on the CTA, so the leading
// hypothesis is a cached pre-Block-4b JS bundle still resident in the
// MiniPay WebView, running the old HomeMode `router.replace` against
// `etalo-mode-preference="buyer"` left over from prior test sessions.
// Removing the key here is idempotent (no-op if never set) and shrinks
// the blast radius even if the cached bundle later evicts on its own.
const LEGACY_MODE_PREFERENCE_KEY = "etalo-mode-preference";

type View = "landing" | "minipay";

export function HomeRouter({ featuredSellers }: Props) {
  // Initial state "landing" — both server and first client render
  // produce HomeLanding markup, so hydration matches structurally.
  // After hydration, useEffect detects MiniPay and flips the view;
  // Suspense (below) keeps HomeLanding visible while the
  // HomeMiniPay chunk resolves.
  const [view, setView] = useState<View>("landing");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Defensive cleanup runs on every mount, regardless of context —
    // the legacy key has no remaining consumer in the post-Block-4b
    // codebase, so unconditional removal cannot regress anything.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_MODE_PREFERENCE_KEY);
    }

    if (!detectMiniPay()) return; // Web visitors stay on HomeLanding.

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
        <Suspense
          fallback={<HomeLanding featuredSellers={featuredSellers} />}
        >
          <HomeMiniPayDynamic />
        </Suspense>
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
      <DebugMiniPayOverlay />
    </>
  );
}
