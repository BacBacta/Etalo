/**
 * Root layout — ADR-051 (V1 funnel surface scope reduction).
 *
 * Holds the bare minimum that needs to wrap EVERY route :
 * - `<html>` / `<body>` with the typography font + base theme classes
 * - `<SkipLink>` for keyboard nav (WCAG 2.4.1)
 * - `<ToasterV4>` for app-wide sonner toast positioning
 *
 * Everything else (providers, header, footer, page transition) lives
 * in the route-group layouts so the public funnel pages don't pull in
 * wagmi / cart-store. See `(public)/layout.tsx` and `(app)/layout.tsx`.
 */
import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { SkipLink } from "@/components/SkipLink";
import { ToasterV4 } from "@/components/ui/v4/Toast";
import { WalletDebugOverlay } from "@/components/WalletDebugOverlay";

const switzer = localFont({
  src: [
    { path: "../../public/fonts/switzer/Switzer-Variable.woff2", style: "normal" },
    { path: "../../public/fonts/switzer/Switzer-VariableItalic.woff2", style: "italic" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

// `||` (not `??`) so an empty-string env var also falls back. The
// ngrok dev helper writes `NEXT_PUBLIC_BASE_URL=` until ngrok is up,
// and `new URL("")` throws — crashing the entire layout SSR.
// Production fallback = etalo.xyz (current prod alias).
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://etalo.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Etalo — Your digital stall, open 24/7",
    template: "%s · Etalo",
  },
  description:
    "Non-custodial social commerce for African sellers. Secure payments, buyer protection, no middleman.",
  openGraph: {
    type: "website",
    title: "Etalo",
    siteName: "Etalo",
    description:
      "Non-custodial social commerce for African sellers. Secure payments, buyer protection, no middleman.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={switzer.variable} suppressHydrationWarning>
      <head>
        {/* LCP optimization (Phase A P1) — every product image we render
            comes from an IPFS gateway. Preconnect + dns-prefetch kick
            the DNS + TLS handshake in parallel with HTML parse so the
            first image request reuses an open connection. Updated to
            ipfs.io after gateway.pinata.cloud measured 4-5s per fetch
            (vs ~0.5s on ipfs.io). Mainnet TODO : swap to a Pinata
            Dedicated Gateway for SLA. */}
        <link rel="preconnect" href="https://ipfs.io" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ipfs.io" />
      </head>
      <body className="min-h-screen bg-celo-light text-celo-dark antialiased dark:bg-celo-dark-bg dark:text-celo-light">
        {/* WCAG 2.4.1 Bypass Blocks — keyboard users skip to <main>. */}
        <SkipLink />
        {/* AppProviders hoists WagmiProvider + QueryClientProvider +
            ThemeProvider + MotionProvider + CartHydrationGate +
            SilentReconnectGate to the ROOT so they mount ONCE and
            persist across (public) ↔ (app) SPA navigations. Without
            this, each group-boundary nav re-mounted wagmi → EIP-6963
            re-discovery → duplicate connectors → address dropped
            mid-fetch → dashboard stuck on skeleton forever
            (user-report bug 2026-05-24, logs at 09:24:08 showed
            connectorCount 5→6 in 11 ms with com.opera.minipay
            doubled). */}
        <AppProviders>{children}</AppProviders>
        <ToasterV4 position="bottom-center" />
        {/* On-screen wallet debug overlay — mounted at root so the
            `?debug=wallet` flag survives cross-route-group SPA nav
            from `(public)/` → `(app)/seller/dashboard` etc. The
            overlay is gated by sessionStorage so it only renders
            when the user has explicitly enabled it via the URL
            param at any point in the session. Zero cost otherwise. */}
        <WalletDebugOverlay />
      </body>
    </html>
  );
}
