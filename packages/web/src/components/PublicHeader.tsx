"use client";

import { MoonStars, SunDim } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";
import { ButtonV4 } from "@/components/ui/v4/Button";

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
  const { theme, setTheme } = useTheme();
  const [cartOpen, setCartOpen] = useState(false);
  // Same 3-state pattern as HomeRouter / marketplace — null distinguishes
  // "detection pending" from "non-MiniPay" so the Switch button doesn't
  // flash on first paint.
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null);
  // next-themes resolves `theme` only on the client; rendering an icon
  // server-side based on it would mismatch hydration. Render a sized
  // placeholder until mounted to keep the header width stable.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const provider = (window as unknown as { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    setIsMiniPay(provider?.isMiniPay === true);
  }, []);

  useEffect(() => setMounted(true), []);

  // J10-V5 Phase 4 Block 4b — `etalo-mode-preference` localStorage
  // key dropped from HomeRouter (sticky-preference auto-redirect was
  // creating a perceived "5s redirect" UX bug per Mike's MiniPay
  // testing). The button now just navigates the user back to landing
  // (home) so they can pick a different surface explicitly.
  const handleSwitchMode = () => {
    router.push("/");
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-celo-dark/[8%] bg-celo-light/80 backdrop-blur dark:border-celo-light/[8%] dark:bg-celo-dark-bg/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2"
            aria-label="Etalo home"
          >
            <EtaloLogo />
            <span className="font-display text-display-4 text-celo-dark dark:text-celo-light">
              Etalo
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ButtonV4
              variant="ghost"
              size="md"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={
                mounted && theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {/* lucide-react Sun/Moon temporaire — swap Phosphor SunDim/MoonStars Block 5 */}
              {mounted ? (
                theme === "dark" ? (
                  <SunDim className="h-5 w-5" />
                ) : (
                  <MoonStars className="h-5 w-5" />
                )
              ) : (
                <span className="block h-5 w-5" aria-hidden="true" />
              )}
            </ButtonV4>
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
