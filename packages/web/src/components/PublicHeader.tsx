"use client";

import Link from "next/link";
import { useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";

export function PublicHeader() {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            Etalo
          </Link>
          <CartTrigger onClick={() => setCartOpen(true)} />
        </div>
      </header>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
