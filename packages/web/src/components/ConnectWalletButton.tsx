/**
 * ConnectWalletButton — ADR-052 (multi-wallet support, Phase 1 + 2).
 *
 * Renders a wallet connect control adapted to the current context :
 *
 * - Inside MiniPay (auto-connect via `minipayConnector`) — the button
 *   stays hidden once the wallet is connected, mirroring the existing
 *   MiniPay UX (silent, no prompt).
 * - On Chrome / mobile browser with an injected wallet (MetaMask,
 *   Rabby, Valora extension, Frame) — shows "Connect wallet", click
 *   triggers `useConnect` with the `injected()` connector.
 * - On mobile / desktop WITHOUT an injected wallet but WITH the
 *   `walletConnect` connector registered (ADR-052 Phase 2 — gated on
 *   NEXT_PUBLIC_WC_PROJECT_ID being set at build time) — shows
 *   "Connect with mobile wallet" + a "Get MiniPay" secondary link.
 *   The WC modal handles QR codes on desktop and direct deeplinks
 *   into Valora / MetaMask Mobile / Trust on mobile.
 * - On any browser WITHOUT injected AND without WC — shows "Get
 *   MiniPay" linking to the MiniPay download page (the recommended
 *   path for first-time mobile buyers per Etalo positioning).
 *
 * Once connected (any path), shows the truncated address with a
 * "Disconnect" affordance.
 */
"use client";

import { SignOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { detectMiniPay } from "@/lib/minipay-detect";

const MINIPAY_DOWNLOAD_URL = "https://www.opera.com/products/minipay";

// Build-time inlined so we can show in the debug panel whether the
// WalletConnect env var was visible at next build (Vercel re-deploys
// don't always pick up new env vars without "redeploy without cache").
const WC_PROJECT_ID_AT_BUILD =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  // We avoid SSR mismatch by deferring detection to mount. `inMiniPay`
  // starts false so server and first-client render produce identical
  // markup ; the effect resolves the real value after hydration.
  const [hasInjected, setHasInjected] = useState(false);
  const [inMiniPay, setInMiniPay] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInMiniPay(detectMiniPay());
    if (typeof window !== "undefined") {
      const eth = (window as Window & { ethereum?: unknown }).ethereum;
      setHasInjected(Boolean(eth));
      // `?debug=wallet` query string flips the on-page diagnostic
      // panel so we can remotely inspect the env-var + connector state
      // on the user's actual device, instead of fishing through a
      // tiny mobile DevTools.
      const params = new URLSearchParams(window.location.search);
      setDebugMode(params.get("debug") === "wallet");
    }
  }, []);

  // Diagnostic panel — only renders when `?debug=wallet` is in the URL.
  // Tree-shake-friendly : the panel JSX is short and shared across
  // every render branch, no big payload regardless of debug state.
  if (debugMode && mounted) {
    return (
      <pre
        data-testid="wallet-debug-panel"
        className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        {JSON.stringify(
          {
            wc_project_id_seen_at_build: Boolean(WC_PROJECT_ID_AT_BUILD),
            wc_project_id_prefix:
              WC_PROJECT_ID_AT_BUILD.slice(0, 4) || "(empty)",
            wc_project_id_length: WC_PROJECT_ID_AT_BUILD.length,
            connector_count: connectors.length,
            connector_ids: connectors.map((c) => ({
              id: c.id,
              type: c.type,
              name: c.name,
            })),
            hasInjected,
            inMiniPay,
            isConnected,
            address: address ? shortAddress(address) : null,
            ua:
              typeof navigator !== "undefined"
                ? navigator.userAgent.slice(0, 80)
                : "?",
          },
          null,
          2,
        )}
      </pre>
    );
  }

  // Inside MiniPay, the minipayConnector auto-connects via wagmi's
  // reconnect logic ; render nothing until that resolves, then nothing
  // (the MiniPay surface doesn't need a "Connect" button — the wallet
  // is implicit). Skip render entirely to avoid a flicker on the
  // dashboard header.
  if (mounted && inMiniPay) {
    return null;
  }

  // SSR / first-paint : render a placeholder of consistent width so
  // the header layout doesn't shift when the button materializes.
  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className="h-11 w-32"
      />
    );
  }

  if (isConnected && address) {
    // Mobile-first layout : the address + a 44-px icon-only Disconnect
    // button. On sm+ viewports we restore the full "Disconnect" label
    // so desktop users still see the explicit action word. Before
    // this fix the inline "Disconnect" text + address + 3 header
    // icons + logo totaled ~430 px on a 360 px MiniPay viewport,
    // causing page-level horizontal scroll on /marketplace and
    // friends (Mike caught it 2026-05-22 screenshot).
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <span
          data-testid="connect-wallet-address"
          className="font-mono text-sm tabular-nums text-celo-dark dark:text-celo-light"
        >
          {shortAddress(address)}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => disconnect()}
          data-testid="connect-wallet-disconnect"
          aria-label="Disconnect wallet"
          className="min-h-[44px] min-w-[44px] px-2 sm:px-4"
        >
          <SignOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      </div>
    );
  }

  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect" || c.type === "walletConnect",
  );

  if (!hasInjected) {
    // No browser extension wallet. If WalletConnect is configured we
    // offer the mobile-wallet path as the primary CTA + keep "Get
    // MiniPay" as a secondary link. Otherwise we fall back to the
    // MiniPay install link as the only path (current production
    // behavior pre-Phase-2).
    if (walletConnectConnector) {
      return (
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            onClick={() => connect({ connector: walletConnectConnector })}
            disabled={isConnecting}
            data-testid="connect-wallet-walletconnect"
            className="min-h-[44px]"
          >
            {isConnecting ? "Connecting…" : "Connect with mobile wallet"}
          </Button>
          <a
            href={MINIPAY_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="connect-wallet-get-minipay"
            className="text-sm text-celo-dark/70 underline underline-offset-4 hover:text-celo-dark dark:text-celo-light/70 dark:hover:text-celo-light"
          >
            Or install MiniPay
          </a>
        </div>
      );
    }
    return (
      <a
        href={MINIPAY_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="connect-wallet-get-minipay"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-celo-forest-bright px-4 py-2 text-base font-medium text-celo-dark hover:bg-celo-forest-bright/90"
      >
        Get MiniPay
      </a>
    );
  }

  const injectedConnector = connectors.find((c) => c.type === "injected");

  return (
    <Button
      type="button"
      onClick={() => {
        if (!injectedConnector) return;
        connect({ connector: injectedConnector });
      }}
      disabled={isConnecting || !injectedConnector}
      data-testid="connect-wallet-button"
      className="min-h-[44px]"
    >
      {isConnecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
