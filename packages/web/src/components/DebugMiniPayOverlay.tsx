/**
 * DebugMiniPayOverlay — env-gated diagnostic banner showing the 4
 * detection signals + final result of detectMiniPay() on the bottom-
 * right of the page. Activated by `NEXT_PUBLIC_DEBUG_MINIPAY=true` in
 * .env.local; production builds tree-shake this into a no-op return
 * once the env var is unset.
 *
 * Goal: empirical visibility into the detection ladder without forcing
 * Mike to open MiniPay Test mode DevTools (which is awkward on a
 * tunneled WebView). Hotfix #4 added this overlay alongside the
 * hostname signal so the next regression on that detection path is
 * 30 seconds to diagnose instead of multiple round-trips.
 *
 * Mount in HomeRouter (top-level) — only renders when the env var is
 * set, so unmounted in production by default. Z-index 99999 sits above
 * OnboardingScreenV5 (z-50) so the banner stays visible during the
 * onboarding overlay.
 */
"use client";

import { useEffect, useState } from "react";

import { detectMiniPay } from "@/lib/minipay-detect";

interface Signals {
  env: string | undefined;
  eth: boolean | undefined;
  host: string;
  ua: string;
  result: boolean;
}

export function DebugMiniPayOverlay() {
  const [signals, setSignals] = useState<Signals | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_MINIPAY !== "true") return;
    if (typeof window === "undefined") return;
    const eth = (
      window as unknown as { ethereum?: { isMiniPay?: boolean } }
    ).ethereum;
    setSignals({
      env: process.env.NEXT_PUBLIC_FORCE_MINIPAY,
      eth: eth?.isMiniPay,
      host: window.location?.hostname || "",
      ua: navigator.userAgent || "",
      result: detectMiniPay(),
    });
  }, []);

  if (process.env.NEXT_PUBLIC_DEBUG_MINIPAY !== "true") return null;
  if (!signals) return null;

  return (
    <div
      data-testid="debug-minipay-overlay"
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        zIndex: 99999,
        padding: 8,
        fontSize: 10,
        lineHeight: 1.4,
        background: signals.result ? "#0a4" : "#a00",
        color: "white",
        fontFamily: "monospace",
        maxWidth: "60vw",
        borderTopLeftRadius: 4,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.2)",
      }}
    >
      <div>env={String(signals.env)} | eth={String(signals.eth)}</div>
      <div>host={signals.host}</div>
      <div>ua={signals.ua.substring(0, 50)}…</div>
      <div>
        <strong>RESULT: {String(signals.result)}</strong>
      </div>
    </div>
  );
}
