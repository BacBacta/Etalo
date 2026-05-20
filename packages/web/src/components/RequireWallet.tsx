import type { ReactNode } from "react";

import { useMinipay } from "@/hooks/useMinipay";

// Connection state gate aligned with MiniPay best practices
// (CLAUDE.md rule 7, ADR-034 spirit).
//
// MiniPay forbids both the silent-fail UX (white screen) and the
// "Click to connect" button: the WebView auto-connects, our job is
// to communicate the auto-connect lifecycle clearly.
//
// The `connectFailed` branch is the bug we fixed in production where
// MiniPay's provider would never resolve the connect call — the page
// previously sat on "Connecting to MiniPay…" forever. Now we surface
// a retry button after the hook's 8 s watchdog times out.
export function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected, isConnecting, isInMinipay, connectFailed, retry } =
    useMinipay();

  if (connectFailed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-base text-celo-dark dark:text-celo-light">
          Couldn&apos;t connect to MiniPay.
        </p>
        <button
          type="button"
          onClick={retry}
          className="min-h-[44px] px-4 text-base underline"
        >
          Retry
        </button>
      </div>
    );
  }

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
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-base text-celo-dark dark:text-celo-light">
          Unable to connect. Please reopen MiniPay and try again.
        </p>
        <button
          type="button"
          onClick={retry}
          className="min-h-[44px] px-4 text-base underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
