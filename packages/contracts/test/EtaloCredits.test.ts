import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";
import { toUSDT, expectRevert } from "./helpers/fixtures.js";

const USDT_PER_CREDIT = 150_000n;

async function deployCredits(viem: any) {
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [deployer, buyer, buyer2, creditsTreasury, oracle, attacker] = wallets;

  const mockUSDT = await viem.deployContract("MockUSDT");
  const credits = await viem.deployContract("EtaloCredits", [
    mockUSDT.address,
    creditsTreasury.account.address,
    deployer.account.address,
  ]);

  await mockUSDT.write.mint([buyer.account.address, toUSDT(1000)]);
  await mockUSDT.write.mint([buyer2.account.address, toUSDT(1000)]);
  await mockUSDT.write.approve([credits.address, toUSDT(1000)], {
    account: buyer.account,
  });
  await mockUSDT.write.approve([credits.address, toUSDT(1000)], {
    account: buyer2.account,
  });

  return {
    deployer,
    buyer,
    buyer2,
    creditsTreasury,
    oracle,
    attacker,
    publicClient,
    mockUSDT,
    credits,
  };
}

describe("EtaloCredits", async function () {
  const { viem } = await network.create();

  // ── Constructor & state ────────────────────────────────────
  describe("constructor & state", function () {
    it("should set usdt, creditsTreasury, owner correctly", async function () {
      const { credits, mockUSDT, creditsTreasury, deployer } =
        await deployCredits(viem);
      assert.equal(
        getAddress(await credits.read.usdt()),
        getAddress(mockUSDT.address)
      );
      assert.equal(
        getAddress(await credits.read.creditsTreasury()),
        getAddress(creditsTreasury.account.address)
      );
      assert.equal(
        getAddress(await credits.read.owner()),
        getAddress(deployer.account.address)
      );
    });

    it("should expose USDT_PER_CREDIT == 150_000", async function () {
      const { credits } = await deployCredits(viem);
      assert.equal(await credits.read.USDT_PER_CREDIT(), USDT_PER_CREDIT);
    });

    it("should revert when deployed with zero USDT address", async function () {
      const wallets = await viem.getWalletClients();
      const [deployer, , , creditsTreasury] = wallets;
      await expectRevert(
        viem.deployContract("EtaloCredits", [
          zeroAddress,
          creditsTreasury.account.address,
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
        viem.deployContract("EtaloCredits", [
          mockUSDT.address,
          zeroAddress,
          deployer.account.address,
        ]),
        "Zero treasury address"
      );
    });
  });

  // ── purchaseCredits — happy paths ──────────────────────────
  describe("purchaseCredits — happy paths", function () {
    it("should purchase 1 credit and transfer 150_000 USDT raw to treasury", async function () {
      const { credits, mockUSDT, buyer, creditsTreasury } =
        await deployCredits(viem);

      const beforeBalance = await mockUSDT.read.balanceOf([
        creditsTreasury.account.address,
      ]);
      await credits.write.purchaseCredits([1n], { account: buyer.account });
      const afterBalance = await mockUSDT.read.balanceOf([
        creditsTreasury.account.address,
      ]);

      assert.equal(afterBalance - beforeBalance, USDT_PER_CREDIT);
    });

    it("should purchase 100 credits and transfer 15 USDT total", async function () {
      const { credits, mockUSDT, buyer, creditsTreasury } =
        await deployCredits(viem);
      await credits.write.purchaseCredits([100n], { account: buyer.account });
      assert.equal(
        await mockUSDT.read.balanceOf([creditsTreasury.account.address]),
        100n * USDT_PER_CREDIT
      );
    });

    it("should purchase 1000 credits and transfer 150 USDT total", async function () {
      const { credits, mockUSDT, buyer, creditsTreasury } =
        await deployCredits(viem);
      await credits.write.purchaseCredits([1000n], { account: buyer.account });
      assert.equal(
        await mockUSDT.read.balanceOf([creditsTreasury.account.address]),
        1000n * USDT_PER_CREDIT
      );
    });

    it("should emit CreditsPurchased with correct args", async function () {
      const { credits, buyer, publicClient } = await deployCredits(viem);
      const txHash = await credits.write.purchaseCredits([42n], {
        account: buyer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await credits.getEvents.CreditsPurchased();
      assert.equal(events.length, 1);
      const ev = events[0];
      assert.equal(
        getAddress(ev.args.buyer!),
        getAddress(buyer.account.address)
      );
      assert.equal(ev.args.creditAmount, 42n);
      assert.equal(ev.args.usdtAmount, 42n * USDT_PER_CREDIT);
      // timestamp non-zero (block.timestamp at execution)
      assert.ok((ev.args.timestamp ?? 0n) > 0n);
    });
  });

  // ── purchaseCredits — edge cases ────────────────────────────
  describe("purchaseCredits — edge cases", function () {
    it("should revert when creditAmount == 0", async function () {
      const { credits, buyer } = await deployCredits(viem);
      await expectRevert(
        credits.write.purchaseCredits([0n], { account: buyer.account }),
        "Zero credits"
      );
    });

    it("should revert when buyer has no allowance", async function () {
      const { credits, mockUSDT, buyer } = await deployCredits(viem);
      // Reset allowance to 0
      await mockUSDT.write.approve([credits.address, 0n], {
        account: buyer.account,
      });
      await expectRevert(
        credits.write.purchaseCredits([1n], { account: buyer.account }),
        "InsufficientAllowance"
      );
    });

    it("should revert when buyer has insufficient balance", async function () {
      const { credits, mockUSDT, attacker } = await deployCredits(viem);
      // attacker has 0 USDT but approves a huge allowance
      await mockUSDT.write.approve([credits.address, toUSDT(10_000)], {
        account: attacker.account,
      });
      await expectRevert(
        credits.write.purchaseCredits([1n], { account: attacker.account }),
        "InsufficientBalance"
      );
    });

    it("should accumulate sequential purchases by the same buyer", async function () {
      const { credits, mockUSDT, buyer, creditsTreasury } =
        await deployCredits(viem);
      await credits.write.purchaseCredits([10n], { account: buyer.account });
      await credits.write.purchaseCredits([20n], { account: buyer.account });
      await credits.write.purchaseCredits([5n], { account: buyer.account });
      assert.equal(
        await mockUSDT.read.balanceOf([creditsTreasury.account.address]),
        35n * USDT_PER_CREDIT
      );
    });

    it("should track different buyers separately via events", async function () {
      const { credits, buyer, buyer2, publicClient } = await deployCredits(
        viem
      );
      const tx1 = await credits.write.purchaseCredits([7n], {
        account: buyer.account,
      });
      const tx2 = await credits.write.purchaseCredits([13n], {
        account: buyer2.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx1 });
      await publicClient.waitForTransactionReceipt({ hash: tx2 });

      // Default fromBlock on viem v2 getEvents.X is "latest" — only the
      // most recent block's events come back. Span from genesis to pick
      // up both purchases.
      const events = await credits.getEvents.CreditsPurchased(
        {},
        { fromBlock: 0n }
      );
      assert.equal(events.length, 2);
      const byBuyer = new Map(
        events.map((e: any) => [
          getAddress(e.args.buyer!),
          e.args.creditAmount,
        ])
      );
      assert.equal(byBuyer.get(getAddress(buyer.account.address)), 7n);
      assert.equal(byBuyer.get(getAddress(buyer2.account.address)), 13n);
    });
  });

  // ── pause / unpause ────────────────────────────────────────
  describe("pause / unpause", function () {
    it("should let owner pause", async function () {
      const { credits } = await deployCredits(viem);
      await credits.write.pause();
      assert.equal(await credits.read.paused(), true);
    });

    it("should reject non-owner pause attempt", async function () {
      const { credits, buyer } = await deployCredits(viem);
      await expectRevert(
        credits.write.pause({ account: buyer.account }),
        "OwnableUnauthorizedAccount"
      );
    });

    it("should block purchases while paused", async function () {
      const { credits, buyer } = await deployCredits(viem);
      await credits.write.pause();
      await expectRevert(
        credits.write.purchaseCredits([1n], { account: buyer.account }),
        "EnforcedPause"
      );
    });

    it("should resume purchases after unpause", async function () {
      const { credits, mockUSDT, buyer, creditsTreasury } =
        await deployCredits(viem);
      await credits.write.pause();
      await credits.write.unpause();
      await credits.write.purchaseCredits([3n], { account: buyer.account });
      assert.equal(
        await mockUSDT.read.balanceOf([creditsTreasury.account.address]),
        3n * USDT_PER_CREDIT
      );
    });

    it("should reject non-owner unpause attempt", async function () {
      const { credits, buyer } = await deployCredits(viem);
      await credits.write.pause();
      await expectRevert(
        credits.write.unpause({ account: buyer.account }),
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ── backend oracle setter ──────────────────────────────────
  describe("setBackendOracle", function () {
    it("should set the backend oracle address", async function () {
      const { credits, oracle } = await deployCredits(viem);
      await credits.write.setBackendOracle([oracle.account.address]);
      assert.equal(
        getAddress(await credits.read.backendOracle()),
        getAddress(oracle.account.address)
      );
    });

    it("should reject non-owner setBackendOracle", async function () {
      const { credits, buyer, oracle } = await deployCredits(viem);
      await expectRevert(
        credits.write.setBackendOracle([oracle.account.address], {
          account: buyer.account,
        }),
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert on zero oracle address", async function () {
      const { credits } = await deployCredits(viem);
      await expectRevert(
        credits.write.setBackendOracle([zeroAddress]),
        "Zero oracle"
      );
    });

    it("should emit BackendOracleSet with correct args", async function () {
      const { credits, oracle, publicClient } = await deployCredits(viem);
      const txHash = await credits.write.setBackendOracle([
        oracle.account.address,
      ]);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await credits.getEvents.BackendOracleSet();
      assert.equal(events.length, 1);
      assert.equal(
        getAddress(events[0].args.oldOracle!),
        getAddress(zeroAddress)
      );
      assert.equal(
        getAddress(events[0].args.newOracle!),
        getAddress(oracle.account.address)
      );
    });

    it("should track the previous oracle in the event on subsequent sets", async function () {
      const { credits, oracle, attacker, publicClient } = await deployCredits(
        viem
      );
      await credits.write.setBackendOracle([oracle.account.address]);
      const tx2 = await credits.write.setBackendOracle([
        attacker.account.address,
      ]);
      await publicClient.waitForTransactionReceipt({ hash: tx2 });

      const events = await credits.getEvents.BackendOracleSet();
      // 2 events on this contract instance — pick the most recent one
      const last = events[events.length - 1];
      assert.equal(
        getAddress(last.args.oldOracle!),
        getAddress(oracle.account.address)
      );
      assert.equal(
        getAddress(last.args.newOracle!),
        getAddress(attacker.account.address)
      );
    });
  });

  // ── bytecode size sanity ───────────────────────────────────
  describe("bytecode size", function () {
    it("should compile to under the 24,576-byte EVM limit", async function () {
      const artifact = await import(
        "../artifacts/contracts/EtaloCredits.sol/EtaloCredits.json",
        { with: { type: "json" } }
      );
      const deployedBytecode: string =
        (artifact as any).default.deployedBytecode ??
        (artifact as any).deployedBytecode;
      // hex string starting with 0x — divide by 2 for byte count
      const sizeBytes = (deployedBytecode.length - 2) / 2;
      assert.ok(
        sizeBytes < 24_576,
        `EtaloCredits deployed bytecode is ${sizeBytes} bytes (>= 24,576)`
      );
    });
  });
});
