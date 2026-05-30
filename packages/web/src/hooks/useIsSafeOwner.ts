/**
 * useIsSafeOwner — pure address-membership check against the V1 mainnet
 * Safe owner set (ADR-056). Used to gate the /admin/disputes page.
 */
"use client";

import { SAFE_OWNERS } from "@/lib/safe-config";

export function useIsSafeOwner(address: string | undefined | null): boolean {
  if (!address) return false;
  return SAFE_OWNERS.includes(address.toLowerCase());
}
