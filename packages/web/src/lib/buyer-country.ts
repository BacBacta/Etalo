/**
 * Buyer-side country lib — Sprint J11.7 Block 5 (ADR-045).
 *
 * Provides fetch + write helpers around /api/v1/users/me + a shape
 * for the buyer's country state. Used by useBuyerCountry hook (the
 * TanStack Query wrapper) and CountryPromptBanner (the inline UX
 * that surfaces if the buyer hasn't set their country yet).
 *
 * MiniPay phone-based auto-detection note : MiniPay does NOT expose
 * the user's phone number to dApps directly. SocialConnect/ODIS
 * reverse-lookup requires server-side attestation flows that are
 * V1.5+ scope. V1.7 ships the manual dropdown fallback only — buyer
 * picks their country once via CountryPromptBanner. The detection
 * function is kept stubbed here so future V1.5+ work can land
 * without changing the call sites.
 */
import { fetchApi } from "@/lib/fetch-api";
import type { components } from "@/types/api.gen";

// J11.7 Block 5 — UserMe shapes added at the backend (real /users/me).
// Local type extensions until pnpm gen:api re-runs post-merge ; the
// extensions become redundant intersections after re-gen.
type GeneratedUserMeResponse =
  components["schemas"] extends { UserMeResponse: infer T } ? T : never;

export type UserMe = GeneratedUserMeResponse extends never
  ? {
      id: string;
      wallet_address: string;
      country: string | null;
      language: string;
      has_seller_profile: boolean;
      created_at: string;
    }
  : GeneratedUserMeResponse;

export interface UserMeWrapper {
  user: UserMe | null;
}

export type BuyerCountryUpdate = {
  country?: string | null;
  language?: string | null;
};

/**
 * GET /api/v1/users/me — returns the User row for the wallet, or
 * null if no row exists yet (first visit).
 */
export async function fetchMyUser(walletAddress: string): Promise<UserMe | null> {
  const res = await fetchApi("/users/me", {
    headers: { "X-Wallet-Address": walletAddress },
  });
  if (res.status === 401) {
    throw new Error("Wallet auth required");
  }
  if (!res.ok) {
    throw new Error(`User fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as UserMeWrapper;
  return data.user ?? null;
}

/**
 * PUT /api/v1/users/me — upsert User-level fields (country, language).
 * Creates the User row if missing.
 */
export async function updateMyUser(
  walletAddress: string,
  payload: BuyerCountryUpdate,
): Promise<UserMe> {
  const res = await fetchApi("/users/me", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new Error("Wallet auth required");
  }
  if (res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? "Invalid update payload");
  }
  if (!res.ok) {
    throw new Error(`User update failed: ${res.status}`);
  }
  return (await res.json()) as UserMe;
}

/**
 * Stub for future MiniPay phone-based country detection (V1.5+).
 *
 * MiniPay does not expose phone numbers to dApps directly. SocialConnect
 * reverse-lookup would require server-side ODIS attestation flows. For
 * V1.7, this always returns null so call sites fall through to the
 * manual dropdown UX. Kept here as the canonical hook point for the
 * V1.5+ implementation.
 */
export async function detectCountryFromMiniPay(): Promise<string | null> {
  return null;
}
