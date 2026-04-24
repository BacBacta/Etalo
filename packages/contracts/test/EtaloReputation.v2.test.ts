import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployReputation, increaseTime, toUSDT, expectRevert } from "./helpers/fixtures.js";

describe("EtaloReputation V2", async function () {
  const { viem } = await network.create();

  // ── recordCompletedOrder ──────────────────────────────────
  describe("recordCompletedOrder", function () {
    it("should increment ordersCompleted and totalVolume", async function () {
      const { reputation, seller } = await deployReputation(viem);
      await reputation.write.recordCompletedOrder([seller.account.address, 0n, toUSDT(100)]);

      const rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersCompleted, 1n);
      assert.equal(rep.totalVolume, toUSDT(100));
    });

    it("should reject calls from unauthorized address", async function () {
      const { reputation, seller, buyer } = await deployReputation(viem);
      await expectRevert(
        reputation.write.recordCompletedOrder(
          [seller.account.address, 0n, toUSDT(100)],
          { account: buyer.account }
        ),
        "Not authorized"
      );
    });
  });

  // ── recordDispute ─────────────────────────────────────────
  describe("recordDispute", function () {
    it("should track disputes won and lost", async function () {
      const { reputation, seller } = await deployReputation(viem);

      await reputation.write.recordDispute([seller.account.address, 0n, true]);
      let rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersDisputed, 1n);
      assert.equal(rep.disputesLost, 1n);

      await reputation.write.recordDispute([seller.account.address, 1n, false]);
      rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.ordersDisputed, 2n);
      assert.equal(rep.disputesLost, 1n);
    });
  });

  // ── score calculation ─────────────────────────────────────
  describe("score calculation", function () {
    it("should return 80 after single completed order (50 base + 30 completion)", async function () {
      const { reputation, seller } = await deployReputation(viem);
      await reputation.write.recordCompletedOrder([seller.account.address, 0n, toUSDT(50)]);
      const rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.score, 80n);
    });

    it("should decrease score when disputes are lost", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 10; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(100)]);
      }
      const before = await reputation.read.getReputation([seller.account.address]);

      await reputation.write.recordDispute([seller.account.address, 100n, true]);
      await reputation.write.recordDispute([seller.account.address, 101n, true]);

      const after = await reputation.read.getReputation([seller.account.address]);
      assert.ok(after.score < before.score);
      assert.equal(after.disputesLost, 2n);
    });
  });

  // ── Top Seller (ADR-020) ──────────────────────────────────
  describe("Top Seller (ADR-020)", function () {
    it("should grant Top Seller after 50 orders with 0 disputes and no sanction", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);
    });

    it("should NOT grant Top Seller with only 49 orders", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 49; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), false);
    });

    it("should NOT grant Top Seller when any dispute is lost", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.recordDispute([seller.account.address, 100n, true]);
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), false);
    });

    it("should NOT grant Top Seller within 90 days of a sanction", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      // Stamp lastSanctionAt, then lift back to Active
      await reputation.write.applySanction([seller.account.address, 1]); // Suspended
      await reputation.write.applySanction([seller.account.address, 0]); // Active
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), false);
    });

    it("should grant Top Seller 90 days after a sanction is lifted", async function () {
      const { reputation, seller, publicClient } = await deployReputation(viem);
      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.applySanction([seller.account.address, 1]);
      await reputation.write.applySanction([seller.account.address, 0]);

      await increaseTime(publicClient, 91 * 24 * 60 * 60);

      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);
    });
  });

  // ── sanctions ─────────────────────────────────────────────
  describe("sanctions", function () {
    it("should reject applySanction by non-owner", async function () {
      const { reputation, seller, buyer } = await deployReputation(viem);
      await expectRevert(
        reputation.write.applySanction([seller.account.address, 1], { account: buyer.account })
      );
    });

    it("should revoke Top Seller on sanction and block subsequent recordCompletedOrder", async function () {
      const { reputation, seller } = await deployReputation(viem);
      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);

      await reputation.write.applySanction([seller.account.address, 1]); // Suspended

      const rep = await reputation.read.getReputation([seller.account.address]);
      assert.equal(rep.status, 1);
      assert.equal(rep.isTopSeller, false);

      await expectRevert(
        reputation.write.recordCompletedOrder([seller.account.address, 999n, toUSDT(50)]),
        "Seller not active"
      );
    });
  });

  // ── firstOrderAt (ADR-020 Tier 2 seniority) ───────────────
  describe("firstOrderAt", function () {
    it("should stamp firstOrderAt on the first order and not mutate on later orders", async function () {
      const { reputation, seller, publicClient } = await deployReputation(viem);

      await reputation.write.recordCompletedOrder([seller.account.address, 0n, toUSDT(50)]);
      const afterFirst = await reputation.read.getReputation([seller.account.address]);
      const firstTs = afterFirst.firstOrderAt;
      assert.ok(firstTs > 0n);

      await increaseTime(publicClient, 3600);
      await reputation.write.recordCompletedOrder([seller.account.address, 1n, toUSDT(50)]);
      const afterSecond = await reputation.read.getReputation([seller.account.address]);
      assert.equal(afterSecond.firstOrderAt, firstTs);
      assert.equal(afterSecond.ordersCompleted, 2n);
    });
  });

  // ── getAutoReleaseDays ────────────────────────────────────
  describe("getAutoReleaseDays", function () {
    it("returns 3 intra / 2 intra Top Seller / 7 cross-border", async function () {
      const { reputation, seller } = await deployReputation(viem);

      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, false]), 3n);
      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, true]), 7n);

      for (let i = 0; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);

      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, false]), 2n);
      assert.equal(await reputation.read.getAutoReleaseDays([seller.account.address, true]), 7n);
    });
  });
});
