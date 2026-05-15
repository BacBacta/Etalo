/**
 * PublicHeaderMinimal — ADR-052 multi-wallet header.
 *
 * Header for the (public) route group : Etalo brand, theme toggle,
 * AND a wallet connect control (ADR-052). The (public) layout now
 * carries WagmiProvider so we can host ConnectWalletButton here ;
 * inside MiniPay it auto-connects silently, on Chrome it shows
 * "Connect wallet" or "Get MiniPay" depending on whether an
 * injected provider exists.
 *
 * The wallet code that the ADR-051 lightweight header was avoiding
 * now ships as part of the public surface — accepted trade-off per
 * ADR-052 (full feature parity in Chrome).
 */
"use client";

import { MoonStars, SunDim } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { ButtonV4 } from "@/components/ui/v4/Button";

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

export function PublicHeaderMinimal() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => setMounted(true), []);

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
            <CartTrigger onClick={() => setCartOpen(true)} />
            <ConnectWalletButton />
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
          </div>
        </div>
      </header>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
