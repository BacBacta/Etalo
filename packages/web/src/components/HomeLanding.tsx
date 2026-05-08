import { FeaturedSellers } from "@/components/FeaturedSellers";
import { PRIMARY_CTA_CLASSES } from "@/components/home-cta-styles";
import { OpenBoutiqueCTA } from "@/components/OpenBoutiqueCTA";
import {
  CardDescriptionV4,
  CardTitleV4,
  CardV4,
} from "@/components/ui/v4/Card";
import type { FeaturedSeller } from "@/lib/api";

interface Props {
  featuredSellers: FeaturedSeller[];
}

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.opera.mini.native";
const APP_STORE_URL = "https://apps.apple.com/app/minipay/id6463420669";

export function HomeLanding({ featuredSellers }: Props) {
  return (
    <main id="main" className="min-h-screen">
      <section className="mx-auto max-w-3xl px-4 py-12">
        {/*
          Single-column centered hero — visually unified with HomeMiniPay
          so the / route reads identically inside MiniPay and on web,
          while CTAs route to web-appropriate destinations (anchor scroll
          to the FeaturedSellers preview below for "Browse marketplace",
          modal with Get-MiniPay fallbacks for "Open my boutique"). The
          full marketplace remains MiniPay-gated — a public read-only
          marketplace is deferred to a follow-up sprint.
        */}
        <div className="flex flex-col items-center gap-8 text-center">
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
            <a
              href="#featured-sellers"
              data-testid="landing-browse-marketplace"
              className={PRIMARY_CTA_CLASSES}
            >
              Browse marketplace
            </a>
            <OpenBoutiqueCTA />
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-12">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-3">
          <CardV4 variant="elevated" className="text-center">
            <CardTitleV4 className="mb-2">USDT escrow</CardTitleV4>
            <CardDescriptionV4 className="opacity-100 text-celo-dark/70">
              Your funds are held in audited smart contracts on Celo. No
              middleman.
            </CardDescriptionV4>
          </CardV4>
          <CardV4 variant="elevated" className="text-center">
            <CardTitleV4 className="mb-2">Buyer protection</CardTitleV4>
            <CardDescriptionV4 className="opacity-100 text-celo-dark/70">
              Disputes are resolved through community voting. Auto-refund
              if seller doesn&apos;t ship.
            </CardDescriptionV4>
          </CardV4>
          <CardV4 variant="elevated" className="text-center">
            <CardTitleV4 className="mb-2">Multi-seller cart</CardTitleV4>
            <CardDescriptionV4 className="opacity-100 text-celo-dark/70">
              Buy from multiple sellers across Africa in a single seamless
              flow.
            </CardDescriptionV4>
          </CardV4>
        </div>
      </section>

      {featuredSellers.length > 0 ? (
        <section
          id="featured-sellers"
          className="mx-auto max-w-3xl scroll-mt-16 px-4 py-12"
        >
          <h2 className="mb-2 text-center text-xl font-semibold">
            Discover sellers
          </h2>
          <p className="mb-8 text-center text-base text-neutral-700">
            A taste of the boutiques on Etalo. Open one to see their
            products.
          </p>
          <FeaturedSellers sellers={featuredSellers} />
        </section>
      ) : null}

      <section className="bg-neutral-900 px-4 py-12 text-center text-white">
        <h2 className="mb-3 text-xl font-semibold">Ready to start?</h2>
        <p className="mx-auto mb-6 max-w-xl text-base">
          Get MiniPay on your phone and discover the full Etalo marketplace.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-white px-6 py-3 text-base font-medium text-neutral-900"
          >
            Play Store
          </a>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-white px-6 py-3 text-base font-medium text-neutral-900"
          >
            App Store
          </a>
        </div>
      </section>
    </main>
  );
}
