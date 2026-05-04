/**
 * HomeMiniPay — MiniPay-native app entry surface (J10-V5 Phase 4
 * Block 4c). Replaces the dual-purpose HomeLanding for users opening
 * Etalo from inside MiniPay; HomeLanding remains the web marketing
 * surface for SEO/non-MiniPay visitors.
 *
 * Single-decision focal layout: brand intro + landing-hero
 * illustration (Block 6 P3 staged asset) + 2 primary CTAs ("Browse
 * marketplace" / "Open my boutique"). No Get-MiniPay store links,
 * no Discover-sellers preempting marketplace, no marketing footer —
 * those belong on HomeLanding's web context, not on the MiniPay
 * entry surface.
 *
 * Lesson #80 / #81 applied: zero motion/react import, hand-rolled
 * CTA styled to match ButtonV4 primary visually but as a plain
 * <button> so the / route doesn't pay motion's transitive cost just
 * for two static navigation buttons.
 */
"use client";

import { useRouter } from "next/navigation";

// Visual match for ButtonV4 primary forest/pill/lg without importing
// ButtonV4 itself (Lesson #80 récidive — module-level motion in
// ButtonV4 would inject ~15-20 KB into the / route bundle for two
// nav buttons that don't need press-scale spring physics). Same
// pattern shipped on EmptyStateV5 P3 B5b + OnboardingScreenV5 CTA
// P4 B4a.
const PRIMARY_CTA_CLASSES = [
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

const SECONDARY_CTA_CLASSES = [
  "inline-flex items-center justify-center gap-2",
  "h-12 px-6 min-w-[200px]",
  "font-sans font-medium text-body-lg",
  "rounded-pill whitespace-nowrap",
  "border border-celo-forest bg-transparent text-celo-forest",
  "hover:bg-celo-forest-soft",
  "dark:border-celo-forest-bright dark:text-celo-forest-bright",
  "dark:hover:bg-celo-forest-bright-soft",
  "transition-colors duration-200 ease-out",
  "outline-none",
  "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light",
  "dark:focus-visible:ring-celo-forest-bright dark:focus-visible:ring-offset-celo-dark-bg",
].join(" ");

export function HomeMiniPay() {
  const router = useRouter();

  return (
    <main id="main" className="min-h-screen">
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex flex-col items-center gap-8 text-center">
          {/*
            Vector SVG (~3.5 KB) — same illustration consumed on the
            web HomeLanding hero. Reuse keeps bundle frugal and the
            visual identity continuous across web ↔ MiniPay contexts.
            eager loading because the hero is above-the-fold.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/v5/landing-hero.svg"
            alt="Etalo seller boutique illustrating sellers reaching customers across Africa via USDT escrow"
            loading="eager"
            className="block h-auto w-full max-w-sm"
          />

          <div className="space-y-3">
            <h1 className="font-display text-display-2 text-celo-dark dark:text-celo-light">
              Welcome to Etalo
            </h1>
            <p className="mx-auto max-w-md font-sans text-body text-celo-dark/60 dark:text-celo-light/60">
              Your digital stall, open 24/7. Pick a path to get started.
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <button
              type="button"
              onClick={() => router.push("/marketplace")}
              data-testid="minipay-browse-marketplace"
              className={PRIMARY_CTA_CLASSES}
            >
              Browse marketplace
            </button>
            <button
              type="button"
              onClick={() => router.push("/seller/dashboard")}
              data-testid="minipay-open-boutique"
              className={SECONDARY_CTA_CLASSES}
            >
              Open my boutique
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
