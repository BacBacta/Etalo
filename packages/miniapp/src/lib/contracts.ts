import disputeAbi from "@/abis/v2/EtaloDispute.json";
import escrowAbi from "@/abis/v2/EtaloEscrow.json";
import reputationAbi from "@/abis/v2/EtaloReputation.json";
import stakeAbi from "@/abis/v2/EtaloStake.json";
import votingAbi from "@/abis/v2/EtaloVoting.json";
import usdtAbi from "@/abis/v2/MockUSDT.json";

/**
 * Etalo V2 contracts on Celo Sepolia.
 *
 * Six contracts, all behind the V2 audit-gated deploy
 * (`v2.0.0-contracts-sepolia`). USDT remains MockUSDT on testnet —
 * mainnet will swap to 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e.
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
  stake: {
    address: import.meta.env.VITE_STAKE_CONTRACT,
    abi: stakeAbi,
  },
  reputation: {
    address: import.meta.env.VITE_REPUTATION_CONTRACT,
    abi: reputationAbi,
  },
  voting: {
    address: import.meta.env.VITE_VOTING_CONTRACT,
    abi: votingAbi,
  },
  usdt: {
    address: import.meta.env.VITE_USDT_CONTRACT,
    abi: usdtAbi,
  },
} as const;

export type ContractName = keyof typeof CONTRACTS;
