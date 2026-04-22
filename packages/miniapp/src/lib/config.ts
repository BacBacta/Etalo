import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { celoSepolia } from "@/lib/chain";
import { minipayConnector } from "@/lib/minipay-connector";

/**
 * Wagmi config for Etalo.
 *
 * Connector order matters: `minipayConnector` comes first so that inside
 * the MiniPay WebView it wins. On desktop dev the MiniPay connector is
 * unavailable (returns `undefined` provider), and wagmi falls back to
 * the generic `injected()` connector (MetaMask, Rabby, etc.).
 */
export const wagmiConfig = createConfig({
  chains: [celoSepolia],
  connectors: [minipayConnector(), injected()],
  transports: {
    [celoSepolia.id]: http(),
  },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
