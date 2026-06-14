import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";
import { toUSDT, expectRevert } from "./helpers/fixtures.js";

const CREATION_FEE = 1_000_000n; // 1 USDT (6 decimals)

async function deployBilling(viem: any) {
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [deployer, seller, seller2, commissionTreasury, , attacker] = wallets;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const billing = await viem.deployContract("EtaloBoutiqueBilling", [
    mockUSDT.address,
    commissionTreasury.account.address,
    deployer.account.address,
  ]);

  await mockUSDT.write.mint([seller.account.address, toUSDT(1000)]);
  await mockUSDT.write.mint([seller2.account.address, toUSDT(1000)]);
  await mockUSDT.write.approve([billing.address, toUSDT(1000)], {
    account: seller.account,
  });
  await mockUSDT.write.approve([billing.address, toUSDT(1000)], {
    account: seller2.account,
  });

  return {
    deployer,
    seller,
    seller2,
    commissionTreasury,
    attacker,
    publicClient,
    mockUSDT,
    billing,
  };
}

describe("EtaloBoutiqueBilling", async function () {
  const { viem } = await network.create();

  // ── Constructor & state ────────────────────────────────────
  describe("constructor & state", function () {
    it("should set usdt, commissionTreasury, owner correctly", async function () {
      const { billing, mockUSDT, commissionTreasury, deployer } =
        await deployBilling(viem);
      assert.equal(
        getAddress(await billing.read.usdt()),
        getAddress(mockUSDT.address)
      );
      assert.equal(
        getAddress(await billing.read.commissionTreasury()),
        getAddress(commissionTreasury.account.address)
      );
      assert.equal(
        getAddress(await billing.read.owner()),
        getAddress(deployer.account.address)
      );
    });

    it("should expose CREATION_FEE == 1_000_000 (1 USDT)", async function () {
      const { billing } = await deployBilling(viem);
      assert.equal(await billing.read.CREATION_FEE(), CREATION_FEE);
    });

    it("should revert when deployed with zero USDT address", async function () {
      const wallets = await viem.getWalletClients();
      const [deployer, , , commissionTreasury] = wallets;
      await expectRevert(
        viem.deployContract("EtaloBoutiqueBilling", [
          zeroAddress,
          commissionTreasury.account.address,
          deployer.account.address,
        ]),
        "Zero USDT address"
      );
    });

    it("should revert when deployed with zero treasury address", async function () {
      const wallets = await viem.getWalletClients();
      const [deployer] = wallets;
      const mockUSDT = await viem.deployContract("MockUSDT");
      await expectRevert(
        viem.deployContract("EtaloBoutiqueBilling", [
          mockUSDT.address,
          zeroAddress,
          deployer.account.address,
        ]),
        "Zero treasury address"
      );
    });
  });

  // ── payCreationFee — happy paths ───────────────────────────
  describe("payCreationFee — happy paths", function () {
    it("should transfer exactly 1 USDT to the commission treasury", async function () {
      const { billing, mockUSDT, seller, commissionTreasury } =
        await deployBilling(viem);

      const before = await mockUSDT.read.balanceOf([
        commissionTreasury.account.address,
      ]);
      await billing.write.payCreationFee({ account: seller.account });
      const after = await mockUSDT.read.balanceOf([
        commissionTreasury.account.address,
      ]);

      assert.equal(after - before, CREATION_FEE);
    });

    it("should flip creationPaid to true for the payer", async function () {
      const { billing, seller } = await deployBilling(viem);
      assert.equal(await billing.read.creationPaid([seller.account.address]), false);
      await billing.write.payCreationFee({ account: seller.account });
      assert.equal(await billing.read.creationPaid([seller.account.address]), true);
    });

    it("should emit CreationFeePaid with correct args", async function () {
      const { billing, seller, publicClient } = await deployBilling(viem);
      const txHash = await billing.write.payCreationFee({
        account: seller.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await billing.getEvents.CreationFeePaid();
      assert.equal(events.length, 1);
      const ev = events[0];
      assert.equal(
        getAddress(ev.args.seller!),
        getAddress(seller.account.address)
      );
      assert.ok((ev.args.timestamp ?? 0n) > 0n);
    });

    it("should track different sellers separately", async function () {
      const { billing, seller, seller2, publicClient } = await deployBilling(
        viem
      );
      const tx1 = await billing.write.payCreationFee({
        account: seller.account,
      });
      const tx2 = await billing.write.payCreationFee({
        account: seller2.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx1 });
      await publicClient.waitForTransactionReceipt({ hash: tx2 });

      assert.equal(await billing.read.creationPaid([seller.account.address]), true);
      assert.equal(await billing.read.creationPaid([seller2.account.address]), true);

      const events = await billing.getEvents.CreationFeePaid({}, { fromBlock: 0n });
      assert.equal(events.length, 2);
    });
  });

  // ── payCreationFee — edge cases ─────────────────────────────
  describe("payCreationFee — edge cases", function () {
    it("should revert on a second payment by the same wallet (one-shot)", async function () {
      const { billing, seller } = await deployBilling(viem);
      await billing.write.payCreationFee({ account: seller.account });
      await expectRevert(
        billing.write.payCreationFee({ account: seller.account }),
        "Already paid"
      );
    });

    it("should not charge a second fee when the second call reverts", async function () {
      const { billing, mockUSDT, seller, commissionTreasury } =
        await deployBilling(viem);
      await billing.write.payCreationFee({ account: seller.account });
      const balAfterFirst = await mockUSDT.read.balanceOf([
        commissionTreasury.account.address,
      ]);
      await expectRevert(
        billing.write.payCreationFee({ account: seller.account }),
        "Already paid"
      );
      assert.equal(
        await mockUSDT.read.balanceOf([commissionTreasury.account.address]),
        balAfterFirst
      );
    });

    it("should revert when payer has no allowance", async function () {
      const { billing, mockUSDT, seller } = await deployBilling(viem);
      await mockUSDT.write.approve([billing.address, 0n], {
        account: seller.account,
      });
      await expectRevert(
        billing.write.payCreationFee({ account: seller.account }),
        "InsufficientAllowance"
      );
    });

    it("should revert when payer has insufficient balance", async function () {
      const { billing, mockUSDT, attacker } = await deployBilling(viem);
      // attacker has 0 USDT but approves a huge allowance
      await mockUSDT.write.approve([billing.address, toUSDT(10_000)], {
        account: attacker.account,
      });
      await expectRevert(
        billing.write.payCreationFee({ account: attacker.account }),
        "InsufficientBalance"
      );
    });
  });

  // ── pause / unpause ────────────────────────────────────────
  describe("pause / unpause", function () {
    it("should let owner pause", async function () {
      const { billing } = await deployBilling(viem);
      await billing.write.pause();
      assert.equal(await billing.read.paused(), true);
    });

    it("should reject non-owner pause attempt", async function () {
      const { billing, seller } = await deployBilling(viem);
      await expectRevert(
        billing.write.pause({ account: seller.account }),
        "OwnableUnauthorizedAccount"
      );
    });

    it("should block payments while paused", async function () {
      const { billing, seller } = await deployBilling(viem);
      await billing.write.pause();
      await expectRevert(
        billing.write.payCreationFee({ account: seller.account }),
        "EnforcedPause"
      );
    });

    it("should resume payments after unpause", async function () {
      const { billing, mockUSDT, seller, commissionTreasury } =
        await deployBilling(viem);
      await billing.write.pause();
      await billing.write.unpause();
      await billing.write.payCreationFee({ account: seller.account });
      assert.equal(
        await mockUSDT.read.balanceOf([commissionTreasury.account.address]),
        CREATION_FEE
      );
    });

    it("should reject non-owner unpause attempt", async function () {
      const { billing, seller } = await deployBilling(viem);
      await billing.write.pause();
      await expectRevert(
        billing.write.unpause({ account: seller.account }),
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ── bytecode size sanity ───────────────────────────────────
  describe("bytecode size", function () {
    it("should compile to under the 24,576-byte EVM limit", async function () {
      const artifact = await import(
        "../artifacts/contracts/EtaloBoutiqueBilling.sol/EtaloBoutiqueBilling.json",
        { with: { type: "json" } }
      );
      const deployedBytecode: string =
        (artifact as any).default.deployedBytecode ??
        (artifact as any).deployedBytecode;
      const sizeBytes = (deployedBytecode.length - 2) / 2;
      assert.ok(
        sizeBytes < 24_576,
        `EtaloBoutiqueBilling deployed bytecode is ${sizeBytes} bytes (>= 24,576)`
      );
    });
  });
});
