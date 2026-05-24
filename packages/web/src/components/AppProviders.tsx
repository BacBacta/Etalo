/**
 * AppProviders — single client-side provider tree mounted at the
 * root layout (`app/layout.tsx`).
 *
 * Critical for wallet UX : the previous design had TWO WagmiProvider
 * instances — one in `PublicProviders` (for `/`, `/[handle]/[slug]`,
 * etc.) and one in `Providers` (for the `(app)` group). When the user
 * SPA-navigated from `/` to `/seller/dashboard`, the (public)
 * WagmiProvider UNMOUNTED and the (app) WagmiProvider MOUNTED fresh.
 * Wagmi's EIP-6963 connector discovery then fired again, sometimes
 * adding the MiniPay provider TWICE (connectorCount 5 → 6) and
 * dropping the `address` mid-fetch — bricking the dashboard with no
 * recovery path (user-report 2026-05-24 logs at 09:24:08).
 *
 * Hoisting WagmiProvider + QueryClientProvider + ThemeProvider +
 * MotionProvider + CartHydrationGate + SilentReconnectGate here
 * ensures they mount ONCE and persist across all route transitions,
 * including (public) ↔ (app) group boundaries. The wagmi state +
 * connector list stabilises on first mount and stays put.
 *
 * The route-group layouts ((public)/layout, (app)/layout) drop down
 * to pure visual chrome (header + footer + page transitions) — no
 * more provider trees.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { MotionProvider } from "@/components/MotionProvider";
import { SilentReconnectGate } from "@/components/SilentReconnectGate";
import { useCartHydration } from "@/lib/cart-store";
import { wagmiConfig } from "@/lib/wagmi-config";

function CartHydrationGate({ children }: { children: React.ReactNode }) {
  useCartHydration();
  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MotionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="etalo-theme"
      >
        {/* `reconnectOnMount={false}` keeps PR #36's contract :
            wagmi never auto-pops a permission prompt the user didn't
            ask for. SilentReconnectGate below probes eth_accounts
            silently and connects only if accounts are already
            approved for the origin. */}
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
          <QueryClientProvider client={queryClient}>
            <SilentReconnectGate />
            <CartHydrationGate>{children}</CartHydrationGate>
          </QueryClientProvider>
        </WagmiProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
