import type { Account, WalletClient } from "viem";

// EIP-191 client helpers for the V2 backend's authenticated POST
// endpoints: /orders/{id}/metadata, /disputes/{id}/photos,
// /disputes/{id}/messages.
//
// Canonical message — must match app/auth.py server-side:
//   Etalo auth: {METHOD} {PATH} {TIMESTAMP}
// METHOD uppercase, PATH includes /api/v1 prefix without query
// string, TIMESTAMP is Unix seconds. Server enforces a ±5 min
// window. See docs/BACKEND.md.

export type HttpMethod = "POST" | "PUT" | "DELETE" | "PATCH";

export interface Eip191Headers {
  "X-Etalo-Signature": `0x${string}`;
  "X-Etalo-Timestamp": string;
}

export function buildAuthMessage(
  method: string,
  path: string,
  timestamp: number,
): string {
  return `Etalo auth: ${method.toUpperCase()} ${path} ${timestamp}`;
}

export async function signApiRequest(
  walletClient: WalletClient,
  method: HttpMethod,
  path: string,
  account?: Account,
): Promise<Eip191Headers> {
  const signer = account ?? walletClient.account;
  if (!signer) {
    throw new Error("signApiRequest: walletClient has no account attached");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildAuthMessage(method, path, timestamp);
  const signature = await walletClient.signMessage({
    account: signer,
    message,
  });
  return {
    "X-Etalo-Signature": signature,
    "X-Etalo-Timestamp": String(timestamp),
  };
}
