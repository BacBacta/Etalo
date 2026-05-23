import { injected } from "@wagmi/core";
import type { EIP1193Provider } from "viem";

/**
 * Wagmi connector that targets the MiniPay in-app wallet specifically.
 *
 * MiniPay injects its provider at `window.ethereum` and sets the
 * `isMiniPay` flag. The target() returns undefined outside the MiniPay
 * WebView so wagmi falls back to the next connector in the list.
 *
 * `shimDisconnect: false` is INTENTIONAL — the wagmi v2 injected
 * connector with shimDisconnect=true calls `wallet_requestPermissions`
 * before `eth_requestAccounts` on every fresh connect. MiniPay's
 * WebView either doesn't implement that method or hangs on it ; the
 * result is a `connect()` call that never resolves and a user stuck on
 * the dashboard skeleton forever (production bug 2026-05-23). With
 * shimDisconnect=false wagmi goes straight to `eth_requestAccounts`,
 * which MiniPay handles silently (account is pre-approved at the
 * WebView level).
 */
export function minipayConnector() {
  return injected({
    target() {
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
    shimDisconnect: false,
  });
}
