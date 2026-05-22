/**
 * Single source of truth for the X-Wallet-Address authentication
 * header pattern used across the frontend's lib/*-api.ts modules.
 *
 * Previously each module built `{ "X-Wallet-Address": walletAddress }`
 * inline ; the constant migrated through 20+ call sites. Consolidating
 * here means a single point of change when the backend flips to JWT
 * (ADR-046 + the hard J12 mainnet gate) — we just adapt this one
 * function to return whatever the new auth scheme expects (Bearer
 * JWT, signed cookie, etc.) without touching every API module.
 *
 * Caveats :
 * - Backend currently trusts the header in dev mode (
 *   `settings.enforce_jwt_auth = False`, ADR-046). Mainnet flips
 *   it to `True` and the backend's `get_current_wallet` dependency
 *   throws 501 until the JWT path is wired.
 * - This helper does NOT normalize the address (no lowercase /
 *   checksum) — the backend `dependencies/wallet_auth.py`
 *   normalises to lowercase at read time. Keep this header
 *   layer dumb on purpose.
 */
export const WALLET_AUTH_HEADER = "X-Wallet-Address";

/**
 * Build the wallet-auth headers object for a given wallet address.
 * Spread into a larger headers object when extra headers are needed :
 *
 *   headers: { ...walletAuthHeaders(addr), "Content-Type": "application/json" }
 */
export function walletAuthHeaders(
  walletAddress: string,
): Record<string, string> {
  return { [WALLET_AUTH_HEADER]: walletAddress };
}
