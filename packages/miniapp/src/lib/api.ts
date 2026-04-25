import type { WalletClient } from "viem";

import { signApiRequest, type HttpMethod } from "@/lib/eip191";

/**
 * Thin fetch wrapper that prefixes the API base URL and (optionally)
 * attaches EIP-191 auth headers for the V2 authenticated POST routes.
 *
 * Two auth modes:
 *
 *  - `wallet`: legacy V1 dev shortcut (`X-Wallet-Address` header).
 *    Will be removed when every read/write moves to EIP-191.
 *  - `eip191`: V2 mode — signs `Etalo auth: METHOD PATH TS` over the
 *    backend-canonical path (`/api/v1/...`). The signature is fresh
 *    per request (no session, no JWT). See docs/BACKEND.md.
 */

const API_PREFIX = "/api/v1";
const API_URL = import.meta.env.VITE_API_URL ?? API_PREFIX;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface Eip191AuthOptions {
  walletClient: WalletClient;
  method: HttpMethod;
}

type ApiOptions = RequestInit & {
  wallet?: string;
  eip191?: Eip191AuthOptions;
};

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { wallet, eip191, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const isFormData = rest.body instanceof FormData;
  if (!finalHeaders.has("Content-Type") && rest.body && !isFormData) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (wallet) {
    finalHeaders.set("X-Wallet-Address", wallet);
  }
  if (eip191) {
    const signedPath = `${API_PREFIX}${path}`;
    const sig = await signApiRequest(
      eip191.walletClient,
      eip191.method,
      signedPath,
    );
    finalHeaders.set("X-Etalo-Signature", sig["X-Etalo-Signature"]);
    finalHeaders.set("X-Etalo-Timestamp", sig["X-Etalo-Timestamp"]);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}
