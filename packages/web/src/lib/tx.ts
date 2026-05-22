import type { SendTransactionParameters, WriteContractParameters } from "viem";

/**
 * MiniPay only accepts legacy (type 0) and CIP-64 (type 0x7b) transactions.
 * Never use EIP-1559 fields (`maxFeePerGas`, `maxPriorityFeePerGas`)
 * inside the Mini App — they will be silently rejected.
 *
 * Two public helpers :
 *   - `asLegacyTx()`   — forces type=legacy. Used in tests + on
 *                        Sepolia where there's no real adapter to
 *                        pay fees with. Always safe.
 *   - `asTxOptions()`  — smart wrapper. Returns CIP-64 (USDT fee
 *                        abstraction) on Celo mainnet when the env
 *                        flag is on ; legacy fallback otherwise.
 *                        THIS is what production checkout / dispute
 *                        / refund / confirm hooks should call.
 */

type LegacyOverrides = {
  type: "legacy";
  maxFeePerGas?: never;
  maxPriorityFeePerGas?: never;
};

function stripEip1559<T extends object>(params: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxFeePerGas, maxPriorityFeePerGas, ...rest } = params as T & {
    maxFeePerGas?: unknown;
    maxPriorityFeePerGas?: unknown;
  };
  return rest as T;
}

export function asLegacyTx<T extends object>(params: T): T & LegacyOverrides {
  return { ...stripEip1559(params), type: "legacy" } as T & LegacyOverrides;
}

/**
 * Convenience re-exports so callers import tx types from one place
 * and don't accidentally pass EIP-1559 params.
 */
export type LegacySendTx = ReturnType<
  typeof asLegacyTx<SendTransactionParameters>
>;
export type LegacyWriteContract = ReturnType<
  typeof asLegacyTx<WriteContractParameters>
>;

// ========================================================================
// CIP-64 fee abstraction (ADR-003 ; MiniPay submission requirement, 2026-05-22)
//
// On Celo mainnet, users pay network fees in USDT via the registered
// fee-currency *adapter* (NOT the USDT token itself — the adapter is
// the contract registered in the FeeCurrencyWhitelist precompile). The
// adapter address is hardcoded here from CLAUDE.md "Key addresses
// (Celo mainnet)" to avoid an extra env var for what is a single
// canonical value per chain. If Celo ever redeploys it, both this
// constant and CLAUDE.md must be updated together.
//
// On Celo Sepolia (testnet) there is no canonical USDT adapter (the
// V2 MockUSDT we use isn't registered in the FeeCurrencyWhitelist), so
// `asTxOptions()` silently falls back to legacy. This keeps Sepolia
// test flows working without a per-env code branch.
//
// The env flag `NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED=true` is the kill
// switch — flip it off if the adapter contract ever misbehaves and we
// need users to pay in CELO temporarily. Default off so a build
// without the flag set keeps emitting legacy txs (safe, slightly less
// MiniPay-native UX).
// ========================================================================

const CELO_MAINNET_CHAIN_ID = 42220;

// USDT fee-currency adapter on Celo mainnet (CLAUDE.md "Key addresses").
const USDT_FEE_ADAPTER_MAINNET =
  "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72" as const;

const FEE_ABSTRACTION_ENABLED =
  process.env.NEXT_PUBLIC_FEE_ABSTRACTION_ENABLED === "true";

type Cip64Overrides = {
  type: "cip64";
  feeCurrency: `0x${string}`;
  maxFeePerGas?: never;
  maxPriorityFeePerGas?: never;
};

export interface TxOptionsContext {
  /** The wagmi chain ID of the network the tx will be sent to. */
  chainId: number;
}

/**
 * Smart tx-options wrapper. Returns a CIP-64 envelope (USDT fee
 * abstraction) on Celo mainnet when the env flag is on, legacy
 * otherwise. Always strips EIP-1559 fields.
 *
 * Use this in every production hook that submits a tx through wagmi's
 * `useSendTransaction` / `useWriteContract`. Pass the chainId from
 * `useChainId()` so the wrapper can decide the right envelope.
 */
export function asTxOptions<T extends object>(
  params: T,
  ctx: TxOptionsContext,
): (T & Cip64Overrides) | (T & LegacyOverrides) {
  const stripped = stripEip1559(params);
  if (
    FEE_ABSTRACTION_ENABLED &&
    ctx.chainId === CELO_MAINNET_CHAIN_ID
  ) {
    return {
      ...stripped,
      type: "cip64",
      feeCurrency: USDT_FEE_ADAPTER_MAINNET,
    } as T & Cip64Overrides;
  }
  return { ...stripped, type: "legacy" } as T & LegacyOverrides;
}
