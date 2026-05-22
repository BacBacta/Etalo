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

import { CaretDown, Check, Copy, SignOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  SheetV4,
  SheetV4Content,
  SheetV4Description,
  SheetV4Header,
  SheetV4Title,
  SheetV4Trigger,
} from "@/components/ui/v4/Sheet";
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
    return <ConnectedAddressMenu address={address} onDisconnect={disconnect} />;
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
      // Mobile-tight label : just "Connect" (~80 px) instead of
      // "Connect with mobile wallet" (~200 px) so the disconnected
      // header fits the 360 px viewport. Desktop keeps the full
      // explicit label. The "Or install MiniPay" secondary link is
      // dropped from the header on every viewport — the WalletConnect
      // modal itself already lists wallet installation options, so
      // the fallback isn't lost, just moved one tap deeper.
      return (
        <Button
          type="button"
          onClick={() => connect({ connector: walletConnectConnector })}
          disabled={isConnecting}
          data-testid="connect-wallet-walletconnect"
          className="min-h-[44px]"
        >
          {isConnecting
            ? "Connecting…"
            : (
                <>
                  <span className="sm:hidden">Connect</span>
                  <span className="hidden sm:inline">
                    Connect with mobile wallet
                  </span>
                </>
              )}
        </Button>
      );
    }
    return (
      <a
        href={MINIPAY_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="connect-wallet-get-minipay"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-celo-forest-bright px-3 py-2 text-base font-medium text-celo-dark hover:bg-celo-forest-bright/90 sm:px-4"
      >
        <span className="sm:hidden">MiniPay</span>
        <span className="hidden sm:inline">Get MiniPay</span>
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

// ConnectedAddressMenu — connected-state surface. Trigger = the
// truncated address rendered as a button with a small caret. Sheet
// content = full address (with copy-to-clipboard) + Disconnect. Single
// component for mobile + desktop ; the sheet itself slides up from the
// bottom on small viewports (per SheetV4 default side="bottom" via
// className) which feels native on Android Chrome and MiniPay
// WebView. Replaces the previous inline `address + Disconnect` row
// that overflowed 360 px viewports (caught 2026-05-22).
interface ConnectedAddressMenuProps {
  address: string;
  onDisconnect: () => void;
}

function ConnectedAddressMenu({
  address,
  onDisconnect,
}: ConnectedAddressMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        toast.success("Address copied");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Couldn't copy"));
  };

  const handleDisconnect = () => {
    onDisconnect();
    setOpen(false);
  };

  return (
    <SheetV4 open={open} onOpenChange={setOpen}>
      <SheetV4Trigger asChild>
        <button
          type="button"
          data-testid="connect-wallet-address"
          aria-label="Wallet menu"
          className="inline-flex min-h-[44px] items-center gap-1 rounded-pill border border-celo-dark/15 px-3 font-mono text-sm tabular-nums text-celo-dark hover:bg-celo-forest-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/15 dark:text-celo-light dark:hover:bg-celo-forest-bright-soft"
        >
          {shortAddress(address)}
          <CaretDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </button>
      </SheetV4Trigger>
      <SheetV4Content
        side="bottom"
        className="rounded-t-3xl border-t border-celo-dark/[8%] dark:border-celo-light/[8%]"
      >
        <SheetV4Header>
          <SheetV4Title>Your wallet</SheetV4Title>
          <SheetV4Description>
            Connected to Etalo on Celo.
          </SheetV4Description>
        </SheetV4Header>
        <div className="space-y-4 px-1 pb-2">
          {/* Full address row — long string wraps via break-all so the
              whole hex is selectable / copyable without truncation. */}
          <div className="rounded-2xl border border-celo-dark/[8%] bg-celo-light/60 p-3 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated">
            <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500 dark:text-celo-light/60">
              Address
            </p>
            <p
              data-testid="connect-wallet-address-full"
              className="break-all font-mono text-sm text-celo-dark dark:text-celo-light"
            >
              {address}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              data-testid="connect-wallet-copy"
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-celo-dark/15 px-4 text-sm font-medium text-celo-dark hover:bg-celo-forest-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/15 dark:text-celo-light dark:hover:bg-celo-forest-bright-soft"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-celo-forest" weight="bold" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy address
                </>
              )}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleDisconnect}
            data-testid="connect-wallet-disconnect"
            className="min-h-[48px] w-full"
          >
            <SignOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Disconnect
          </Button>
        </div>
      </SheetV4Content>
    </SheetV4>
  );
}
