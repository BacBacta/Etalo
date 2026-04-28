"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { MotionProvider } from "@/components/MotionProvider";
import { useCartHydration } from "@/lib/cart-store";
import { wagmiConfig } from "@/lib/wagmi-config";

// Triggers manual rehydration of the cart store post-mount. Paired
// with `skipHydration: true` in the persist config, this guarantees
// server and client first render produce identical (empty) state,
// avoiding the useSyncExternalStore mismatch loop that previously
// fired across CartTrigger / CartDrawer.
function CartHydrationGate({ children }: { children: React.ReactNode }) {
  useCartHydration();
  return <>{children}</>;
}

// Wraps the app in ThemeProvider (V5 dark mode, J10-V5 Block 3) +
// WagmiProvider + QueryClientProvider so any client component can use
// wagmi hooks, react-query, and useTheme(). ThemeProvider sits
// outermost so theme switching never unmounts the wagmi/query state.
// Pages that don't need the wallet still pay zero runtime cost —
// wagmi's setup is lazy and the providers are tree-shakeable from the
// SSR pipeline.
export function Providers({ children }: { children: React.ReactNode }) {
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
