/**
 * User-facing terminology for the Etalo Mini App.
 *
 * CLAUDE.md forbids words like "gas", "crypto", "token", "on-ramp",
 * "off-ramp" in the UI. Always import labels from this file instead of
 * hard-coding strings, so that enforcement is centralized.
 */

export const NETWORK_FEE_LABEL = "Network fee";
export const DEPOSIT_LABEL = "Deposit";
export const WITHDRAW_LABEL = "Withdraw";
export const STABLECOIN_LABEL = "Stablecoin";
export const DIGITAL_DOLLAR_LABEL = "Digital dollar";

export const TX_STATES = {
  preparing: "Preparing",
  confirming: "Confirming",
  success: "Success",
  error: "Error",
} as const;

export type TxState = keyof typeof TX_STATES;
