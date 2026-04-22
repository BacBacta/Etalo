import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { useMinipay } from "@/hooks/useMinipay";

export default function Landing() {
  const navigate = useNavigate();
  const { isInMinipay, isConnected, address } = useMinipay();

  // CLAUDE.md rule: never render raw 0x... addresses in the UI.
  // Log to console only for dev verification.
  useEffect(() => {
    if (isConnected && address) {
      console.info("[etalo] wallet connected:", address);
    }
  }, [isConnected, address]);

  const ctaLabel = isConnected
    ? "Open my shop"
    : isInMinipay
      ? "Get started"
      : "Open in MiniPay";

  const onCta = () => {
    if (isConnected) navigate("/seller");
  };

  return (
    <MobileLayout
      bottomCta={
        <Button
          className="w-full"
          size="lg"
          onClick={onCta}
          disabled={!isConnected}
        >
          {ctaLabel}
        </Button>
      }
    >
      <section className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Etalo</h1>
        <p className="max-w-xs text-base text-muted-foreground">
          Your digital stall, open 24/7.
        </p>
      </section>
    </MobileLayout>
  );
}
