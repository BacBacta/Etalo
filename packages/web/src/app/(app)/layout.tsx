/**
 * (app) route group layout — ADR-051 / ADR-070-app-providers.
 *
 * Wraps the Mini App surface (`/marketplace`, `/checkout`, `/orders/*`,
 * `/profile/*`, `/seller/*`, `/dev/*`) with the full `PublicHeader`
 * (with cart trigger + my-orders link conditional on wallet connection).
 *
 * Providers (WagmiProvider + QueryClient + Theme + Motion +
 * CartHydration + SilentReconnectGate) live at the ROOT layout via
 * `AppProviders`, so they mount ONCE and persist across (public) ↔
 * (app) SPA nav (PR #70 root-cause fix for the dashboard-stuck-on-
 * skeleton bug).
 *
 * Public-funnel routes use the lighter `(public)/layout.tsx` (no
 * cart, no PublicHeader).
 */
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
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
    <div className="overflow-x-clip">
      <PublicHeader />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </div>
  );
}
