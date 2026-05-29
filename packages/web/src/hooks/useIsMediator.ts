/**
 * useIsMediator — on-chain check `EtaloDispute.isMediatorApproved(addr)`.
 *
 * Used by the wallet-gated `/mediator` route to decide between the
 * console, a "not a mediator" state, and the connect prompt. On-chain
 * read is the authoritative source — the mirror is just a convenience
 * for listing.
 */
"use client";

import { useReadContract } from "wagmi";

import disputeAbi from "@/abis/v2/EtaloDispute.json";

export function useIsMediator(address: string | undefined) {
  const disputeAddress = process.env.NEXT_PUBLIC_DISPUTE_ADDRESS as
    | `0x${string}`
    | undefined;

  return useReadContract({
    address: disputeAddress,
    abi: disputeAbi as readonly unknown[],
    functionName: "isMediatorApproved",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address && !!disputeAddress },
  });
}
