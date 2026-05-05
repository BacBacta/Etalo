import { injected } from "@wagmi/core";
import { createConfig, http } from "wagmi";

import { celoSepolia } from "@/lib/chain";
import { minipayConnector } from "@/lib/minipay-connector";

/**
 * Wagmi config for Etalo.
 *
 * Connector order matters: `minipayConnector` comes first so that inside
 * the MiniPay WebView it wins. On desktop dev the MiniPay connector is
 * unavailable (returns `undefined` provider), and wagmi falls back to
 * the generic `injected()` connector (MetaMask, Rabby, etc.).
 *
 * J10-V5 Phase 5 Angle F sub-block F.3 — `injected` is imported from
 * `@wagmi/core` directly rather than `wagmi/connectors`. The latter is
 * a barrel re-exporting all 9 wagmi connectors (metaMask + walletConnect
 * + coinbaseWallet + ...) ; even with `sideEffects: false` enabling
 * tree-shake at emit, webpack still tries to resolve all the import
 * paths during compile, surfacing noisy warnings about transitive deps
 * we don't use (`@metamask/sdk`, `pino-pretty`). Going via `@wagmi/core`
 * (which `wagmi` already depends on) bypasses the barrel entirely —
 * cleaner build output, no bundle delta.
 */
export const wagmiConfig = createConfig({
  chains: [celoSepolia],
  connectors: [minipayConnector(), injected()],
  transports: {
    [celoSepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
