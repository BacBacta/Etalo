import type { SendTransactionParameters, WriteContractParameters } from "viem";

/**
 * MiniPay only accepts legacy (type 0) and CIP-64 (type 0x7b) transactions.
 * Never use EIP-1559 fields (`maxFeePerGas`, `maxPriorityFeePerGas`)
 * inside the Mini App — they will be silently rejected.
 *
 * Wrap every tx request with `asLegacyTx()` before passing it to viem /
 * wagmi. It enforces `type: 'legacy'` and strips any EIP-1559 fields
 * that might leak in from defaults.
 */

type LegacyOverrides = {
  type: "legacy";
  maxFeePerGas?: never;
  maxPriorityFeePerGas?: never;
};

export function asLegacyTx<T extends object>(params: T): T & LegacyOverrides {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxFeePerGas, maxPriorityFeePerGas, ...rest } = params as T & {
    maxFeePerGas?: unknown;
    maxPriorityFeePerGas?: unknown;
  };
  return { ...rest, type: "legacy" } as T & LegacyOverrides;
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

/**
 * CIP-64 support (type 0x7b) pays network fee in USDT via the adapter
 * contract. Full implementation lands in Block 7 (checkout flow) once
 * we wire the feeCurrency field to `VITE_USDT_ADAPTER`.
 */
export function asCip64Tx(): never {
  throw new Error("CIP-64 support lands in Block 7 (checkout flow)");
}
