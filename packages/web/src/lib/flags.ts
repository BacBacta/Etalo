/**
 * Build-time feature flags read from NEXT_PUBLIC_* env vars.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so flipping one needs
 * a redeploy. For flags whose source of truth must be runtime-flippable
 * (e.g. the ADR-057 intake freeze), the BACKEND owns the hard gate and
 * these client flags are only a proactive UX enhancement on top.
 */

/**
 * ADR-057 migration Phase 0 — proactive intake-freeze UX. When set, the
 * cart / checkout surfaces a maintenance banner and disable their CTAs
 * BEFORE the user attempts checkout. This is optional polish: the
 * backend `ORDERS_FROZEN` gate (503 on /cart/checkout-token) is the real
 * source of truth, and the checkout flow handles that 503 gracefully
 * even when this client flag is off. Set NEXT_PUBLIC_ORDERS_FROZEN=true
 * alongside the backend freeze for the cleanest UX.
 */
export const ORDERS_FROZEN =
  process.env.NEXT_PUBLIC_ORDERS_FROZEN === "true";

/** User-facing maintenance copy, shared by the banner + error paths so
 *  the message is identical wherever the freeze surfaces. */
export const ORDERS_FROZEN_MESSAGE =
  "New orders are paused for scheduled maintenance. Your existing orders are unaffected — please check back shortly.";
