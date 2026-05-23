/**
 * WalletDebugOverlay — on-screen log viewer for MiniPay debug
 * sessions when chrome://inspect isn't available.
 *
 * Render contract :
 *  - Only renders when `?debug=wallet` was ever in the URL during
 *    this session (sticky via sessionStorage so SPA navigation
 *    doesn't lose the toggle).
 *  - Fixed at the bottom of the viewport, high z-index, monospace
 *    green-on-black to be unmistakable.
 *  - Tap to collapse / expand. "Copy" button writes the full buffer
 *    to clipboard. "Clear" empties the in-memory + localStorage
 *    buffer.
 *
 * Lines come from `walletLog(...)` calls in the wallet chain
 * (useMinipay, SilentReconnectGate, minipayConnector, etc.).
 */
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  clearWalletDebug,
  getWalletDebugLines,
  isWalletDebugEnabled,
  subscribeWalletDebug,
  walletLog,
} from "@/lib/wallet-debug";

function getServerSnapshot(): never[] {
  return [];
}

export function WalletDebugOverlay() {
  const lines = useSyncExternalStore(
    subscribeWalletDebug,
    getWalletDebugLines,
    getServerSnapshot,
  );
  const [enabled, setEnabled] = useState(false);
  // Default collapsed so the overlay doesn't block taps on the page
  // content. When expanded the overlay takes up 45vh — on a 640 px
  // MiniPay viewport that covers ~288 px of the bottom, blocking
  // HomeMiniPay's "Open my boutique" button. User taps ▲ to expand
  // when they want to read or copy the buffer.
  const [collapsed, setCollapsed] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  // SSR-safe enablement check : runs only after mount.
  useEffect(() => {
    if (!isWalletDebugEnabled()) return;
    setEnabled(true);
    // Capture page-boot context the moment the overlay activates.
    const eth = (window as Window & { ethereum?: { isMiniPay?: unknown } })
      .ethereum;
    walletLog("OVERLAY_MOUNT", {
      href: window.location.href,
      ua: navigator.userAgent.slice(0, 80),
      hasEth: Boolean(eth),
      ethIsMiniPay: eth?.isMiniPay ?? null,
      ethKeys: eth
        ? Object.getOwnPropertyNames(eth).slice(0, 20)
        : null,
    });
  }, []);

  if (!enabled) return null;

  const handleCopy = async () => {
    const text = lines
      .map((l) => `${new Date(l.ts).toISOString().slice(11, 23)} ${l.text}`)
      .join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for WebViews without clipboard API
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  return (
    <div
      data-testid="wallet-debug-overlay"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        maxHeight: collapsed ? "28px" : "45vh",
        overflow: "auto",
        background: "rgba(0,0,0,0.92)",
        color: "#0f0",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: "10px",
        lineHeight: "1.4",
        padding: "0",
        borderTop: "1px solid #0a0",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(0,0,0,0.98)",
          padding: "4px 8px",
          borderBottom: "1px solid #0a0",
        }}
      >
        <span style={{ color: "#fff", fontWeight: "bold" }}>
          WALLET DEBUG · {lines.length} lines
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: "2px 8px",
              background: copyState === "copied" ? "#0a0" : "transparent",
              color: "#fff",
              border: "1px solid #444",
              fontSize: "10px",
            }}
          >
            {copyState === "copied"
              ? "✓ Copied"
              : copyState === "error"
                ? "✗ Failed"
                : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => clearWalletDebug()}
            style={{
              padding: "2px 8px",
              background: "transparent",
              color: "#fff",
              border: "1px solid #444",
              fontSize: "10px",
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand log" : "Collapse log"}
            style={{
              padding: "2px 10px",
              background: "transparent",
              color: "#fff",
              border: "1px solid #444",
              fontSize: "10px",
            }}
          >
            {collapsed ? "▲" : "▼"}
          </button>
        </span>
      </div>
      {!collapsed && (
        <div style={{ padding: "4px 8px" }}>
          {lines.length === 0 ? (
            <div style={{ color: "#888" }}>
              (no log yet — interact with the wallet flow)
            </div>
          ) : (
            lines.map((l, i) => (
              <div
                key={`${l.ts}-${i}`}
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
              >
                <span style={{ color: "#5f5" }}>
                  {new Date(l.ts).toISOString().slice(11, 23)}
                </span>{" "}
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
