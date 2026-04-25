import type { ReactNode } from "react";

import { useMinipay } from "@/hooks/useMinipay";

// Connection state gate aligned with MiniPay best practices
// (CLAUDE.md rule 7, ADR-034 spirit).
//
// MiniPay forbids both the silent-fail UX (white screen) and the
// "Click to connect" button: the WebView auto-connects, our job is
// to communicate the auto-connect lifecycle clearly.
export function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected, isConnecting, isInMinipay } = useMinipay();

  if (isConnecting) {
    return (
      <div className="p-8 text-center text-base">
        Connecting to MiniPay…
      </div>
    );
  }

  if (!isConnected && !isInMinipay) {
    return (
      <div className="p-8 text-center text-base">
        Please open this app from MiniPay to connect to your wallet.
      </div>
    );
  }

  if (!isConnected && isInMinipay) {
    return (
      <div className="p-8 text-center text-base">
        Unable to connect. Please reopen MiniPay and try again.
      </div>
    );
  }

  return <>{children}</>;
}
