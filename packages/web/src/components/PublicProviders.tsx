/**
 * PublicProviders — ADR-051 (V1 funnel surface scope reduction).
 *
 * Lightweight providers tree for the (public) route group : ThemeProvider
 * + MotionProvider + QueryClientProvider only. No WagmiProvider, no
 * CartHydrationGate. Saves ~12-18 kB First Load on the public funnel
 * pages (`/`, `/[handle]`, `/[handle]/[slug]`, `/legal/*`) by keeping
 * wagmi + viem + cart-store out of their bundle.
 *
 * Mini App routes use `AppProviders` instead (the full stack with
 * wallet + cart). See `app/(app)/layout.tsx`.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { MotionProvider } from "@/components/MotionProvider";

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
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
