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
import { SkipLink } from "@/components/SkipLink";
import { ToasterV4 } from "@/components/ui/v4/Toast";

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
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

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
            comes from Pinata IPFS gateway. The DNS + TLS handshake adds
            150-400 ms to the LCP on first paint ; preconnect kicks it
            off in parallel with the HTML parse so the first image
            request reuses an open connection. dns-prefetch as a
            fallback for browsers that ignore preconnect or rate-limit
            it. */}
        <link rel="preconnect" href="https://gateway.pinata.cloud" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://gateway.pinata.cloud" />
      </head>
      <body className="min-h-screen bg-celo-light text-celo-dark antialiased dark:bg-celo-dark-bg dark:text-celo-light">
        {/* WCAG 2.4.1 Bypass Blocks — keyboard users skip to <main>. */}
        <SkipLink />
        {children}
        <ToasterV4 position="bottom-center" />
      </body>
    </html>
  );
}
