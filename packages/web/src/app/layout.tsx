import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { PageTransition } from "@/components/PageTransition";
import { Providers } from "@/components/Providers";
import { PublicHeader } from "@/components/PublicHeader";
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
      <body className="min-h-screen bg-celo-light text-celo-dark antialiased dark:bg-celo-dark-bg dark:text-celo-light">
        {/*
          J10-V5 Phase 5 Angle E sub-block E.1.a — WCAG 2.4.1 Bypass
          Blocks (Level A). Keyboard users can Tab once, hit Enter,
          and skip past the PublicHeader nav directly to the page's
          <main id="main"> element.
        */}
        <SkipLink />
        <Providers>
          <PublicHeader />
          <PageTransition>{children}</PageTransition>
          <ToasterV4 position="bottom-center" />
        </Providers>
      </body>
    </html>
  );
}
