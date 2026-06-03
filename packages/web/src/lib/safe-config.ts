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

/** Wallets allowed to access the /admin/disputes triage UI.
 *  Includes the 3 Safe signers + additional triage-access wallets
 *  (these can view disputes and generate calldata, but are not Safe
 *  signers and cannot execute the tx — only the 3 owners above can). */
export const SAFE_OWNERS: readonly string[] = [
  "0xcb56a1f46f8bc0ef9a83161678dabe49b847d047", // mobile passkey (Safe signer)
  "0xfcfe723245e1e926ae676025138ca2c38ecba8d8", // deployer EOA (Safe signer)
  "0x1b26f42cc3b1e21afe33756b9282a5514f030a12", // cold recovery (Safe signer)
  "0xee1283c1d5704cdd65f57ebb5374e953e13b33c0", // Mike main wallet (triage access)
];

export function safeQueueUrl(): string {
  return `https://app.safe.global/transactions/queue?safe=${SAFE_CHAIN_PREFIX}:${SAFE_ADDRESS}`;
}
