import { parseUnits } from "viem";

export const USDT_DECIMALS = 6;
export const toUSDT = (amount: number) => parseUnits(amount.toString(), USDT_DECIMALS);
export const INITIAL_MINT = toUSDT(10_000); // 10,000 USDT

export async function deployAll(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, buyer, seller, mediator, treasury] = walletClients;

  // Deploy MockUSDT
  const mockUSDT = await viem.deployContract("MockUSDT");

  // Deploy Reputation
  const reputation = await viem.deployContract("EtaloReputation");

  // Deploy Escrow
  const escrow = await viem.deployContract("EtaloEscrow", [
    mockUSDT.address,
    treasury.account.address,
    reputation.address,
  ]);

  // Deploy Dispute
  const dispute = await viem.deployContract("EtaloDispute", [
    escrow.address,
    reputation.address,
  ]);

  // Link contracts
  await escrow.write.setDisputeContract([dispute.address]);
  await reputation.write.setAuthorizedCaller([escrow.address, true]);
  await reputation.write.setAuthorizedCaller([dispute.address, true]);

  // Mint USDT to buyer
  await mockUSDT.write.mint([buyer.account.address, INITIAL_MINT]);

  // Buyer approves escrow for all minted amount
  await mockUSDT.write.approve([escrow.address, INITIAL_MINT], {
    account: buyer.account,
  });

  return {
    mockUSDT,
    reputation,
    escrow,
    dispute,
    deployer,
    buyer,
    seller,
    mediator,
    treasury,
    publicClient,
  };
}

export async function increaseTime(publicClient: any, seconds: number) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  } as any);
  await publicClient.request({ method: "evm_mine", params: [] } as any);
}

export async function expectRevert(promise: Promise<any>, message?: string) {
  try {
    await promise;
    throw new Error("__EXPECTED_REVERT__");
  } catch (error: any) {
    if (error.message === "__EXPECTED_REVERT__") {
      throw new Error(`Expected transaction to revert${message ? ` with "${message}"` : ""}`);
    }
    if (message) {
      const errorStr = error.message || error.toString();
      if (!errorStr.includes(message)) {
        throw new Error(`Expected revert with "${message}" but got: ${errorStr.slice(0, 200)}`);
      }
    }
  }
}
