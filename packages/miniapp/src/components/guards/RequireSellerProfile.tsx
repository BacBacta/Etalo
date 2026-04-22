import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useSellerProfile } from "@/hooks/useSellerProfile";

/**
 * Let the caller pass through only when the connected wallet has a
 * seller profile. Otherwise redirect to `/onboarding`.
 *
 * While the profile fetch is pending we render nothing (silent). Errors
 * are treated as "no profile" for now — the onboarding flow will
 * re-attempt the fetch at its own entry.
 */
export function RequireSellerProfile({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useSellerProfile();

  if (isPending) return null;
  if (isError || !data?.profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
