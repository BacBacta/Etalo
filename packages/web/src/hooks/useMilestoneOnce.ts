/**
 * useMilestoneOnce — one-shot guard for milestone-triggered surfaces
 * (J10-V5 Phase 4 Block 6 sub-block 6.2).
 *
 * Mirrors the Block 4b `etalo-onboarded` pattern (HomeRouter +
 * OnboardingScreenV5) : SSR-safe `useState(false)` initial paint
 * (consistent across server + first client render), then a
 * `useEffect` post-mount hydration reads the per-type localStorage
 * key. Consumers gate their celebratory surface (dialog, banner,
 * toast) on `shouldShow` ; on dismiss, they call `markShown` which
 * writes the flag and immediately collapses `shouldShow` back to
 * false so a re-render in the same session doesn't re-fire.
 *
 * Per-type namespace : `etalo-milestone-shown-${type}`. Each
 * MilestoneType is independent — marking "first-sale" shown leaves
 * "withdrawal-complete" untouched.
 *
 * The parameter type is the broader MilestoneType enum (5 values
 * from lib/confetti/milestones.ts), even though the V1
 * MilestoneDialogV5 component (sub-block 6.1) only consumes 2
 * variants. This lets future surfaces (inline banners, toasts) reuse
 * the guard for the other 3 milestones (credit-purchase,
 * image-generated, onboarding-complete) without an API change.
 *
 * try/catch around localStorage : MiniPay's WebView occasionally
 * blocks Storage access in incognito-style sessions (lesson from
 * hotfix #7's investigation). Silent fail keeps the guard from
 * crashing the consumer ; worst case the dialog re-fires on every
 * mount until storage works again.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

import type { MilestoneType } from "@/lib/confetti/milestones";

function storageKey(type: MilestoneType): string {
  return `etalo-milestone-shown-${type}`;
}

export interface UseMilestoneOnceResult {
  shouldShow: boolean;
  markShown: () => void;
}

export function useMilestoneOnce(type: MilestoneType): UseMilestoneOnceResult {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey(type));
      setShouldShow(stored !== "true");
    } catch {
      // localStorage may be unavailable in MiniPay incognito-style
      // contexts ; leave shouldShow false rather than crash.
    }
  }, [type]);

  const markShown = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(type), "true");
    } catch {
      // Same fallback rationale as the read path.
    }
    setShouldShow(false);
  }, [type]);

  return { shouldShow, markShown };
}
