"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi-config";

// Wraps the app in WagmiProvider + QueryClientProvider so any client
// component can use wagmi hooks and react-query. Pages that don't need
// the wallet still pay zero runtime cost — wagmi's setup is lazy and
// the providers are tree-shakeable from the SSR pipeline.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
