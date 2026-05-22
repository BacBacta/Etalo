/**
 * (app) route group layout — ADR-051.
 *
 * Wraps the Mini App surface (`/marketplace`, `/checkout`, `/orders/*`,
 * `/profile/*`, `/seller/*`, `/dev/*`) with the full `Providers` stack
 * (WagmiProvider + CartHydrationGate + Theme + Motion + QueryClient)
 * and the full `PublicHeader` (with cart trigger + my-orders link
 * conditional on wallet connection).
 *
 * Public-funnel routes use the lighter `(public)/layout.tsx` instead.
 */
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Providers } from "@/components/Providers";
import { PublicHeader } from "@/components/PublicHeader";

export default function AppGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // `overflow-x-clip` on the route-group root is a safety net against
  // accidental page-level horizontal scroll on small viewports — a
  // bleed-edge chip row (CountryFilterChips/CategoryFilterChips both
  // use `-mx-4` for native-carousel feel) or any future component
  // that's wider than 360 px will scroll WITHIN its own container
  // instead of dragging the whole page sideways. `clip` over `hidden`
  // because `clip` lets the inner sticky header keep its sticky
  // behavior (overflow:hidden creates a new containing block that
  // breaks position:sticky on descendants — caught the hard way on
  // Mike's mobile screenshot 2026-05-22).
  return (
    <Providers>
      <div className="overflow-x-clip">
        <PublicHeader />
        <PageTransition>{children}</PageTransition>
        <Footer />
      </div>
    </Providers>
  );
}
