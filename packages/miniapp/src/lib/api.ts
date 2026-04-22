/**
 * Thin fetch wrapper that prefixes the API base URL and attaches the
 * temporary X-Wallet-Address header for endpoints that require auth.
 *
 * SECURITY: the header is a dev-only shortcut for the backend's
 * get_current_wallet dependency — see docs/DECISIONS.md. When JWT auth
 * ships, this wrapper will attach `Authorization: Bearer <token>` and
 * drop the wallet header.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

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

type ApiOptions = RequestInit & { wallet?: string };

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { wallet, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const isFormData = rest.body instanceof FormData;
  if (!finalHeaders.has("Content-Type") && rest.body && !isFormData) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (wallet) {
    finalHeaders.set("X-Wallet-Address", wallet);
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
