/**
 * Mainnet Safe configuration for the admin triage page (ADR-056).
 *
 * Source of truth: CLAUDE.md "Multisig Safe" section. The wallet-gated
 * /admin/disputes page only renders for connected addresses in
 * SAFE_OWNERS ; the page itself never executes a Safe tx — it prepares
 * calldata and links out to Safe's queue UI for the signers.
 */
export const SAFE_ADDRESS =
  "0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F" as const;

/** Safe Transaction Service chain prefix for Celo mainnet. */
export const SAFE_CHAIN_PREFIX = "celo" as const;

/** 3 owners of the V1 mainnet Safe — lowercased for cheap address-equality. */
export const SAFE_OWNERS: readonly string[] = [
  "0xcb56a1f46f8bc0ef9a83161678dabe49b847d047", // mobile passkey
  "0xfcfe723245e1e926ae676025138ca2c38ecba8d8", // deployer EOA
  "0x1b26f42cc3b1e21afe33756b9282a5514f030a12", // cold recovery
];

export function safeQueueUrl(): string {
  return `https://app.safe.global/transactions/queue?safe=${SAFE_CHAIN_PREFIX}:${SAFE_ADDRESS}`;
}
