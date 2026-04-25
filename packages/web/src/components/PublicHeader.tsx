"use client";

import Link from "next/link";
import { useState } from "react";

import { CartTrigger } from "@/components/CartTrigger";

export function PublicHeader() {
  const [cartOpen, setCartOpen] = useState(false);
  // TODO Étape 4.2: pass cartOpen + setCartOpen to <CartDrawer /> below.
  // For now, the trigger no-ops the state — the click only logs and
  // increments are visible via the badge update.
  if (cartOpen) {
    // Eslint: avoid unused-state warning when the drawer isn't wired yet.
    // The drawer in Étape 4.2 will read cartOpen.
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Etalo
        </Link>
        <CartTrigger onClick={() => setCartOpen(true)} />
      </div>
    </header>
  );
}
