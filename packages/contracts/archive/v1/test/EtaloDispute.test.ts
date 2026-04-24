import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployAll, toUSDT, increaseTime, expectRevert } from "./helpers/fixtures.js";

describe("EtaloDispute", async function () {
  const { viem } = await network.create();

  /** Helper: create + fund + ship an order, returns orderId = 0n */
  async function createFundedShippedOrder(escrow: any, mockUSDT: any, buyer: any, seller: any) {
    const amount = toUSDT(100);
    await mockUSDT.write.mint([buyer.account.address, amount]);
    await mockUSDT.write.approve([escrow.address, amount], { account: buyer.account });
    await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
    await escrow.write.fundOrder([0n], { account: buyer.account });
    await escrow.write.markShipped([0n], { account: seller.account });
    return 0n;
  }

  // ── Open Dispute ──────────────────────────────────────────
  describe("openDispute", function () {
    it("should open an L1 dispute and freeze auto-release", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);

      await dispute.write.openDispute([0n, "Item not as described"], { account: buyer.account });

      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.level, 1); // L1_Negotiation
      assert.equal(d.resolved, false);
      assert.equal(d.reason, "Item not as described");

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 5); // Disputed
      assert.equal(order.autoReleaseAfter, 0n); // Frozen
    });

    it("should reject dispute by non-buyer", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);

      await expectRevert(
        dispute.write.openDispute([0n, "reason"], { account: seller.account }),
        "Only buyer can open dispute"
      );
    });

    it("should reject duplicate dispute", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);

      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });
      await expectRevert(
        dispute.write.openDispute([0n, "another reason"], { account: buyer.account }),
        "Dispute already exists"
      );
    });
  });

  // ── L1 Resolution ─────────────────────────────────────────
  describe("L1 — Seller resolves", function () {
    it("should resolve L1 with full refund to buyer", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);

      const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
      await dispute.write.openDispute([0n, "defective item"], { account: buyer.account });
      await dispute.write.resolveL1([0n], { account: seller.account });

      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.resolved, true);
      assert.equal(d.outcome, 1); // ResolvedBySeller

      const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, toUSDT(100));
    });
  });

  // ── L1 → L2 Escalation ───────────────────────────────────
  describe("escalateToL2", function () {
    it("should allow buyer to escalate immediately", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });

      await dispute.write.escalateToL2([0n], { account: buyer.account });

      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.level, 2); // L2_Mediator
    });

    it("should allow anyone to escalate after L1 deadline (48h)", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller, mediator, publicClient } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });

      // Fast forward 48h + 1s
      await increaseTime(publicClient, 48 * 3600 + 1);

      // Even mediator (third party) can trigger escalation after deadline
      await dispute.write.escalateToL2([0n], { account: mediator.account });
      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.level, 2);
    });

    it("should reject non-buyer escalation before deadline", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller, mediator } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });

      await expectRevert(
        dispute.write.escalateToL2([0n], { account: seller.account }),
        "L1 deadline not reached"
      );
    });
  });

  // ── L2 Resolution by Mediator ─────────────────────────────
  describe("L2 — Mediator resolves", function () {
    it("should resolve with partial refund", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller, mediator, deployer } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "partial damage"], { account: buyer.account });
      await dispute.write.escalateToL2([0n], { account: buyer.account });

      // Admin approves and assigns mediator
      await dispute.write.approveMediator([mediator.account.address, true]);
      await dispute.write.assignMediator([0n, mediator.account.address]);

      const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
      // Mediator decides 50% refund
      const refundAmount = toUSDT(50);
      await dispute.write.resolveL2([0n, refundAmount], { account: mediator.account });

      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.resolved, true);
      assert.equal(d.outcome, 2); // ResolvedByMediator

      const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, refundAmount);
    });

    it("should reject resolution by non-assigned mediator", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller, deployer } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });
      await dispute.write.escalateToL2([0n], { account: buyer.account });

      await expectRevert(
        dispute.write.resolveL2([0n, toUSDT(50)], { account: seller.account }),
        "Not assigned mediator"
      );
    });
  });

  // ── L3 Resolution by Admin ────────────────────────────────
  describe("L3 — Admin resolves", function () {
    it("should allow admin to resolve at L2+ level", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "fraud"], { account: buyer.account });
      await dispute.write.escalateToL2([0n], { account: buyer.account });

      // Admin (deployer/owner) resolves L3 — full refund
      const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
      await dispute.write.resolveL3([0n, toUSDT(100)]);

      const d = await dispute.read.getDispute([0n]);
      assert.equal(d.resolved, true);
      assert.equal(d.level, 3); // L3_Admin
      assert.equal(d.outcome, 3); // ResolvedByAdmin

      const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, toUSDT(100));
    });

    it("should reject L3 resolve by non-owner", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);
      await dispute.write.openDispute([0n, "reason"], { account: buyer.account });
      await dispute.write.escalateToL2([0n], { account: buyer.account });

      await expectRevert(
        dispute.write.resolveL3([0n, toUSDT(50)], { account: buyer.account })
      );
    });
  });

  // ── isDisputed view ───────────────────────────────────────
  describe("isDisputed", function () {
    it("should return true for active dispute, false after resolution", async function () {
      const { escrow, dispute, mockUSDT, buyer, seller } = await deployAll(viem);
      await createFundedShippedOrder(escrow, mockUSDT, buyer, seller);

      assert.equal(await dispute.read.isDisputed([0n]), false);

      await dispute.write.openDispute([0n, "test"], { account: buyer.account });
      assert.equal(await dispute.read.isDisputed([0n]), true);

      await dispute.write.resolveL1([0n], { account: seller.account });
      assert.equal(await dispute.read.isDisputed([0n]), false);
    });
  });
});
