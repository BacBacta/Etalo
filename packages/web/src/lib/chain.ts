import { defineChain } from "viem";
import { chainConfig } from "viem/celo";

/**
 * Celo Sepolia L2 testnet (since March 2025 migration).
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

/**
 * Celo mainnet (since L2 migration March 2025). Used for V1 production
 * launch (tag v1.4-mainnet, deployed 2026-05-25). MiniPay users are
 * here by default ; etalo.xyz Vercel prod env serves this chain.
 */
export const celoMainnet = defineChain({
  ...chainConfig,
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_CELO_RPC_URL ?? "https://forno.celo.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "CeloScan",
      url: "https://celoscan.io",
    },
  },
  testnet: false,
});

/**
 * The chain to use across the app — picked at build time from
 * `NEXT_PUBLIC_CHAIN_ID`. Defaults to Sepolia for local dev safety
 * (matches `.env.example` default + `packages/backend/app/config.py`
 * defaults). Production (Vercel) sets `NEXT_PUBLIC_CHAIN_ID=42220`
 * to switch to mainnet — see `docs/MAINNET_CUTOVER.md`.
 *
 * Comparing as string then coercing — Next.js env vars are always
 * strings at build time, never numbers.
 */
export const etaloChain =
  process.env.NEXT_PUBLIC_CHAIN_ID === "42220" ? celoMainnet : celoSepolia;
