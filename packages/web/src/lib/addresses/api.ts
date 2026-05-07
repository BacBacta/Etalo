/**
 * Buyer address book API client — Sprint J11.7 Block 6 (ADR-044).
 *
 * Wraps the 5 backend endpoints under /api/v1/me/addresses :
 *   GET    list
 *   POST   create
 *   PATCH  update
 *   DELETE soft delete
 *   POST   /{id}/set-default
 *
 * All requests use X-Wallet-Address auth (ADR-036, same dev pattern as
 * Block 2/4/5). Caller wallet is normalized lowercase server-side.
 *
 * Local type extensions cover the V1.7 schemas until pnpm gen:api
 * re-runs (forward-compatible : the local types become redundant
 * intersections).
 */
import { fetchApi } from "@/lib/fetch-api";

// J11.7 Block 6 — local types until pnpm gen:api re-runs post-merge.
export type CountryCode = "NGA" | "GHA" | "KEN";

export interface DeliveryAddress {
  id: string;
  phone_number: string;
  country: CountryCode;
  city: string;
  region: string;
  address_line: string;
  landmark: string | null;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryAddressList {
  items: DeliveryAddress[];
  count: number;
}

export interface DeliveryAddressCreate {
  phone_number: string;
  country: CountryCode;
  city: string;
  region: string;
  address_line: string;
  landmark?: string | null;
  notes?: string | null;
}

export interface DeliveryAddressUpdate {
  phone_number?: string;
  country?: CountryCode;
  city?: string;
  region?: string;
  address_line?: string;
  landmark?: string | null;
  notes?: string | null;
}

function authHeaders(walletAddress: string): Record<string, string> {
  return { "X-Wallet-Address": walletAddress };
}

export async function fetchAddresses(
  walletAddress: string,
): Promise<DeliveryAddressList> {
  const res = await fetchApi("/me/addresses", {
    headers: authHeaders(walletAddress),
  });
  if (res.status === 401) throw new Error("Wallet auth required");
  if (res.status === 404) throw new Error("Onboard first via wallet connect");
  if (!res.ok) throw new Error(`Address fetch failed: ${res.status}`);
  return (await res.json()) as DeliveryAddressList;
}

export async function createAddress(
  walletAddress: string,
  payload: DeliveryAddressCreate,
): Promise<DeliveryAddress> {
  const res = await fetchApi("/me/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(walletAddress) },
    body: JSON.stringify(payload),
  });
  if (res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? "Invalid address payload");
  }
  if (!res.ok) throw new Error(`Address create failed: ${res.status}`);
  return (await res.json()) as DeliveryAddress;
}

export async function updateAddress(
  walletAddress: string,
  id: string,
  payload: DeliveryAddressUpdate,
): Promise<DeliveryAddress> {
  const res = await fetchApi(`/me/addresses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(walletAddress) },
    body: JSON.stringify(payload),
  });
  if (res.status === 404) throw new Error("Address not found");
  if (res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? "Invalid address payload");
  }
  if (!res.ok) throw new Error(`Address update failed: ${res.status}`);
  return (await res.json()) as DeliveryAddress;
}

export async function deleteAddress(
  walletAddress: string,
  id: string,
): Promise<void> {
  const res = await fetchApi(`/me/addresses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(walletAddress),
  });
  if (res.status === 404) throw new Error("Address not found");
  if (!res.ok && res.status !== 204) {
    throw new Error(`Address delete failed: ${res.status}`);
  }
}

export async function setDefaultAddress(
  walletAddress: string,
  id: string,
): Promise<DeliveryAddress> {
  const res = await fetchApi(
    `/me/addresses/${encodeURIComponent(id)}/set-default`,
    { method: "POST", headers: authHeaders(walletAddress) },
  );
  if (res.status === 404) throw new Error("Address not found");
  if (!res.ok) throw new Error(`Set default failed: ${res.status}`);
  return (await res.json()) as DeliveryAddress;
}
