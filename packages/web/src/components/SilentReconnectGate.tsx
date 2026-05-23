/**
 * SilentReconnectGate — silent wallet reconnect on page mount.
 *
 * Replaces wagmi's default `reconnectOnMount` behavior which, on some
 * browsers/wallet combinations, surfaces a permission prompt to the
 * user even when they previously approved the origin. That prompt
 * propagates as `"User rejected the request"` if the user clicks
 * Reject, which then bubbled up to the global error boundary and
 * surfaced "Something went wrong" to a buyer who'd simply said no.
 *
 * The contract :
 *  - WagmiProvider gets `reconnectOnMount={false}` so wagmi never
 *    fires its own reconnect attempt.
 *  - This gate, mounted once near the root, asks the injected
 *    provider directly via `eth_accounts` (the *silent* RPC method —
 *    returns approved accounts without prompting, returns `[]` if
 *    nothing approved).
 *  - If accounts come back non-empty, we call wagmi's `connect()` with
 *    the matching connector. Since accounts are already approved for
 *    the origin, this resolves without a UI popup.
 *  - If empty, we do nothing — the user must click "Connect wallet"
 *    explicitly when they're ready.
 *
 * Net : returning buyers with active MetaMask/Phantom session get
 * their wallet hooked up transparently ; first-time visitors and
 * users who revoked permissions see the disconnected UI cleanly,
 * no surprise popup.
 *
 * Caveats / non-goals :
 *  - WalletConnect is not silently restored here. WC sessions live on
 *    a relay and have their own restoration path (which wagmi handles
 *    on first `connect()` call by the user). Restoring them silently
 *    requires more involved bookkeeping — V1.5+ scope.
 *  - MiniPay's own auto-connect (via the minipayConnector +
 *    useMinipay hook) is unaffected ; it has its own gate.
 */
"use client";

import { useEffect, useRef } from "react";
import { useAccount, useConnect } from "wagmi";

import { detectMiniPay } from "@/lib/minipay-detect";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
}

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

export function SilentReconnectGate() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  // Single-shot guard. Reconnect should only fire once per page load,
  // never on re-render (would race with the user's explicit
  // Connect click in ConnectWalletButton).
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    if (isConnected) {
      attemptedRef.current = true;
      return;
    }
    const eth = getEthereum();
    if (!eth) {
      attemptedRef.current = true;
      return;
    }
    attemptedRef.current = true;

    // Pick the connector that can actually accept the provider at
    // window.ethereum. Real MiniPay → the strict `minipay` connector
    // (target() requires isMiniPay=true). Anything else → prefer an
    // EIP-6963 specific (e.g. `io.metamask`) then fall back to the
    // generic `injected`. This covers Chrome with MetaMask AND
    // MiniPay's "Mini App Test" developer mode, where the WebView
    // injects a working provider but DOES NOT set the `isMiniPay`
    // flag.
    const isRealMinipay = eth.isMiniPay === true;
    const target = isRealMinipay
      ? connectors.find((c) => c.id === "minipay")
      : (connectors.find(
          (c) =>
            c.type === "injected" &&
            c.id !== "injected" &&
            c.id !== "minipay" &&
            c.id !== "walletConnect",
        ) ??
        connectors.find((c) => c.id === "injected"));
    if (!target) return;

    eth
      .request({ method: "eth_accounts" })
      .then((result) => {
        const accounts = Array.isArray(result) ? (result as string[]) : [];

        if (accounts.length > 0) {
          // Returning user — origin already approved, connect is silent.
          connect({ connector: target });
          return;
        }

        // No approved accounts yet. In a MiniPay context (real or Test
        // mode, lenient detection) the wallet is implicit — per MiniPay
        // best practices (docs.minipay.xyz/getting-started/wallet-connection)
        // and CLAUDE.md rule 7, we must auto-connect and never surface
        // a Connect Wallet button. Calling connect() here triggers
        // `eth_requestAccounts` ; in real MiniPay it resolves silently
        // (pre-approved at the WebView level), and in Test mode it
        // surfaces the one-time approval prompt that gets the dev
        // session unstuck. Outside MiniPay (regular Chrome, no prior
        // approval) we stay silent — the user must tap Connect
        // explicitly so we don't pop a MetaMask permission dialog on
        // first page load.
        if (detectMiniPay()) {
          connect({ connector: target });
        }
      })
      .catch(() => {
        // Provider rejected `eth_accounts` for whatever reason — fall
        // back to silent no-op. The user can still tap "Connect"
        // explicitly to retry.
      });
  }, [isConnected, connect, connectors]);

  return null;
}
