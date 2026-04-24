import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployDispute,
  increaseTime,
  toUSDT,
  expectRevert,
} from "./helpers/fixtures.js";

const LEVEL_N1 = 1;
const LEVEL_N2 = 2;
const LEVEL_N3 = 3;
const LEVEL_RESOLVED = 4;

const N1_DURATION = 48 * 3600;
const N2_DURATION = 7 * 24 * 3600;
const N3_VOTING_PERIOD = 14 * 24 * 3600;

describe("EtaloDispute", async function () {
  const { viem } = await network.create();

  // ── openDispute ───────────────────────────────────────────
  describe("openDispute", function () {
    it("creates a dispute, freezes the item, and pauses the seller's stake", async function () {
      const { dispute, mockEscrow, stake, buyer, seller } = await deployDispute(viem);

      await dispute.write.openDispute([1n, 1n, "wrong item"], {
        account: buyer.account,
      });

      const [orderId, itemId, level, resolved] = await dispute.read.getDispute([1n]);
      assert.equal(orderId, 1n);
      assert.equal(itemId, 1n);
      assert.equal(level, LEVEL_N1);
      assert.equal(resolved, false);

      assert.equal(await mockEscrow.read.markItemDisputedCalled(), true);
      assert.equal(await mockEscrow.read.lastMarkedItemId(), 1n);

      const [, , , , , freezeCount] = await stake.read.getWithdrawal([
        seller.account.address,
      ]);
      assert.equal(freezeCount, 1n);
    });

    it("rejects openDispute from a non-buyer caller", async function () {
      const { dispute, nonParty } = await deployDispute(viem);
      await expectRevert(
        dispute.write.openDispute([1n, 1n, "fake"], { account: nonParty.account }),
        "Only buyer can open dispute"
      );
    });

    it("rejects a second dispute on the same item", async function () {
      const { dispute, buyer } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "first"], { account: buyer.account });
      await expectRevert(
        dispute.write.openDispute([1n, 1n, "second"], { account: buyer.account }),
        "Item already disputed"
      );
    });
  });

  // ── resolveN1Amicable ─────────────────────────────────────
  describe("resolveN1Amicable (bilateral)", function () {
    it("resolves when both parties propose the same amount", async function () {
      const { dispute, mockEscrow, stake, buyer, seller } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });

      await dispute.write.resolveN1Amicable([1n, toUSDT(20)], {
        account: seller.account,
      });
      let [, , , resolved1] = await dispute.read.getDispute([1n]);
      assert.equal(resolved1, false);

      await dispute.write.resolveN1Amicable([1n, toUSDT(20)], {
        account: buyer.account,
      });
      const [, , level, resolved] = await dispute.read.getDispute([1n]);
      assert.equal(resolved, true);
      assert.equal(level, LEVEL_RESOLVED);

      assert.equal(await mockEscrow.read.lastRefundAmount(), toUSDT(20));
      const [, , , , , freezeCount] = await stake.read.getWithdrawal([
        seller.account.address,
      ]);
      assert.equal(freezeCount, 0n);
    });

    it("stores a single-sided proposal without resolving", async function () {
      const { dispute, buyer } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });

      await dispute.write.resolveN1Amicable([1n, toUSDT(15)], {
        account: buyer.account,
      });
      const [bAmt, sAmt, bProp, sProp] = await dispute.read.getN1Proposal([1n]);
      assert.equal(bAmt, toUSDT(15));
      assert.equal(sAmt, 0n);
      assert.equal(bProp, true);
      assert.equal(sProp, false);

      const [, , , resolved] = await dispute.read.getDispute([1n]);
      assert.equal(resolved, false);
    });

    it("does not resolve when proposals do not match", async function () {
      const { dispute, buyer, seller } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });

      await dispute.write.resolveN1Amicable([1n, toUSDT(40)], {
        account: buyer.account,
      });
      await dispute.write.resolveN1Amicable([1n, toUSDT(10)], {
        account: seller.account,
      });

      const [, , , resolved] = await dispute.read.getDispute([1n]);
      assert.equal(resolved, false);
    });

    it("rejects resolveN1Amicable from a non-party caller", async function () {
      const { dispute, buyer, nonParty } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await expectRevert(
        dispute.write.resolveN1Amicable([1n, toUSDT(20)], { account: nonParty.account }),
        "Only parties"
      );
    });
  });

  // ── escalateToMediation ───────────────────────────────────
  describe("escalateToMediation", function () {
    it("buyer can escalate N1 → N2 immediately", async function () {
      const { dispute, buyer } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      const [, , level] = await dispute.read.getDispute([1n]);
      assert.equal(level, LEVEL_N2);
    });

    it("anyone can escalate after the N1 deadline", async function () {
      const { dispute, buyer, nonParty, publicClient } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await increaseTime(publicClient, N1_DURATION + 1);
      await dispute.write.escalateToMediation([1n], { account: nonParty.account });
      const [, , level] = await dispute.read.getDispute([1n]);
      assert.equal(level, LEVEL_N2);
    });

    it("rejects escalation from a non-buyer before the N1 deadline", async function () {
      const { dispute, buyer, nonParty } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await expectRevert(
        dispute.write.escalateToMediation([1n], { account: nonParty.account }),
        "Buyer only before N1 deadline"
      );
    });
  });

  // ── resolveN2Mediation ────────────────────────────────────
  describe("resolveN2Mediation", function () {
    it("assigned mediator resolves with refund and slash", async function () {
      const { dispute, stake, mockEscrow, buyer, seller, mediator } = await deployDispute(viem);

      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      await dispute.write.assignN2Mediator([1n, mediator.account.address]);

      await dispute.write.resolveN2Mediation(
        [1n, toUSDT(50), toUSDT(3)],
        { account: mediator.account }
      );

      const [, , level, resolved] = await dispute.read.getDispute([1n]);
      assert.equal(resolved, true);
      assert.equal(level, LEVEL_RESOLVED);

      assert.equal(await mockEscrow.read.lastRefundAmount(), toUSDT(50));
      // Seller's stake went from 10 USDT to 7 USDT (slash of 3); tier
      // auto-downgrades to None per ADR-028 because 7 < TIER_1_STAKE.
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(7));
      assert.equal(await stake.read.getTier([seller.account.address]), 0);
    });

    it("rejects resolveN2Mediation from a non-assigned mediator", async function () {
      const { dispute, buyer, mediator, mediator2 } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      await dispute.write.assignN2Mediator([1n, mediator.account.address]);

      await expectRevert(
        dispute.write.resolveN2Mediation([1n, toUSDT(20), 0n], {
          account: mediator2.account,
        }),
        "Not assigned mediator"
      );
    });
  });

  // ── escalateToVoting + resolveFromVote ────────────────────
  describe("escalateToVoting / resolveFromVote", function () {
    it("creates a vote on EtaloVoting with a voter list", async function () {
      const { dispute, voting, buyer } = await deployDispute(viem);
      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      await dispute.write.escalateToVoting([1n], { account: buyer.account });

      const [vDisputeId, vDeadline, vFinalized] = await voting.read.getVote([1n]);
      assert.equal(vDisputeId, 1n);
      assert.ok(vDeadline > 0n);
      assert.equal(vFinalized, false);

      const [, , level] = await dispute.read.getDispute([1n]);
      assert.equal(level, LEVEL_N3);
    });

    it("voting callback resolves the dispute with full refund when buyer wins", async function () {
      const { dispute, voting, mockEscrow, stake, buyer, seller, mediator, mediator2, publicClient } =
        await deployDispute(viem);

      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      await dispute.write.escalateToVoting([1n], { account: buyer.account });

      // Both mediators vote favorBuyer=true (no n2 assignment → both eligible).
      await voting.write.submitVote([1n, true], { account: mediator.account });
      await voting.write.submitVote([1n, true], { account: mediator2.account });

      await increaseTime(publicClient, N3_VOTING_PERIOD + 1);
      await voting.write.finalizeVote([1n]);

      const [, , level, resolved] = await dispute.read.getDispute([1n]);
      assert.equal(resolved, true);
      assert.equal(level, LEVEL_RESOLVED);
      assert.equal(await mockEscrow.read.lastRefundAmount(), toUSDT(50)); // full item price

      const [, , , , , freezeCount] = await stake.read.getWithdrawal([
        seller.account.address,
      ]);
      assert.equal(freezeCount, 0n);
    });
  });

  // ── hasActiveDispute + hasActiveDisputeForItem ────────────
  describe("views", function () {
    it("hasActiveDispute and hasActiveDisputeForItem transition correctly", async function () {
      const { dispute, buyer, seller } = await deployDispute(viem);

      assert.equal(await dispute.read.hasActiveDispute([seller.account.address]), false);
      assert.equal(await dispute.read.hasActiveDisputeForItem([1n, 1n]), false);

      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      assert.equal(await dispute.read.hasActiveDispute([seller.account.address]), true);
      assert.equal(await dispute.read.hasActiveDisputeForItem([1n, 1n]), true);

      // Resolve via N1 bilateral match at 0 refund
      await dispute.write.resolveN1Amicable([1n, 0n], { account: buyer.account });
      await dispute.write.resolveN1Amicable([1n, 0n], { account: seller.account });

      assert.equal(await dispute.read.hasActiveDispute([seller.account.address]), false);
      assert.equal(await dispute.read.hasActiveDisputeForItem([1n, 1n]), false);
    });
  });

  // ── N3 voter exclusion ────────────────────────────────────
  describe("N3 voter exclusion", function () {
    it("N3 voters list excludes the assigned N2 mediator", async function () {
      const { dispute, voting, buyer, mediator, mediator2 } = await deployDispute(viem);

      await dispute.write.openDispute([1n, 1n, "r"], { account: buyer.account });
      await dispute.write.escalateToMediation([1n], { account: buyer.account });
      await dispute.write.assignN2Mediator([1n, mediator.account.address]);
      await dispute.write.escalateToVoting([1n], { account: buyer.account });

      // The N2-assigned mediator is excluded from the voter set.
      await expectRevert(
        voting.write.submitVote([1n, true], { account: mediator.account }),
        "Not eligible"
      );
      // mediator2 is still eligible.
      await voting.write.submitVote([1n, true], { account: mediator2.account });
      assert.equal(
        await voting.read.hasVoted([1n, mediator2.account.address]),
        true
      );
    });
  });
});
