/**
 * check-resume-state.ts — Post-RPC-failure on-chain diagnostic tool.
 *
 * Role: when a deploy / wiring script crashes mid-sequence on a transient
 * RPC error (typically a 500 from the provider before the tx hash is
 * returned), this script lets you determine the safe resume point without
 * guessing.
 *
 * Pattern (2 checks):
 *   1. Nonce: compare deployer nonces at blockTag "latest" vs "pending".
 *      Gap of 0 → mempool is clean, safe to continue. Gap > 0 → a tx is
 *      stuck; wait or replace-by-fee before proceeding.
 *   2. Defensive read: read the target contract's public state for the
 *      setter that failed. If already set, the "failed" tx was actually
 *      mined (ghost-tx); skip it on resume. If zero, the setter truly
 *      never ran; include it in the resume batch.
 *
 * First use: Sprint J4 Block 11 (2026-04-24) — drpc.org 500 on setter #7
 * Voting.setDisputeContract. Ghost-tx confirmed via on-chain read.
 *
 * Historical note (2026-05-05): the VOTING / EXPECTED_DISPUTE constants
 * below are the addresses from the original 2026-04-24 V2 deploy, which
 * was deprecated in the H-1 redeploy per ADR-042 (see
 * docs/DEPLOYMENTS_HISTORY.md). They are kept as a working example;
 * future operators invoking this template must replace them with the
 * addresses involved in the specific incident under diagnosis (read
 * from packages/contracts/deployments/celo-sepolia-v2.json contracts.*
 * for the current active deploy).
 *
 * Usage:
 *   npx hardhat run scripts/check-resume-state.ts --network celoSepolia
 *
 * Adapt the hardcoded VOTING / EXPECTED_DISPUTE constants and the target
 * getter call in main() for the specific setter you need to diagnose.
 */
import "dotenv/config";
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

// Historical example values from the J4 Block 11 incident on the
// pre-H-1 deploy (deprecated 2026-05-05 per ADR-042). Replace before
// running for any current incident.
const VOTING = "0x335ac0998667f76fe265bc28e6989dc535a901e7" as const;
const EXPECTED_DISPUTE = "0x863f0bbc8d5873fe49f6429a8455236fe51a9abe" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY missing");
  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, "")}`);

  const client = createPublicClient({
    chain: celoSepolia,
    transport: http(RPC_URL),
  });

  console.log("=== Resume State Check ===");
  console.log(`Deployer: ${account.address}\n`);

  // Nonce check
  const pending = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
  const latest = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
  console.log(`Nonce latest:  ${latest}`);
  console.log(`Nonce pending: ${pending}`);
  console.log(`Gap:           ${pending - latest}`);
  if (pending === latest) {
    console.log("  → OK, no stuck tx. Safe to continue.");
  } else {
    console.log(`  → WARNING: ${pending - latest} tx stuck in mempool. Wait 5 min and recheck.`);
  }
  console.log("");

  // Read voting.disputeContract()
  const votingDispute = (await client.readContract({
    address: VOTING,
    abi: [
      {
        inputs: [],
        name: "disputeContract",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "disputeContract",
  })) as `0x${string}`;

  console.log(`Voting.disputeContract() = ${votingDispute}`);
  console.log(`Expected Dispute address = ${EXPECTED_DISPUTE}`);
  if (votingDispute.toLowerCase() === ZERO) {
    console.log("  → Setter #7 NEVER executed. Include in resume list (11 remaining).");
  } else if (votingDispute.toLowerCase() === EXPECTED_DISPUTE.toLowerCase()) {
    console.log("  → Setter #7 DID execute (ghost tx succeeded). Skip #7, resume from #8 (10 remaining).");
  } else {
    console.log(`  → UNEXPECTED value! Neither zero nor Dispute address. STOP.`);
  }

  // Balance for sanity
  const balance = await client.getBalance({ address: account.address });
  console.log(`\nDeployer CELO balance: ${Number(balance) / 1e18}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
