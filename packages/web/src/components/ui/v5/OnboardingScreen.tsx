/**
 * OnboardingScreenV5 — full-screen first-time welcome surface (J10-V5
 * Phase 4 Block 4a). Wraps the onboarding-welcome.svg illustration
 * (Phase 3 Block 2 production) with a title, optional description,
 * primary CTA, and an optional dismiss/skip button.
 *
 * Lesson #80 / #81 applied: no motion/react import. Entrance
 * animation lands via Tailwind's `animate-in` plugin (already used by
 * legacy shadcn dialog.tsx) — pure CSS, zero motion injection on the
 * route consumer.
 *
 * Block 4b will wire this into HomeRouter behind a `etalo-onboarded`
 * localStorage flag (first-visit only). Block 4a ships the lib only +
 * /dev/components demo.
 */
"use client";

import {
  forwardRef,
  type HTMLAttributes,
  type MouseEventHandler,
} from "react";

import { cn } from "@/components/ui/v4/utils";

export type OnboardingScreenV5Asset = "welcome";

const ASSET_PATH: Record<OnboardingScreenV5Asset, string> = {
  welcome: "/illustrations/v5/onboarding-welcome.svg",
};

export interface OnboardingScreenV5Props
  extends HTMLAttributes<HTMLDivElement> {
  illustration?: OnboardingScreenV5Asset;
  title: string;
  description?: string;
  ctaLabel: string;
  onCtaClick: MouseEventHandler<HTMLButtonElement>;
  /** Optional skip button rendered top-right. Pair with onSkip. */
  skipLabel?: string;
  onSkip?: MouseEventHandler<HTMLButtonElement>;
}

const ENTRANCE_ANIMATION =
  "animate-in fade-in-0 slide-in-from-bottom-4 duration-500 ease-out";

// Visual match for ButtonV4 primary (forest / pill / lg size) without
// pulling ButtonV4 itself into the bundle (Lesson #80 — same fix
// shipped on EmptyStateV5 P3 B5b). Onboarding CTA is a one-shot
// interaction so the lighter primitive is the right trade.
const CTA_CLASSES = [
  "inline-flex items-center justify-center gap-2",
  "h-12 px-6 min-w-[200px]",
  "font-sans font-medium text-body-lg",
  "rounded-pill whitespace-nowrap",
  "bg-celo-forest text-celo-light hover:bg-celo-forest-dark",
  "dark:bg-celo-green dark:text-celo-dark dark:hover:bg-celo-green-hover",
  "transition-colors duration-200 ease-out",
  "outline-none",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light",
  "dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
].join(" ");

const SKIP_CLASSES = [
  "absolute top-6 right-6",
  "font-sans text-body-sm",
  "text-celo-dark/60 hover:text-celo-dark",
  "dark:text-celo-light/60 dark:hover:text-celo-light",
  "transition-colors duration-200",
  "outline-none focus-visible:ring-2 focus-visible:ring-celo-forest rounded",
].join(" ");

export const OnboardingScreenV5 = forwardRef<
  HTMLDivElement,
  OnboardingScreenV5Props
>(
  (
    {
      illustration = "welcome",
      title,
      description,
      ctaLabel,
      onCtaClick,
      skipLabel,
      onSkip,
      className,
      ...props
    },
    ref,
  ) => {
    const titleId = "onboarding-screen-v5-title";
    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-0 z-50",
          "flex flex-col items-center justify-center",
          "bg-celo-light dark:bg-celo-dark-bg",
          "px-6 py-12",
          ENTRANCE_ANIMATION,
          className,
        )}
        {...props}
      >
        {skipLabel && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            data-testid="onboarding-skip"
            className={SKIP_CLASSES}
          >
            {skipLabel}
          </button>
        ) : null}
        <div className="flex max-w-sm flex-col items-center gap-8 text-center">
          {/*
            Vector SVG illustration (~8.5 KB onboarding-welcome.svg).
            Decorative — title carries meaning via aria-labelledby.
            Plain <img> over next/image: vector, no resizing variants
            needed (same rationale as EmptyStateV5 / HomeLanding hero).
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ASSET_PATH[illustration]}
            alt=""
            aria-hidden="true"
            loading="eager"
            data-testid="onboarding-illustration"
            data-asset={illustration}
            className="block h-auto w-full max-w-[280px]"
          />
          <div className="space-y-3">
            <h1
              id={titleId}
              className="font-display text-display-2 text-celo-dark dark:text-celo-light"
            >
              {title}
            </h1>
            {description ? (
              <p className="font-sans text-body text-celo-dark/60 dark:text-celo-light/60">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCtaClick}
            data-testid="onboarding-cta"
            className={CTA_CLASSES}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    );
  },
);
OnboardingScreenV5.displayName = "OnboardingScreenV5";

export { ASSET_PATH as ONBOARDING_ASSET_PATH };
