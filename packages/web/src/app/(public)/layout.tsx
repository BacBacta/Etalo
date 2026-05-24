/**
 * (public) route group layout — ADR-051 / ADR-070-app-providers.
 *
 * Wraps the funnel surface (`/`, `/[handle]`, `/[handle]/[slug]`,
 * `/legal/*`) with the `PublicHeaderMinimal` (no wallet button, no
 * cart trigger).
 *
 * Providers (WagmiProvider + QueryClient + Theme + Motion +
 * CartHydration + SilentReconnectGate) live at the ROOT layout via
 * `AppProviders`, so they mount ONCE and persist across (public) ↔
 * (app) SPA nav (PR #70 root-cause fix).
 */
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { PublicHeaderMinimal } from "@/components/PublicHeaderMinimal";

export default function PublicGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <PublicHeaderMinimal />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </>
  );
}
