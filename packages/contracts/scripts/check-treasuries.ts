/** Read-only mainnet diagnostic: where do the fees actually land + balances. */
import { createPublicClient, http, getAddress, formatUnits } from "viem";

const RPC = process.env.CELO_RPC ?? "https://forno.celo.org";
const client = createPublicClient({
  chain: { id: 42220, name: "Celo", nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as any,
  transport: http(RPC),
});

const USDT = getAddress("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");
const SAFE = getAddress("0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F");
const CREDITS = getAddress("0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6");
const ESCROW = getAddress("0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671");
const BILLING = getAddress("0x67764186d69A9871ab4F5f3fA7Ba3d8d6dE230e7");

const treasuryAbi = [
  { type: "function", name: "creditsTreasury", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "commissionTreasury", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;
const erc20Abi = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

async function bal(addr: `0x${string}`) {
  const b = (await client.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [addr] })) as bigint;
  return `${formatUnits(b, 6)} USDT`;
}

async function main() {
  const creditsTreasury = getAddress((await client.readContract({ address: CREDITS, abi: treasuryAbi, functionName: "creditsTreasury" })) as `0x${string}`);
  const commTreasuryEscrow = getAddress((await client.readContract({ address: ESCROW, abi: treasuryAbi, functionName: "commissionTreasury" })) as `0x${string}`);
  const commTreasuryBilling = getAddress((await client.readContract({ address: BILLING, abi: treasuryAbi, functionName: "commissionTreasury" })) as `0x${string}`);

  console.log("=== On-chain treasury config (mainnet) ===");
  console.log(`EtaloCredits.creditsTreasury     = ${creditsTreasury}  ${creditsTreasury === SAFE ? "(= Safe)" : "(NOT Safe!)"}`);
  console.log(`EtaloEscrow.commissionTreasury   = ${commTreasuryEscrow}  ${commTreasuryEscrow === SAFE ? "(= Safe)" : "(NOT Safe!)"}`);
  console.log(`EtaloBoutiqueBilling.commission  = ${commTreasuryBilling}  ${commTreasuryBilling === SAFE ? "(= Safe)" : "(NOT Safe!)"}`);

  console.log("\n=== USDT balances ===");
  console.log(`Safe ${SAFE}:            ${await bal(SAFE)}`);
  console.log(`creditsTreasury ${creditsTreasury}: ${await bal(creditsTreasury)}`);
  if (commTreasuryEscrow !== creditsTreasury && commTreasuryEscrow !== SAFE)
    console.log(`commissionTreasury(escrow) ${commTreasuryEscrow}: ${await bal(commTreasuryEscrow)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
