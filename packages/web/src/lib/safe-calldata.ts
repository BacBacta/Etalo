/**
 * Encodes calldata for the two Safe-only EtaloDispute operations the
 * admin triage page surfaces (ADR-056).
 *
 * The admin app never *executes* these — it prepares the hex calldata
 * so a Safe signer can paste it into the Safe transaction builder
 * (Contract Interaction → Custom data) and collect signatures.
 */
import { encodeFunctionData, isAddress, type Abi } from "viem";

import disputeAbi from "@/abis/v2/EtaloDispute.json";

const DISPUTE_ABI = disputeAbi as Abi;

export function encodeAssignN2Mediator(
  disputeId: bigint,
  mediator: string,
): `0x${string}` {
  if (!isAddress(mediator)) {
    throw new Error(`Invalid mediator address: ${mediator}`);
  }
  return encodeFunctionData({
    abi: DISPUTE_ABI,
    functionName: "assignN2Mediator",
    args: [disputeId, mediator as `0x${string}`],
  });
}

export function encodeApproveMediator(
  mediator: string,
  approved: boolean,
): `0x${string}` {
  if (!isAddress(mediator)) {
    throw new Error(`Invalid mediator address: ${mediator}`);
  }
  return encodeFunctionData({
    abi: DISPUTE_ABI,
    functionName: "approveMediator",
    args: [mediator as `0x${string}`, approved],
  });
}
