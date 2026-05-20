import { injected } from "@wagmi/core";
import { createConfig, http } from "wagmi";
import { walletConnect } from "wagmi/connectors";

import { celoSepolia } from "@/lib/chain";
import { minipayConnector } from "@/lib/minipay-connector";

/**
 * Wagmi config for Etalo.
 *
 * Connector order matters: `minipayConnector` comes first so that inside
 * the MiniPay WebView it wins. On desktop dev the MiniPay connector is
 * unavailable (returns `undefined` provider), and wagmi falls back to
 * the generic `injected()` connector (MetaMask, Rabby, etc.). When a
 * WalletConnect project ID is configured, the `walletConnect()`
 * connector is also registered to give mobile-Chrome buyers a path
 * into the app via their existing mobile wallet (Valora, MetaMask
 * Mobile, Trust…) without installing MiniPay first (ADR-052 Phase 2).
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
 *
 * ADR-052 Phase 2 — `walletConnect` IS imported from `wagmi/connectors`
 * because there's no equivalent re-export on `@wagmi/core`. The
 * resulting build warnings about transitive @metamask/sdk + pino-pretty
 * are accepted as the price of admission for mobile-Chrome wallet
 * support. The connector is only registered when
 * `NEXT_PUBLIC_WC_PROJECT_ID` is set, so dev environments without a
 * WalletConnect Cloud project ID still build cleanly.
 */
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

const connectors = [
  minipayConnector(),
  injected(),
  ...(WC_PROJECT_ID
    ? [
        walletConnect({
          projectId: WC_PROJECT_ID,
          showQrModal: true,
          metadata: {
            name: "Etalo",
            description: "Your digital stall, open 24/7",
            url:
              process.env.NEXT_PUBLIC_BASE_URL || "https://etalo.xyz",
            icons: ["https://etalo.xyz/icon.png"],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [celoSepolia],
  connectors,
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
