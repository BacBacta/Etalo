"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SellerDashboardStubPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const provider = (window as unknown as { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    if (provider?.isMiniPay !== true) {
      router.replace("/");
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-xl font-semibold">Seller dashboard</h1>
        <p className="mb-6 text-base text-neutral-700">
          Your private space to manage products, track sales, and grow
          your shop.
        </p>
        <p className="mb-6 text-sm text-neutral-500">
          Coming in J6 Block 8. For now, head back to discover the
          marketplace.
        </p>
        <Link
          href="/marketplace"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-300 px-6 text-base font-medium hover:bg-neutral-50"
        >
          Browse marketplace
        </Link>
      </div>
    </main>
  );
}
