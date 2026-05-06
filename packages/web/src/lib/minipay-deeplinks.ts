/**
 * MiniPay deeplinks — centralized constants per
 * docs.minipay.xyz/technical-references/deeplinks.html.
 *
 * Etalo respects MiniPay's listing prereqs (minipay-requirements.md)
 * by surfacing official deeplinks for low-balance handling and other
 * MiniPay-internal flows rather than hardcoding URLs at call sites.
 */

export const MINIPAY_DEEPLINKS = {
  /**
   * Opens the MiniPay deposit / Add Cash flow.
   * Used by InsufficientBalanceCTA when the buyer's stablecoin
   * balance is below the cart total (per
   * minipay-requirements.md §4 Low-Balance Handling).
   */
  ADD_CASH: "https://minipay.opera.com/add_cash",
} as const;

export type MiniPayDeeplinkTarget = keyof typeof MINIPAY_DEEPLINKS;

/**
 * Type-safe navigation to a MiniPay deeplink. Default behaviour
 * navigates the current tab (`window.location.href`) — the MiniPay
 * WebView handles the deeplink protocol on the receiving side.
 *
 * Tests can pass a custom `navigate` function to assert behaviour
 * without touching the real `window.location`.
 */
export function navigateToMiniPayDeeplink(
  target: MiniPayDeeplinkTarget,
  navigate: (url: string) => void = (url) => {
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
  },
): void {
  navigate(MINIPAY_DEEPLINKS[target]);
}
