"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { MotionProvider } from "@/components/MotionProvider";
import { SilentReconnectGate } from "@/components/SilentReconnectGate";
import { WalletDebugOverlay } from "@/components/WalletDebugOverlay";
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
        {/* `reconnectOnMount={false}` disables wagmi's built-in
            reconnect that, on some browser/wallet combinations,
            surfaces a permission popup the user never asked for —
            the root cause of PR #36's "User rejected" crash UX.
            SilentReconnectGate below replaces it with an explicit
            silent reconnect (uses `eth_accounts` RPC which never
            prompts, only attaches the wallet if accounts are already
            approved for the origin). */}
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
          <QueryClientProvider client={queryClient}>
            <SilentReconnectGate />
            <CartHydrationGate>{children}</CartHydrationGate>
            {/* On-screen debug log overlay, activated with
                `?debug=wallet` in the URL. Sticky bottom of viewport
                so MiniPay users without chrome://inspect access can
                read the wallet-chain state directly on their device. */}
            <WalletDebugOverlay />
          </QueryClientProvider>
        </WagmiProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
