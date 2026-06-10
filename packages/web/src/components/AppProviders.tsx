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
import { useEffect, useState } from "react";
import { useAccount, WagmiProvider } from "wagmi";

import { MotionProvider } from "@/components/MotionProvider";
import { SilentReconnectGate } from "@/components/SilentReconnectGate";
import { useCartHydration, useCartStore } from "@/lib/cart-store";
import { wagmiConfig } from "@/lib/wagmi-config";

function CartHydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useCartHydration();
  const { address } = useAccount();
  const reconcileOwner = useCartStore((s) => s.reconcileOwner);
  // After the persisted cart is read back, claim/clear it for the
  // connected account. Runs again on every account switch so a new
  // wallet never inherits the previous one's items (cart is stored in
  // device-scoped localStorage, not per account).
  useEffect(() => {
    if (!hydrated) return;
    reconcileOwner(address ?? null);
  }, [hydrated, address, reconcileOwner]);
  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Centralized defaults so every useQuery shares the same baseline.
  // staleTime 30 s aligns with the indexer polling cycle ; refetch on
  // window focus is critical for the MiniPay back-from-background flow
  // where a buyer/seller returns to the app expecting fresh state.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            // Live by default: refresh every 30 s while the surface is
            // mounted so lists/KPIs don't sit frozen when the user stays
            // put (the reported "I must leave the tab and come back to
            // see a new order" symptom). Aligned with the indexer poll.
            // `…InBackground: false` pauses polling once the MiniPay tab
            // is hidden — no battery/data drain when the app isn't on
            // screen. Per-query hooks can override (e.g. order detail
            // stops at a terminal status).
            refetchInterval: 30_000,
            refetchIntervalInBackground: false,
          },
        },
      }),
  );

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
