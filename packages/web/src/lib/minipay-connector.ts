import { injected } from "@wagmi/core";
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
      // J10-V5 Phase 5 Angle F sub-block F.3 follow-up — `wagmi/connectors`
      // barrel previously augmented `Window` ambiently with `ethereum` ;
      // switching to `@wagmi/core` (to drop the @metamask/sdk + pino-pretty
      // build warnings) loses that augmentation, so we cast locally.
      const eth =
        typeof window !== "undefined"
          ? (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum
          : undefined;
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
