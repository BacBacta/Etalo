import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployAll, toUSDT, expectRevert } from "./helpers/fixtures.js";

describe("EtaloReputation", async function () {
  const { viem } = await network.create();

  // ── Record Orders ─────────────────────────────────────────
  describe("recordCompletedOrder", function () {
    it("should increment ordersCompleted and totalVolume", async function () {
      const { reputation, escrow, seller } = await deployAll(viem);
      // escrow is an authorized caller (set in fixture)
      await reputation.write.recordCompletedOrder(
        [seller.account.address, 0n, toUSDT(100)],
        { account: (await viem.getWalletClients())[0].account } // deployer calls via owner (authorized)
      );

      // Actually escrow is authorized, but we're calling directly from deployer who is owner
      // owner passes onlyAuthorized modifier
      const rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersCompleted, 1n);
      assert.equal(rep.totalVolume, toUSDT(100));
    });

    it("should reject calls from unauthorized address", async function () {
      const { reputation, seller, buyer } = await deployAll(viem);
      await expectRevert(
        reputation.write.recordCompletedOrder(
          [seller.account.address, 0n, toUSDT(100)],
          { account: buyer.account }
        ),
        "Not authorized"
      );
    });
  });

  // ── Record Disputes ───────────────────────────────────────
  describe("recordDispute", function () {
    it("should track disputes won and lost", async function () {
      const { reputation, seller } = await deployAll(viem);

      // Record a dispute where seller lost
      await reputation.write.recordDispute([seller.account.address, 0n, true]);
      let rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersDisputed, 1n);
      assert.equal(rep.disputesLost, 1n);

      // Record a dispute where seller won
      await reputation.write.recordDispute([seller.account.address, 1n, false]);
      rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersDisputed, 2n);
      assert.equal(rep.disputesLost, 1n); // Still 1
    });
  });

  // ── Score Calculation ─────────────────────────────────────
  describe("score calculation", function () {
    it("should start at base score (50) after first order", async function () {
      const { reputation, seller } = await deployAll(viem);

      await reputation.write.recordCompletedOrder([seller.account.address, 0n, toUSDT(50)]);
      const rep = await reputation.read.getReputation([seller.account.address]);

      // Score = 50 (base) + 30 (completion: 1/1 * 30) + 0 (volume: 1/100 * 10 = 0 in int) - 0 (penalty)
      // = 80
      assert.equal(rep.score, 80n);
    });

    it("should decrease score when disputes are lost", async function () {
      const { reputation, seller } = await deployAll(viem);

      // 10 completed orders
      for (let i = 0; i < 10; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(100)]);
      }
      const repBefore = await reputation.read.getReputation([seller.account.address]);

      // Lose 2 disputes (-20 points)
      await reputation.write.recordDispute([seller.account.address, 100n, true]);
      await reputation.write.recordDispute([seller.account.address, 101n, true]);

      const repAfter = await reputation.read.getReputation([seller.account.address]);
      assert.ok(repAfter.score < repBefore.score);
      assert.equal(repAfter.disputesLost, 2n);
    });
  });

  // ── Top Seller ────────────────────────────────────────────
  describe("Top Seller logic", function () {
    it("should grant Top Seller after 20 orders with high score", async function () {
      const { reputation, seller } = await deployAll(viem);

      // Complete 20 orders (no disputes)
      for (let i = 0; i < 20; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);

      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);
    });

    it("should NOT grant Top Seller with < 20 orders", async function () {
      const { reputation, seller } = await deployAll(viem);

      for (let i = 0; i < 19; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);

      assert.equal(await reputation.read.isTopSeller([seller.account.address]), false);
    });

    it("should revoke Top Seller if score drops below threshold", async function () {
      const { reputation, seller } = await deployAll(viem);

      // Grant Top Seller
      for (let i = 0; i < 20; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);

      // Lose 4 disputes (-40 penalty) to drop score below 80
      for (let i = 0; i < 4; i++) {
        await reputation.write.recordDispute([seller.account.address, BigInt(100 + i), true]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);

      assert.equal(await reputation.read.isTopSeller([seller.account.address]), false);
    });
  });

  // ── Sanctions ─────────────────────────────────────────────
  describe("sanctions", function () {
    it("should suspend a seller and revoke Top Seller", async function () {
      const { reputation, seller } = await deployAll(viem);

      // Make Top Seller first
      for (let i = 0; i < 20; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);

      // Suspend
      await reputation.write.applySanction([seller.account.address, 1]); // Suspended
      const rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.status, 1); // Suspended
      assert.equal(rep.isTopSeller, false);
    });

    it("should reject recordCompletedOrder for suspended seller", async function () {
      const { reputation, seller } = await deployAll(viem);
      await reputation.write.applySanction([seller.account.address, 1]); // Suspended

      await expectRevert(
        reputation.write.recordCompletedOrder([seller.account.address, 0n, toUSDT(100)]),
        "Seller not active"
      );
    });

    it("should reject sanction by non-owner", async function () {
      const { reputation, seller, buyer } = await deployAll(viem);
      await expectRevert(
        reputation.write.applySanction([seller.account.address, 2], { account: buyer.account })
      );
    });
  });

  // ── Auto-Release Days ─────────────────────────────────────
  describe("getAutoReleaseDays", function () {
    it("should return 3 for normal intra seller", async function () {
      const { reputation, seller } = await deployAll(viem);
      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, false]), 3n);
    });

    it("should return 2 for Top Seller intra", async function () {
      const { reputation, seller } = await deployAll(viem);
      for (let i = 0; i < 20; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);

      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, false]), 2n);
    });

    it("should return 7 for cross-border regardless of status", async function () {
      const { reputation, seller } = await deployAll(viem);
      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, true]), 7n);
    });
  });
});
