import { formatUnits, parseUnits } from "viem";

/**
 * USDT has 6 decimals — never use parseEther / formatEther for it.
 */
export const USDT_DECIMALS = 6;

export function parseUsdt(amount: string): bigint {
  return parseUnits(amount, USDT_DECIMALS);
}

export function formatUsdt(amount: bigint): string {
  return formatUnits(amount, USDT_DECIMALS);
}

/**
 * Format a USDT bigint amount for display with two decimals
 * and a "USDT" suffix, e.g. `12345678n` -> "12.35 USDT".
 */
export function displayUsdt(amount: bigint): string {
  const raw = formatUsdt(amount);
  const value = Number(raw);
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}
