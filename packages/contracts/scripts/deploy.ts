import { network } from "hardhat";

const ALREADY_DEPLOYED = {
  MockUSDT: "0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6" as `0x${string}`,
  EtaloReputation: "0xc9d3f823a4c985bd126899573864dba4a6601ef4" as `0x${string}`,
};

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const deployerAddress = deployer.account.address;

  console.log("=== Etalo Deployment (resume) ===");
  console.log(`Deployer: ${deployerAddress}`);
  const balance = await publicClient.getBalance({ address: deployerAddress });
  console.log(`Balance: ${balance} wei`);
  console.log("");

  const mockUSDTAddress = ALREADY_DEPLOYED.MockUSDT;
  const reputationAddress = ALREADY_DEPLOYED.EtaloReputation;
  console.log(`MockUSDT (existing): ${mockUSDTAddress}`);
  console.log(`EtaloReputation (existing): ${reputationAddress}`);

  // 3. Deploy EtaloEscrow
  console.log("\nDeploying EtaloEscrow...");
  try {
    const escrow = await viem.deployContract("EtaloEscrow", [
      mockUSDTAddress,
      deployerAddress,
      reputationAddress,
    ]);
    console.log(`  EtaloEscrow: ${escrow.address}`);

    // 4. Deploy EtaloDispute
    console.log("Deploying EtaloDispute...");
    const dispute = await viem.deployContract("EtaloDispute", [
      escrow.address,
      reputationAddress,
    ]);
    console.log(`  EtaloDispute: ${dispute.address}`);

    // Link contracts
    console.log("\nLinking contracts...");

    const hash1 = await escrow.write.setDisputeContract([dispute.address]);
    console.log(`  Escrow -> Dispute: tx ${hash1}`);

    const reputation = await viem.getContractAt("EtaloReputation", reputationAddress);
    const hash2 = await reputation.write.setAuthorizedCaller([escrow.address, true]);
    console.log(`  Reputation -> Escrow authorized: tx ${hash2}`);

    const hash3 = await reputation.write.setAuthorizedCaller([dispute.address, true]);
    console.log(`  Reputation -> Dispute authorized: tx ${hash3}`);

    // Summary
    console.log("\n=== Deployment Complete ===");
    console.log(JSON.stringify({
      network: "celoSepolia",
      chainId: 11142220,
      deployer: deployerAddress,
      treasury: deployerAddress,
      contracts: {
        MockUSDT: mockUSDTAddress,
        EtaloReputation: reputationAddress,
        EtaloEscrow: escrow.address,
        EtaloDispute: dispute.address,
      },
      deployedAt: new Date().toISOString(),
    }, null, 2));
  } catch (error: any) {
    console.error("\n=== Deployment Error ===");
    console.error("Message:", error.message?.slice(0, 500));
    if (error.cause) console.error("Cause:", error.cause);
    if (error.details) console.error("Details:", error.details);
    process.exitCode = 1;
  }
}

main();
