/**
 * (public) route group layout — ADR-051.
 *
 * Wraps the funnel surface (`/`, `/[handle]`, `/[handle]/[slug]`,
 * `/legal/*`) with the lightweight `PublicProviders` (Theme + Motion +
 * QueryClient — no Wagmi, no cart-store) and the `PublicHeaderMinimal`
 * (no wallet, no cart trigger).
 *
 * Saves ~12-18 kB First Load on every page in this group vs. routing
 * through the full `Providers` + `PublicHeader` of the (app) layout.
 */
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { PublicHeaderMinimal } from "@/components/PublicHeaderMinimal";
import { PublicProviders } from "@/components/PublicProviders";

export default function PublicGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicProviders>
      <PublicHeaderMinimal />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </PublicProviders>
  );
}
