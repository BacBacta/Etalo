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
  return (
    <Providers>
      <PublicHeader />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </Providers>
  );
}
