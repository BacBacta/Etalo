import { parseUnits } from "viem";

export const USDT_DECIMALS = 6;
export const toUSDT = (amount: number) => parseUnits(amount.toString(), USDT_DECIMALS);

export async function deployReputation(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, buyer, seller, mediator] = walletClients;

  const reputation = await viem.deployContract("EtaloReputation");

  return { reputation, deployer, buyer, seller, mediator, publicClient };
}

export async function deployStake(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, buyer, seller, mediator, fakeDispute, fakeEscrow, communityFund] =
    walletClients;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const reputation = await viem.deployContract("EtaloReputation");
  const stake = await viem.deployContract("EtaloStake", [mockUSDT.address]);

  await stake.write.setReputationContract([reputation.address]);
  await stake.write.setDisputeContract([fakeDispute.account.address]);
  await stake.write.setEscrowContract([fakeEscrow.account.address]);
  await stake.write.setCommunityFund([communityFund.account.address]);

  // Mint 1000 USDT to seller and approve stake for the max
  await mockUSDT.write.mint([seller.account.address, toUSDT(1000)]);
  await mockUSDT.write.approve([stake.address, toUSDT(1000)], {
    account: seller.account,
  });

  return {
    deployer,
    buyer,
    seller,
    mediator,
    fakeDispute,
    fakeEscrow,
    communityFund,
    publicClient,
    mockUSDT,
    reputation,
    stake,
  };
}

export async function grantTopSeller(reputation: any, seller: any) {
  for (let i = 0; i < 50; i++) {
    await reputation.write.recordCompletedOrder([
      seller.account.address,
      BigInt(i),
      toUSDT(50),
    ]);
  }
  await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
}

export async function reachTier2Eligibility(
  reputation: any,
  seller: any,
  publicClient: any
) {
  for (let i = 0; i < 20; i++) {
    await reputation.write.recordCompletedOrder([
      seller.account.address,
      BigInt(i),
      toUSDT(50),
    ]);
  }
  await increaseTime(publicClient, 60 * 24 * 3600 + 1);
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
