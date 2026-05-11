/**
 * PublicProviders — ADR-052 multi-wallet support.
 *
 * Originally introduced in ADR-051 as a lightweight providers tree
 * (no Wagmi, no cart) for the (public) funnel surface. ADR-052
 * collapses the dual-surface UX delta : Chrome visitors now see the
 * same marketplace browse as MiniPay users, and need the wallet +
 * cart providers to interact (connect wallet, add to cart, etc.).
 *
 * Result : PublicProviders becomes a near-clone of Providers (the
 * (app) group's full stack). We keep the two layouts separate
 * because the (app) routes may add server-side helpers (e.g. SSR
 * prefetch when SIWE lands V1.5+) that don't belong on the public
 * pages.
 *
 * Bundle cost reverts to the ADR-035 baseline (~12-18 kB increase
 * on public routes vs. ADR-051's lightweight tree). Acceptable
 * trade-off for full feature parity in Chrome.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { MotionProvider } from "@/components/MotionProvider";
import { useCartHydration } from "@/lib/cart-store";
import { wagmiConfig } from "@/lib/wagmi-config";

function CartHydrationGate({ children }: { children: React.ReactNode }) {
  useCartHydration();
  return <>{children}</>;
}

export function PublicProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MotionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="etalo-theme"
      >
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <CartHydrationGate>{children}</CartHydrationGate>
          </QueryClientProvider>
        </WagmiProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
