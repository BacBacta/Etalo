/**
 * escrow-cutover-calldata.ts — OFFLINE Safe-calldata generator for the
 * ADR-057 EtaloEscrow cutover (migration plan §3.4 Option A).
 *
 * Prints the (target, calldata) pairs the 2-of-3 Safe must execute to
 * re-point the satellites from the OLD escrow to the NEW escrow, AFTER
 * the old escrow has fully drained (escrow-drain-monitor → 0).
 *
 * Pure encoding. NO network, NO transaction. Output is pasted into the
 * Safe transaction builder by the signers.
 *
 * Env (.env):
 *   NEW_ESCROW       — required, the freshly-deployed ADR-057 escrow
 *   DISPUTE_ADDRESS  — default: mainnet v1.4 Dispute
 *   STAKE_ADDRESS    — default: mainnet v1.4 Stake (dormant in V1 intra)
 *   REPUTATION_ADDRESS — default: mainnet v1.4 Reputation
 *   OLD_ESCROW       — default: mainnet v1.4 escrow (for the de-authorize step)
 *
 * Usage:
 *   NEW_ESCROW=0x... npx tsx scripts/escrow-cutover-calldata.ts
 */
import "dotenv/config";
import { encodeFunctionData, getAddress, isAddress } from "viem";

const NEW_ESCROW = process.env.NEW_ESCROW as `0x${string}` | undefined;
const DISPUTE = (process.env.DISPUTE_ADDRESS ?? "0x6d5Aa5e0EAE407688E99492213849D9a608D63d2") as `0x${string}`;
const STAKE = (process.env.STAKE_ADDRESS ?? "0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A") as `0x${string}`;
const REPUTATION = (process.env.REPUTATION_ADDRESS ?? "0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD") as `0x${string}`;
const OLD_ESCROW = (process.env.OLD_ESCROW ?? "0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92") as `0x${string}`;

if (!NEW_ESCROW || !isAddress(NEW_ESCROW)) {
  console.error("Set NEW_ESCROW=0x... (the deployed ADR-057 escrow address)");
  process.exit(1);
}

const setEscrowAbi = [{ type: "function", name: "setEscrow", inputs: [{ type: "address" }], outputs: [], stateMutability: "nonpayable" }] as const;
const setEscrowContractAbi = [{ type: "function", name: "setEscrowContract", inputs: [{ type: "address" }], outputs: [], stateMutability: "nonpayable" }] as const;
const setAuthAbi = [{ type: "function", name: "setAuthorizedCaller", inputs: [{ type: "address" }, { type: "bool" }], outputs: [], stateMutability: "nonpayable" }] as const;

const txs = [
  {
    step: "1. Dispute → new escrow (REQUIRED — single pointer)",
    to: getAddress(DISPUTE),
    data: encodeFunctionData({ abi: setEscrowAbi, functionName: "setEscrow", args: [getAddress(NEW_ESCROW)] }),
  },
  {
    step: "2. Stake → new escrow (dormant in V1 intra, set for completeness)",
    to: getAddress(STAKE),
    data: encodeFunctionData({ abi: setEscrowContractAbi, functionName: "setEscrowContract", args: [getAddress(NEW_ESCROW)] }),
  },
  {
    step: "3. Reputation → authorize new escrow (multi-caller, additive)",
    to: getAddress(REPUTATION),
    data: encodeFunctionData({ abi: setAuthAbi, functionName: "setAuthorizedCaller", args: [getAddress(NEW_ESCROW), true] }),
  },
  {
    step: "4. (after drain fully settled) Reputation → de-authorize old escrow",
    to: getAddress(REPUTATION),
    data: encodeFunctionData({ abi: setAuthAbi, functionName: "setAuthorizedCaller", args: [getAddress(OLD_ESCROW), false] }),
  },
];

console.log(`\nSafe cutover calldata — NEW_ESCROW = ${getAddress(NEW_ESCROW)}`);
console.log("Execute via the 2-of-3 Safe, in order. value = 0 for every tx.\n");
for (const t of txs) {
  console.log(t.step);
  console.log(`   to:    ${t.to}`);
  console.log(`   value: 0`);
  console.log(`   data:  ${t.data}\n`);
}
console.log("Reminder: do steps 1-3 only after escrow-drain-monitor reports 0");
console.log("in-flight + totalEscrowedAmount == 0. Step 4 once residual reputation");
console.log("writes from the old escrow have stopped. Then swap the off-chain");
console.log("addresses (plan §5) and resume intake on the new escrow.");
