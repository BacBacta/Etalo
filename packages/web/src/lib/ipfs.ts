/**
 * Single source of truth for the IPFS gateway URL used across the
 * frontend. Previously this constant was inlined in 6 places (5
 * seller components + 1 helper module) with 3 distinct identifier
 * names (`PINATA_GATEWAY`, `IPFS_GATEWAY`, `PINATA_GATEWAY_FOR_PREVIEW`).
 *
 * `ipfs.io` was adopted in the Phase A perf pass — gateway.pinata.cloud
 * was the original choice but image fetches were taking ~4-5 s in
 * production (vs ~0.5 s on ipfs.io). The backend Fly deploy already
 * forces `PINATA_GATEWAY_URL=https://ipfs.io/ipfs` via fly.toml ;
 * this module aligns the frontend on the same value.
 *
 * If we ever move to a paid Pinata Dedicated gateway (mainnet
 * V1.5+ scaling), this is the only place to change.
 */
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/**
 * Build a full IPFS URL from a hash. Returns null for null/empty
 * input so callers can pass through unset values without branching.
 */
export function ipfsUrl(hash: string | null | undefined): string | null {
  if (!hash) return null;
  return `${IPFS_GATEWAY}${hash}`;
}
