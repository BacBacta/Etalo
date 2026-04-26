"use client";

import { useAccount } from "wagmi";

// Returns headers suitable for authenticated seller API calls per
// ADR-036. Returns null while the wallet is not yet connected so the
// caller can defer the request instead of sending an empty header.
export function useWalletHeaders(): Record<string, string> | null {
  const { address } = useAccount();
  if (!address) return null;
  return { "X-Wallet-Address": address };
}
