import { defineChain } from "viem";
import { chainConfig } from "viem/celo";

/**
 * Celo Sepolia L2 testnet (since March 2025 migration).
 * RPC: drpc.org was the only endpoint that worked reliably during J1
 * deployment, so we hard-code it as the default.
 *
 * `...chainConfig` from `viem/celo` brings the Celo-specific tx
 * formatters + serializers — required for CIP-64 (type 0x7b)
 * transactions where the network fee is paid in a stablecoin via a
 * fee-currency adapter. Without these, viem would serialize a CIP-64
 * tx as a malformed legacy/EIP-1559 envelope and the RPC would reject.
 * Even on Sepolia where there's no real USDT adapter, including the
 * config is harmless — only used when callers explicitly request
 * `type: 'cip64'` (see `lib/tx.ts:asTxOptions`).
 */
export const celoSepolia = defineChain({
  ...chainConfig,
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_CELO_RPC_URL ?? "https://celo-sepolia.drpc.org",
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
