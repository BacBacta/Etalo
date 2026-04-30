/**
 * MiniPay context detection — single source of truth.
 *
 * Replaces the inline `window.ethereum?.isMiniPay === true` checks
 * that lived on 5 surfaces (HomeRouter, marketplace, SellerDashboard,
 * checkout, useMinipay hook) and missed Mini App Test mode where the
 * provider injection is incomplete (the canonical `isMiniPay` flag is
 * not always set, even though the surface IS rendering inside MiniPay's
 * preview WebView).
 *
 * Pattern D — three-signal detection :
 *   1. Dev/test override: `NEXT_PUBLIC_FORCE_MINIPAY=true` env var lets
 *      developers force the MiniPay flow on desktop without needing
 *      the MiniPay app at all (also unblocks Mini App Test mode if the
 *      UA fallback misses).
 *   2. Production canonical: `window.ethereum?.isMiniPay === true` —
 *      the flag Opera injects on the real Mini App.
 *   3. Mini App Test mode fallback: navigator.userAgent matching
 *      /MiniPay|Opera Mini/i — best-guess pattern, refines once Mike
 *      confirms the actual UA string from DevTools.
 *
 * The wagmi connector at `lib/minipay-connector.ts` keeps its inline
 * `eth?.isMiniPay !== true` check — that one drives wagmi's target()
 * API which expects to read directly off `window.ethereum`, not a
 * higher-level context heuristic.
 */
export function detectMiniPay(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Dev/test override.
  if (process.env.NEXT_PUBLIC_FORCE_MINIPAY === "true") return true;

  // 2. Production canonical (Opera MiniPay injects this flag).
  const eth = (
    window as unknown as { ethereum?: { isMiniPay?: boolean } }
  ).ethereum;
  if (eth?.isMiniPay === true) return true;

  // 3. Mini App Test mode fallback — best-guess UA pattern. Refine
  // once we have a confirmed UA string from a real Mini App Test
  // session (DevTools `navigator.userAgent`).
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/MiniPay|Opera Mini/i.test(ua)) return true;

  return false;
}
