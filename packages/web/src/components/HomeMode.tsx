"use client";

import { ShoppingBag, Storefront } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

const MODE_PREFERENCE_KEY = "etalo-mode-preference";

export function HomeMode() {
  const router = useRouter();

  const choose = (mode: "buyer" | "seller") => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_PREFERENCE_KEY, mode);
    }
    router.push(mode === "buyer" ? "/marketplace" : "/seller/dashboard");
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-2xl font-semibold">
          Welcome to Etalo
        </h1>
        <p className="mb-8 text-center text-base text-neutral-700">
          How would you like to use Etalo today?
        </p>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => choose("buyer")}
            className="block min-h-[44px] w-full rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-colors hover:border-neutral-900"
          >
            <div className="flex items-start gap-4">
              <ShoppingBag className="mt-1 h-8 w-8 flex-shrink-0" />
              <div>
                <h2 className="mb-1 text-lg font-semibold">I want to buy</h2>
                <p className="text-sm text-neutral-600">
                  Browse the marketplace, discover products from African
                  sellers, and pay with USDT escrow.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => choose("seller")}
            className="block min-h-[44px] w-full rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-colors hover:border-neutral-900"
          >
            <div className="flex items-start gap-4">
              <Storefront className="mt-1 h-8 w-8 flex-shrink-0" />
              <div>
                <h2 className="mb-1 text-lg font-semibold">I want to sell</h2>
                <p className="text-sm text-neutral-600">
                  Manage your shop, track sales, and generate marketing
                  images for social media.
                </p>
              </div>
            </div>
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          You can switch mode anytime from the header.
        </p>
      </div>
    </main>
  );
}
