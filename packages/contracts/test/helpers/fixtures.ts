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

export async function deployVoting(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, nonEligible, voter1, voter2, voter3] = walletClients;

  const voting = await viem.deployContract("EtaloVoting");
  const mockDispute = await viem.deployContract("MockEtaloDispute");

  await voting.write.setDisputeContract([mockDispute.address]);

  return {
    voting,
    mockDispute,
    deployer,
    nonEligible,
    voter1,
    voter2,
    voter3,
    publicClient,
  };
}

export async function deployDispute(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, buyer, seller, mediator, mediator2, nonParty] = walletClients;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const reputation = await viem.deployContract("EtaloReputation");
  const stake = await viem.deployContract("EtaloStake", [mockUSDT.address]);
  const voting = await viem.deployContract("EtaloVoting");
  const mockEscrow = await viem.deployContract("MockEtaloEscrow");
  const dispute = await viem.deployContract("EtaloDispute");

  // Wire all cross-contract refs via setters (post-deploy pattern).
  await dispute.write.setEscrow([mockEscrow.address]);
  await dispute.write.setStake([stake.address]);
  await dispute.write.setVoting([voting.address]);
  await dispute.write.setReputation([reputation.address]);

  await voting.write.setDisputeContract([dispute.address]);
  await stake.write.setDisputeContract([dispute.address]);
  await stake.write.setReputationContract([reputation.address]);
  await reputation.write.setAuthorizedCaller([dispute.address, true]);

  // Approve both mediators.
  await dispute.write.approveMediator([mediator.account.address, true]);
  await dispute.write.approveMediator([mediator2.account.address, true]);

  // Seller stakes at Tier 1 (10 USDT).
  await mockUSDT.write.mint([seller.account.address, toUSDT(100)]);
  await mockUSDT.write.approve([stake.address, toUSDT(100)], { account: seller.account });
  await stake.write.depositStake([1], { account: seller.account });

  // Configure mock order: orderId irrelevant, buyer/seller, itemPrice 50 USDT.
  await mockEscrow.write.setOrder([
    buyer.account.address,
    seller.account.address,
    toUSDT(50),
  ]);

  return {
    deployer,
    buyer,
    seller,
    mediator,
    mediator2,
    nonParty,
    publicClient,
    mockUSDT,
    reputation,
    stake,
    voting,
    mockEscrow,
    dispute,
  };
}

export async function deployEscrow(viem: any) {
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [
    deployer,
    buyer,
    seller,
    nonParty,
    commissionTreasury,
    creditsTreasury,
    communityFund,
    seller2,
    seller3,
    seller4,
  ] = wallets;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const reputation = await viem.deployContract("EtaloReputation");
  const stake = await viem.deployContract("EtaloStake", [mockUSDT.address]);
  const escrow = await viem.deployContract("EtaloEscrow", [mockUSDT.address]);

  // Wire Escrow setters
  await escrow.write.setStakeContract([stake.address]);
  await escrow.write.setReputationContract([reputation.address]);
  await escrow.write.setCommissionTreasury([commissionTreasury.account.address]);
  await escrow.write.setCreditsTreasury([creditsTreasury.account.address]);
  await escrow.write.setCommunityFund([communityFund.account.address]);

  // Wire Stake
  await stake.write.setReputationContract([reputation.address]);
  await stake.write.setEscrowContract([escrow.address]);

  // Wire Reputation (Escrow is an authorized caller for recordCompletedOrder)
  await reputation.write.setAuthorizedCaller([escrow.address, true]);

  // Seller: mint + approve Stake + deposit Tier 1 (10 USDT)
  await mockUSDT.write.mint([seller.account.address, toUSDT(100)]);
  await mockUSDT.write.approve([stake.address, toUSDT(100)], { account: seller.account });
  await stake.write.depositStake([1], { account: seller.account });

  // Buyer: mint + approve Escrow (plenty of headroom for multi-order tests)
  await mockUSDT.write.mint([buyer.account.address, toUSDT(100_000)]);
  await mockUSDT.write.approve([escrow.address, toUSDT(100_000)], { account: buyer.account });

  return {
    deployer,
    buyer,
    seller,
    nonParty,
    commissionTreasury,
    creditsTreasury,
    communityFund,
    seller2,
    seller3,
    seller4,
    publicClient,
    mockUSDT,
    reputation,
    stake,
    escrow,
  };
}

export async function deployIntegration(viem: any) {
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [
    deployer,
    buyer,
    seller,
    seller2,
    mediator,
    mediator2,
    mediator3,
    commissionTreasury,
    creditsTreasury,
    communityFund,
    nonParty,
  ] = wallets;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const reputation = await viem.deployContract("EtaloReputation");
  const stake = await viem.deployContract("EtaloStake", [mockUSDT.address]);
  const voting = await viem.deployContract("EtaloVoting");
  const dispute = await viem.deployContract("EtaloDispute");
  const escrow = await viem.deployContract("EtaloEscrow", [mockUSDT.address]);

  // Wire Escrow
  await escrow.write.setStakeContract([stake.address]);
  await escrow.write.setDisputeContract([dispute.address]);
  await escrow.write.setReputationContract([reputation.address]);
  await escrow.write.setCommissionTreasury([commissionTreasury.account.address]);
  await escrow.write.setCreditsTreasury([creditsTreasury.account.address]);
  await escrow.write.setCommunityFund([communityFund.account.address]);

  // Wire Stake
  await stake.write.setReputationContract([reputation.address]);
  await stake.write.setDisputeContract([dispute.address]);
  await stake.write.setEscrowContract([escrow.address]);
  await stake.write.setCommunityFund([communityFund.account.address]);

  // Wire Voting
  await voting.write.setDisputeContract([dispute.address]);

  // Wire Dispute (short setter names per Block 6)
  await dispute.write.setEscrow([escrow.address]);
  await dispute.write.setStake([stake.address]);
  await dispute.write.setVoting([voting.address]);
  await dispute.write.setReputation([reputation.address]);
  await dispute.write.approveMediator([mediator.account.address, true]);
  await dispute.write.approveMediator([mediator2.account.address, true]);
  await dispute.write.approveMediator([mediator3.account.address, true]);

  // Reputation authorizes both Escrow and Dispute as callers
  await reputation.write.setAuthorizedCaller([escrow.address, true]);
  await reputation.write.setAuthorizedCaller([dispute.address, true]);

  // Sellers: mint + approve Stake + deposit Tier 1
  await mockUSDT.write.mint([seller.account.address, toUSDT(500)]);
  await mockUSDT.write.approve([stake.address, toUSDT(500)], { account: seller.account });
  await stake.write.depositStake([1], { account: seller.account });

  await mockUSDT.write.mint([seller2.account.address, toUSDT(500)]);
  await mockUSDT.write.approve([stake.address, toUSDT(500)], { account: seller2.account });
  await stake.write.depositStake([1], { account: seller2.account });

  // Buyer: mint + approve Escrow (generous headroom for TVL-cap test)
  await mockUSDT.write.mint([buyer.account.address, toUSDT(200_000)]);
  await mockUSDT.write.approve([escrow.address, toUSDT(200_000)], { account: buyer.account });

  return {
    deployer,
    buyer,
    seller,
    seller2,
    mediator,
    mediator2,
    mediator3,
    commissionTreasury,
    creditsTreasury,
    communityFund,
    nonParty,
    wallets,
    publicClient,
    mockUSDT,
    reputation,
    stake,
    voting,
    dispute,
    escrow,
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
