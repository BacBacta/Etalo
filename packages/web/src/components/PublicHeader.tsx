"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { CartTrigger } from "@/components/CartTrigger";

const MODE_PREFERENCE_KEY = "etalo-mode-preference";

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
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            Etalo
          </Link>
          <div className="flex items-center gap-2">
            {isMiniPay === true ? (
              <button
                type="button"
                onClick={handleSwitchMode}
                className="min-h-[44px] px-2 text-sm text-neutral-600 underline hover:text-neutral-900"
              >
                Switch mode
              </button>
            ) : null}
            <CartTrigger onClick={() => setCartOpen(true)} />
          </div>
        </div>
      </header>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
