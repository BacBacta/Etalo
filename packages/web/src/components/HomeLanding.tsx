import { FeaturedSellers } from "@/components/FeaturedSellers";
import type { FeaturedSeller } from "@/lib/api";

interface Props {
  featuredSellers: FeaturedSeller[];
}

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.opera.mini.native";
const APP_STORE_URL = "https://apps.apple.com/app/minipay/id6463420669";

export function HomeLanding({ featuredSellers }: Props) {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-5xl px-4 py-12">
        {/*
          flex-col-reverse on mobile so the illustration sits above the
          headline (visual hook on first paint), md:flex-row keeps the
          DOM order text-first (h1/p/CTA before <img>) so AT and SEO
          read the primary content first while desktop renders text on
          the left and the illustration on the right.
        */}
        <div className="flex flex-col-reverse items-center gap-8 md:flex-row md:gap-12">
          <div className="flex-1 text-center md:text-left">
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Etalo — Your digital stall, open 24/7
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-base text-neutral-700 md:mx-0 md:text-lg">
              Buy and sell with African sellers using USDT stablecoin.
              Protected by smart contract escrow on Celo.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-6 py-3 text-base font-medium text-white"
              >
                Get MiniPay on Play Store
              </a>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-6 py-3 text-base font-medium text-white"
              >
                Get MiniPay on App Store
              </a>
            </div>
          </div>
          <div className="w-full max-w-sm md:max-w-md md:flex-1">
            {/*
              Vector SVG (~3.5 KB) — already optimized, no resizing
              variants needed, so a plain <img> is the right primitive
              over next/image. eager loading because the hero is
              above-the-fold on every viewport.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/v5/landing-hero.svg"
              alt="Etalo seller boutique illustrating sellers reaching customers across Africa via USDT escrow"
              loading="eager"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-12">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-3">
          <div className="text-center">
            <h3 className="mb-2 text-lg font-semibold">USDT escrow</h3>
            <p className="text-base text-neutral-700">
              Your funds are held in audited smart contracts on Celo. No
              middleman.
            </p>
          </div>
          <div className="text-center">
            <h3 className="mb-2 text-lg font-semibold">Buyer protection</h3>
            <p className="text-base text-neutral-700">
              Disputes are resolved through community voting. Auto-refund
              if seller doesn&apos;t ship.
            </p>
          </div>
          <div className="text-center">
            <h3 className="mb-2 text-lg font-semibold">Multi-seller cart</h3>
            <p className="text-base text-neutral-700">
              Buy from multiple sellers across Africa in a single seamless
              flow.
            </p>
          </div>
        </div>
      </section>

      {featuredSellers.length > 0 ? (
        <section className="mx-auto max-w-3xl px-4 py-12">
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
