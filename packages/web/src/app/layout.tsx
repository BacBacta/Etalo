import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/Providers";
import { PublicHeader } from "@/components/PublicHeader";
import { Toaster } from "@/components/ui/sonner";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
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
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <Providers>
          <PublicHeader />
          {children}
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  );
}
