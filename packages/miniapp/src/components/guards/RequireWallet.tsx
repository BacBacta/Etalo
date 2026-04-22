import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useMinipay } from "@/hooks/useMinipay";

/**
 * Redirect to `/` when the wallet is not connected.
 *
 * While the MiniPay auto-connect is in flight, render nothing instead
 * of a "Connecting..." message — CLAUDE.md forbids surfacing transient
 * connection states to the user.
 */
export function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected, isConnecting } = useMinipay();

  if (isConnecting) return null;
  if (!isConnected) return <Navigate to="/" replace />;
  return <>{children}</>;
}
