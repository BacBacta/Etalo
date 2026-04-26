import { injected } from "wagmi/connectors";
import type { EIP1193Provider } from "viem";

/**
 * Wagmi connector that targets the MiniPay in-app wallet specifically.
 * MiniPay injects its provider at `window.ethereum` and sets the
 * `isMiniPay` flag. When we are not running inside the MiniPay WebView
 * (e.g. desktop dev), the target returns `undefined` and wagmi simply
 * falls back to the next connector in the list.
 */
export function minipayConnector() {
  return injected({
    target() {
      const eth =
        typeof window !== "undefined" ? window.ethereum : undefined;
      if (eth?.isMiniPay !== true) return undefined;
      return {
        id: "minipay",
        name: "MiniPay",
        provider: eth as unknown as EIP1193Provider,
      };
    },
    shimDisconnect: true,
  });
}
