"use client";

import { MoonStars, Receipt, SunDim } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { ButtonV4 } from "@/components/ui/v4/Button";
import { cn } from "@/lib/utils";

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
  const { theme, setTheme } = useTheme();
  const [cartOpen, setCartOpen] = useState(false);
  const { isConnected } = useAccount();
  const pathname = usePathname();
  // next-themes resolves `theme` only on the client; rendering an icon
  // server-side based on it would mismatch hydration. Render a sized
  // placeholder until mounted to keep the header width stable.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // J11.5 Block 5 — "My orders" entry. Visible only when wallet is
  // connected (no point on a public-funnel surface without orders).
  // Active state highlights for `/orders` and `/orders/<id>`.
  const isOrdersActive =
    pathname === "/orders" || pathname?.startsWith("/orders/") === true;

  // J10-V5 Phase 4 Block 4c — "Switch mode" button removed (vestigial
  // post Block 4b's drop of `etalo-mode-preference` auto-redirect).
  // Mode selection now lives on HomeMiniPay's two primary CTAs
  // ("Browse marketplace" / "Open my boutique") which is reachable
  // via the logo Link below ("/" → HomeRouter dispatches to
  // HomeMiniPay in MiniPay context).

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-celo-dark/[8%] bg-celo-light/80 backdrop-blur dark:border-celo-light/[8%] dark:bg-celo-dark-bg/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/marketplace"
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
            {isConnected && (
              <Link
                href="/orders"
                aria-label="My orders"
                aria-current={isOrdersActive ? "page" : undefined}
                data-testid="nav-my-orders"
                data-active={isOrdersActive}
                className={cn(
                  // 44×44 touch target via min-h/min-w + center icon
                  "inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-pill",
                  "text-celo-dark dark:text-celo-light",
                  "hover:bg-celo-forest-soft dark:hover:bg-celo-forest-bright-soft",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 dark:focus-visible:ring-celo-forest-bright",
                  "transition-colors duration-150",
                  isOrdersActive &&
                    "bg-celo-forest-soft dark:bg-celo-forest-bright-soft",
                )}
              >
                <Receipt size={20} weight="regular" aria-hidden="true" />
                <span className="sr-only">My orders</span>
              </Link>
            )}
            <CartTrigger onClick={() => setCartOpen(true)} />
            {/* ADR-052 — wallet connect control. Auto-hides inside
                MiniPay (the minipayConnector reconnects silently), shows
                "Connect wallet" on Chrome/desktop with an injected
                provider, "Get MiniPay" on devices without one. */}
            <ConnectWalletButton />
          </div>
        </div>
      </header>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
