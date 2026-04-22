import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useMinipay } from "@/hooks/useMinipay";

export default function Landing() {
  const { isInMinipay, isConnected, address } = useMinipay();

  // Smoke test for Block 2: log the connected address to the console.
  // CLAUDE.md rule: never render raw 0x... addresses in the UI.
  useEffect(() => {
    if (isConnected && address) {
      console.info("[etalo] wallet connected:", address);
    }
  }, [isConnected, address]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Etalo</h1>
        <p className="max-w-xs text-base text-muted-foreground">
          Your digital stall, open 24/7.
        </p>
        <Button className="mt-4 w-full max-w-xs">
          {isConnected
            ? "Open my shop"
            : isInMinipay
              ? "Get started"
              : "Open in MiniPay"}
        </Button>
      </div>
    </main>
  );
}
