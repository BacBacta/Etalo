import { defineChain } from "viem";

/**
 * Celo Sepolia L2 testnet (since March 2025 migration).
 * RPC: drpc.org was the only endpoint that worked reliably during J1
 * deployment, so we hard-code it as the default.
 */
export const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_CELO_RPC_URL ?? "https://celo-sepolia.drpc.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://celo-sepolia.blockscout.com",
    },
  },
  testnet: true,
});
