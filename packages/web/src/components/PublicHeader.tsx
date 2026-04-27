"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";
import { ButtonV4 } from "@/components/ui/v4/Button";

const MODE_PREFERENCE_KEY = "etalo-mode-preference";

// V4 logo (J10 Block 2) — exact SVG from docs/DESIGN_V4_PREVIEW.md
// §63-80. Rounded rectangle dark background + yellow circle + arc +
// 2 forest dots. Inlined (not <Image>) for crisp render at every
// device pixel ratio without an extra HTTP round-trip.
const EtaloLogo = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <rect width="28" height="28" rx="8" fill="#2E3338" />
    <circle cx="14" cy="10" r="3" fill="#FBCC5C" />
    <path
      d="M 6 22 Q 14 16 22 22"
      stroke="#FBCC5C"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    <circle cx="6" cy="22" r="1.5" fill="#476520" />
    <circle cx="22" cy="22" r="1.5" fill="#476520" />
  </svg>
);

export function PublicHeader() {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  // Same 3-state pattern as HomeRouter / marketplace — null distinguishes
  // "detection pending" from "non-MiniPay" so the Switch button doesn't
  // flash on first paint.
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const provider = (window as unknown as { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    setIsMiniPay(provider?.isMiniPay === true);
  }, []);

  const handleSwitchMode = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(MODE_PREFERENCE_KEY);
    }
    router.push("/");
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-celo-dark/[8%] bg-celo-light/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2"
            aria-label="Etalo home"
          >
            <EtaloLogo />
            <span className="font-display text-display-4 text-celo-dark">
              Etalo
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {isMiniPay === true ? (
              <ButtonV4
                variant="ghost"
                size="md"
                onClick={handleSwitchMode}
              >
                Switch mode
              </ButtonV4>
            ) : null}
            <CartTrigger onClick={() => setCartOpen(true)} />
          </div>
        </div>
      </header>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
