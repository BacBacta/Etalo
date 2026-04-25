"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HomeLanding } from "@/components/HomeLanding";
import { HomeMode } from "@/components/HomeMode";
import type { FeaturedSeller } from "@/lib/api";

interface Props {
  featuredSellers: FeaturedSeller[];
}

const MODE_PREFERENCE_KEY = "etalo-mode-preference";

export function HomeRouter({ featuredSellers }: Props) {
  const router = useRouter();
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const provider = (window as unknown as { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    const detected = provider?.isMiniPay === true;
    setIsMiniPay(detected);

    if (detected) {
      const pref = window.localStorage.getItem(MODE_PREFERENCE_KEY);
      if (pref === "buyer") {
        router.replace("/marketplace");
      } else if (pref === "seller") {
        router.replace("/seller/dashboard");
      }
      // pref === null → first visit, fall through to HomeMode picker.
    }
  }, [router]);

  // SEO note: render HomeLanding by default (including during the brief
  // server-render / detection-pending window). MiniPay users see a flash
  // of the landing before HomeMode swaps in — acceptable trade-off so
  // crawlers + non-MiniPay first paint get the full marketing copy.
  if (isMiniPay === true) {
    return <HomeMode />;
  }
  return <HomeLanding featuredSellers={featuredSellers} />;
}
