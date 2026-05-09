/**
 * Onboarding API wrapper — POST /api/v1/onboarding/complete (atomic
 * User + SellerProfile + first Product creation) + handle availability
 * lookup. Both routes auth via X-Wallet-Address (ADR-046 testnet
 * posture).
 */
import { fetchApi } from "@/lib/fetch-api";
import type { components } from "@/types/api.gen";

export type OnboardingCompleteRequest =
  components["schemas"]["OnboardingCompleteRequest"];
export type OnboardingCompleteResponse =
  components["schemas"]["OnboardingCompleteResponse"];
export type HandleAvailabilityResponse =
  components["schemas"]["HandleAvailabilityResponse"];

export class HandleTakenError extends Error {
  constructor() {
    super("Shop handle is already taken.");
    this.name = "HandleTakenError";
  }
}

/**
 * Live availability check used by the onboarding wizard's handle
 * input. Returns the typed payload as-is so callers can render
 * format vs taken vs available distinctly.
 */
export async function checkHandleAvailable(
  walletAddress: string,
  handle: string,
): Promise<HandleAvailabilityResponse> {
  const res = await fetchApi(
    `/sellers/handle-available/${encodeURIComponent(handle)}`,
    { headers: { "X-Wallet-Address": walletAddress } },
  );
  if (!res.ok) {
    throw new Error(`Handle check failed: ${res.status}`);
  }
  return (await res.json()) as HandleAvailabilityResponse;
}

export async function completeOnboarding(
  walletAddress: string,
  body: OnboardingCompleteRequest,
): Promise<OnboardingCompleteResponse> {
  const res = await fetchApi("/onboarding/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Address": walletAddress,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    throw new HandleTakenError();
  }
  if (!res.ok) {
    throw new Error(`Onboarding failed: ${res.status}`);
  }
  return (await res.json()) as OnboardingCompleteResponse;
}
