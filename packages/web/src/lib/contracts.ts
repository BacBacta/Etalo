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
    address: process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
    abi: escrowAbi,
  },
  dispute: {
    address: process.env.NEXT_PUBLIC_DISPUTE_ADDRESS,
    abi: disputeAbi,
  },
  stake: {
    address: process.env.NEXT_PUBLIC_STAKE_ADDRESS,
    abi: stakeAbi,
  },
  reputation: {
    address: process.env.NEXT_PUBLIC_REPUTATION_ADDRESS,
    abi: reputationAbi,
  },
  voting: {
    address: process.env.NEXT_PUBLIC_VOTING_ADDRESS,
    abi: votingAbi,
  },
  usdt: {
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS,
    abi: usdtAbi,
  },
} as const;

export type ContractName = keyof typeof CONTRACTS;
