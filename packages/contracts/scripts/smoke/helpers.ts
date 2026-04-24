/**
 * smoke/helpers.ts — Shared utilities for Block 12 smoke test scenarios.
 *
 * Exports:
 *   - celoSepolia + RPC_URL + safeRpcUrl (log-redacted)
 *   - loadDeployments    — read deployment JSON + return typed addresses
 *   - loadTestWallets    — parse .env + create 5 Account objects
 *   - snapshotBalances   — map<name,address> → map<name, USDT balance>
 *   - computeBalanceDiffs — after − before
 *   - sendTxWithEstimate — estimateContractGas × 1.3, legacy tx, wait+throw
 *   - assertOrThrow      — structured assertion with actual/expected context
 *   - saveScenarioResult — JSON artifact (bigint-safe)
 *   - captureEventFromReceipt / captureAllEventsFromReceipt — typed event decode
 *   - verifyAllEventsEmitted — returns emitted+missing lists
 *   - USDT/usdt/fromUsdt — 6-decimal helpers
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  parseAbi,
  type Abi,
  type Account,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Chain + RPC (with log-safe redaction for API keys)
// ============================================================
export const RPC_URL = process.env.CELO_SEPOLIA_RPC ?? "https://celo-sepolia.drpc.org";

export function safeRpcUrl(): string {
  return RPC_URL.replace(/\/v2\/[^/?]+/, "/v2/<redacted>");
}

export const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

export const transport = http(RPC_URL);

// ============================================================
// Shared minimal ABIs
// ============================================================
export const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// ============================================================
// .env parser (no dotenv-package override — we read the file
// directly for PK values because the loaded process.env may
// already be populated and we want a strict read)
// ============================================================
function parseEnvFile(): Record<string, string> {
  const content = fs.readFileSync(".env", "utf8");
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ============================================================
// 1. loadDeployments
// ============================================================
export type Addresses = {
  usdt: `0x${string}`;
  reputation: `0x${string}`;
  stake: `0x${string}`;
  voting: `0x${string}`;
  dispute: `0x${string}`;
  escrow: `0x${string}`;
  commissionTreasury: `0x${string}`;
  creditsTreasury: `0x${string}`;
  communityFund: `0x${string}`;
};

export type Deployments = {
  chainId: number;
  deployer: `0x${string}`;
  addresses: Addresses;
};

export function loadDeployments(_network: string = "celoSepolia"): Deployments {
  // network arg reserved for multi-chain support; we hardcode the file
  // name for now since only celoSepolia is deployed.
  const file = path.join("deployments", "celo-sepolia-v2.json");
  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    chainId: dep.chainId,
    deployer: getAddress(dep.deployer),
    addresses: {
      usdt: getAddress(dep.contracts.MockUSDT.address),
      reputation: getAddress(dep.contracts.EtaloReputation.address),
      stake: getAddress(dep.contracts.EtaloStake.address),
      voting: getAddress(dep.contracts.EtaloVoting.address),
      dispute: getAddress(dep.contracts.EtaloDispute.address),
      escrow: getAddress(dep.contracts.EtaloEscrow.address),
      commissionTreasury: getAddress(dep.treasuries.commission),
      creditsTreasury: getAddress(dep.treasuries.credits),
      communityFund: getAddress(dep.treasuries.community),
    },
  };
}

// ============================================================
// 2. loadTestWallets
// ============================================================
export type TestWallets = {
  deployer: Account;
  chioma: Account;
  aissa: Account;
  mamadou: Account;
  mediator1: Account;
};

export function loadTestWallets(): TestWallets {
  const env = parseEnvFile();
  function acc(key: string): Account {
    const pk = env[key];
    if (!pk) throw new Error(`Missing ${key} in .env`);
    return privateKeyToAccount(`0x${pk.replace(/^0x/, "")}` as `0x${string}`);
  }
  return {
    deployer: acc("PRIVATE_KEY"),
    chioma: acc("TEST_CHIOMA_PK"),
    aissa: acc("TEST_AISSA_PK"),
    mamadou: acc("TEST_MAMADOU_PK"),
    mediator1: acc("TEST_MEDIATOR1_PK"),
  };
}

// ============================================================
// Client factories
// ============================================================
export function makePublicClient(): PublicClient {
  return createPublicClient({ chain: celoSepolia, transport });
}

export function makeWalletClient(account: Account): WalletClient {
  return createWalletClient({ account, chain: celoSepolia, transport });
}

// ============================================================
// 3. snapshotBalances — reads USDT balance for each named address
// ============================================================
export async function snapshotBalances(
  pub: PublicClient,
  addresses: Record<string, `0x${string}`>,
  tokenAddr: `0x${string}`,
): Promise<Record<string, bigint>> {
  const out: Record<string, bigint> = {};
  for (const [name, addr] of Object.entries(addresses)) {
    out[name] = (await pub.readContract({
      address: tokenAddr, abi: erc20Abi, functionName: "balanceOf", args: [addr],
    })) as bigint;
  }
  return out;
}

// ============================================================
// 4. computeBalanceDiffs
// ============================================================
export function computeBalanceDiffs(
  before: Record<string, bigint>,
  after: Record<string, bigint>,
): Record<string, bigint> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Record<string, bigint> = {};
  for (const k of keys) {
    out[k] = (after[k] ?? 0n) - (before[k] ?? 0n);
  }
  return out;
}

// ============================================================
// 5. sendTxWithEstimate
// ============================================================
export async function sendTxWithEstimate(
  pub: PublicClient,
  wallet: WalletClient,
  contractAddr: `0x${string}`,
  abi: Abi,
  fnName: string,
  args: unknown[],
  label?: string,
): Promise<{ hash: `0x${string}`; receipt: TransactionReceipt; gasUsed: bigint }> {
  const name = label ?? fnName;
  const gasPrice = await pub.getGasPrice();
  const account = wallet.account!;
  const est = await pub.estimateContractGas({
    address: contractAddr, abi, functionName: fnName, args, account,
  });
  const gas = (est * 130n) / 100n;
  const hash = await wallet.writeContract({
    address: contractAddr, abi, functionName: fnName, args,
    type: "legacy" as any, gasPrice, gas,
  } as any);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${name} reverted (${hash})`);
  }
  console.log(`  [OK] ${name}  tx=${hash}  gasUsed=${receipt.gasUsed}`);
  return { hash, receipt, gasUsed: receipt.gasUsed };
}

// ============================================================
// 6. assertOrThrow
// ============================================================
export function assertOrThrow(
  cond: boolean,
  msg: string,
  context?: { actual?: unknown; expected?: unknown },
): void {
  if (cond) return;
  let suffix = "";
  if (context) {
    if (context.expected !== undefined) suffix += ` expected=${context.expected}`;
    if (context.actual !== undefined) suffix += ` actual=${context.actual}`;
  }
  throw new Error(`Assertion failed: ${msg}${suffix}`);
}

// ============================================================
// 7. saveScenarioResult
// ============================================================
export function saveScenarioResult(scenarioName: string, data: any): string {
  const file = path.join("scripts", "smoke", `${scenarioName}-result.json`);
  // bigint-safe serializer
  const safe = JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  fs.writeFileSync(file, JSON.stringify(safe, null, 2));
  return file;
}

// ============================================================
// 8. captureEventFromReceipt (singular + plural)
// ============================================================
export function captureEventFromReceipt<T = any>(
  receipt: TransactionReceipt,
  eventName: string,
  abi: Abi,
): T | null {
  for (const log of receipt.logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (d.eventName === eventName) return d.args as T;
    } catch { /* log not from this ABI */ }
  }
  return null;
}

export function captureAllEventsFromReceipt<T = any>(
  receipt: TransactionReceipt,
  eventName: string,
  abi: Abi,
): T[] {
  const out: T[] = [];
  for (const log of receipt.logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (d.eventName === eventName) out.push(d.args as T);
    } catch { /* */ }
  }
  return out;
}

// ============================================================
// 9. verifyAllEventsEmitted
// ============================================================
export function verifyAllEventsEmitted(
  receipt: TransactionReceipt,
  expectedEvents: string[],
  abi: Abi,
): { emitted: string[]; missing: string[] } {
  const seen = new Set<string>();
  for (const log of receipt.logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      seen.add(d.eventName);
    } catch { /* */ }
  }
  const missing = expectedEvents.filter((e) => !seen.has(e));
  return { emitted: Array.from(seen), missing };
}

// ============================================================
// USDT helpers (6 decimals)
// ============================================================
export function usdt(v: number): bigint {
  return BigInt(Math.round(v * 1_000_000));
}
export function fromUsdt(raw: bigint): number {
  return Number(raw) / 1_000_000;
}
