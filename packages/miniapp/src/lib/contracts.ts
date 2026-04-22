import escrowAbi from "@/abis/EtaloEscrow.json";
import disputeAbi from "@/abis/EtaloDispute.json";
import reputationAbi from "@/abis/EtaloReputation.json";
import usdtAbi from "@/abis/MockUSDT.json";

/**
 * Etalo contract addresses on Celo Sepolia.
 *
 * On testnet we use MockUSDT (6 decimals, mintable) deployed alongside
 * the protocol contracts during J1. Mainnet will swap to real USDT
 * (0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e).
 */
export const CONTRACTS = {
  escrow: {
    address: import.meta.env.VITE_ESCROW_CONTRACT,
    abi: escrowAbi,
  },
  dispute: {
    address: import.meta.env.VITE_DISPUTE_CONTRACT,
    abi: disputeAbi,
  },
  reputation: {
    address: import.meta.env.VITE_REPUTATION_CONTRACT,
    abi: reputationAbi,
  },
  usdt: {
    address: import.meta.env.VITE_USDT_CONTRACT,
    abi: usdtAbi,
  },
} as const;

export type ContractName = keyof typeof CONTRACTS;
