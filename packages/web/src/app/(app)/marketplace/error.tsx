"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Marketplace] render error:", error.message, error.digest);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center p-8"
    >
      <div className="max-w-md text-center">
        <h2 className="mb-3 text-xl font-semibold">
          Couldn&apos;t load marketplace
        </h2>
        <p className="mb-6 text-base text-neutral-600 dark:text-celo-light/70">
          Something went wrong while loading the products. Please try again.
        </p>
        <Button onClick={reset} className="min-h-[44px]">
          Retry
        </Button>
      </div>
    </main>
  );
}
