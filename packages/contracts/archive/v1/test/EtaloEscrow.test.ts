import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployAll, toUSDT, increaseTime, expectRevert, INITIAL_MINT } from "./helpers/fixtures.js";

describe("EtaloEscrow", async function () {
  const { viem } = await network.create();

  // ── Order Creation ────────────────────────────────────────
  describe("createOrder", function () {
    it("should create an intra-country order with correct params", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      const amount = toUSDT(100);

      const hash = await escrow.write.createOrder(
        [seller.account.address, amount, false],
        { account: buyer.account }
      );

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.buyer.toLowerCase(), buyer.account.address.toLowerCase());
      assert.equal(order.seller.toLowerCase(), seller.account.address.toLowerCase());
      assert.equal(order.amount, amount);
      assert.equal(order.isCrossBorder, false);
      assert.equal(order.milestoneCount, 1n);
      assert.equal(order.status, 0); // Created

      // Commission = 1.8% of 100 USDT = 1.8 USDT = 1_800_000
      assert.equal(order.commission, toUSDT(100) * 180n / 10000n);
    });

    it("should create a cross-border order with 4 milestones", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      const amount = toUSDT(200);

      await escrow.write.createOrder(
        [seller.account.address, amount, true],
        { account: buyer.account }
      );

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.isCrossBorder, true);
      assert.equal(order.milestoneCount, 4n);
      // Commission = 2.7% of 200 USDT = 5.4 USDT = 5_400_000
      assert.equal(order.commission, toUSDT(200) * 270n / 10000n);
    });

    it("should reject zero amount", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await expectRevert(
        escrow.write.createOrder([seller.account.address, 0n, false], { account: buyer.account }),
        "Amount must be > 0"
      );
    });

    it("should reject buying from self", async function () {
      const { escrow, buyer } = await deployAll(viem);
      await expectRevert(
        escrow.write.createOrder([buyer.account.address, toUSDT(10), false], { account: buyer.account }),
        "Cannot buy from self"
      );
    });

    it("should reject zero seller address", async function () {
      const { escrow, buyer } = await deployAll(viem);
      await expectRevert(
        escrow.write.createOrder(["0x0000000000000000000000000000000000000000", toUSDT(10), false], { account: buyer.account }),
        "Invalid seller"
      );
    });

    it("should increment order count", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      assert.equal(await escrow.read.getOrderCount(), 0n);

      await escrow.write.createOrder([seller.account.address, toUSDT(50), false], { account: buyer.account });
      assert.equal(await escrow.read.getOrderCount(), 1n);

      await escrow.write.createOrder([seller.account.address, toUSDT(75), true], { account: buyer.account });
      assert.equal(await escrow.read.getOrderCount(), 2n);
    });
  });

  // ── Funding ───────────────────────────────────────────────
  describe("fundOrder", function () {
    it("should transfer USDT from buyer to escrow", async function () {
      const { escrow, mockUSDT, buyer, seller } = await deployAll(viem);
      const amount = toUSDT(100);

      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      const escrowBalance = await mockUSDT.read.balanceOf([escrow.address]);
      assert.equal(escrowBalance, amount);

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 1); // Funded
    });

    it("should reject funding by non-buyer", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });

      await expectRevert(
        escrow.write.fundOrder([0n], { account: seller.account }),
        "Not buyer"
      );
    });

    it("should reject double funding", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      await expectRevert(
        escrow.write.fundOrder([0n], { account: buyer.account }),
        "Order not in Created state"
      );
    });
  });

  // ── Shipping ──────────────────────────────────────────────
  describe("markShipped", function () {
    it("should set order to Shipped and set auto-release timer", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      await escrow.write.markShipped([0n], { account: seller.account });

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 2); // Shipped
      assert.ok(order.shippedAt > 0n);
      assert.ok(order.autoReleaseAfter > 0n);
    });

    it("should reject shipping by non-seller", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      await expectRevert(
        escrow.write.markShipped([0n], { account: buyer.account }),
        "Not seller"
      );
    });
  });

  // ── Full Intra-Country Lifecycle ──────────────────────────
  describe("intra-country full lifecycle", function () {
    it("should distribute funds correctly: seller gets amount - commission, treasury gets commission", async function () {
      const { escrow, mockUSDT, buyer, seller, treasury } = await deployAll(viem);
      const amount = toUSDT(100);
      const commission = amount * 180n / 10000n; // 1.8 USDT
      const sellerExpected = amount - commission;

      const sellerBalanceBefore = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryBalanceBefore = await mockUSDT.read.balanceOf([treasury.account.address]);

      // Full lifecycle
      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });
      await escrow.write.confirmDelivery([0n], { account: buyer.account });

      const sellerBalanceAfter = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryBalanceAfter = await mockUSDT.read.balanceOf([treasury.account.address]);
      const order = await escrow.read.getOrder([0n]);

      assert.equal(order.status, 4); // Completed
      assert.equal(sellerBalanceAfter - sellerBalanceBefore, sellerExpected);
      assert.equal(treasuryBalanceAfter - treasuryBalanceBefore, commission);
    });
  });

  // ── Cross-Border Milestones ───────────────────────────────
  describe("cross-border milestones", function () {
    it("should release 25% per milestone over 4 steps", async function () {
      const { escrow, mockUSDT, buyer, seller, treasury } = await deployAll(viem);
      const amount = toUSDT(400);
      const commission = amount * 270n / 10000n; // 2.7% = 10.8 USDT
      const netAmount = amount - commission;
      const perMilestone = netAmount / 4n;

      // Mint extra for buyer and approve
      await mockUSDT.write.mint([buyer.account.address, amount]);
      await mockUSDT.write.approve([escrow.address, amount], { account: buyer.account });

      await escrow.write.createOrder([seller.account.address, amount, true], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });

      const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);

      // Release 3 milestones one by one
      for (let i = 0; i < 3; i++) {
        await escrow.write.releaseMilestone([0n], { account: buyer.account });
      }

      const sellerAfter3 = await mockUSDT.read.balanceOf([seller.account.address]);
      assert.equal(sellerAfter3 - sellerBefore, perMilestone * 3n);

      // 4th milestone should finalize
      await escrow.write.releaseMilestone([0n], { account: buyer.account });

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 4); // Completed
      assert.equal(order.milestonesReleased, 4n);
    });

    it("should reject milestone release for intra-country orders", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });

      await expectRevert(
        escrow.write.releaseMilestone([0n], { account: buyer.account }),
        "Not a cross-border order"
      );
    });
  });

  // ── Auto-Release ──────────────────────────────────────────
  describe("triggerAutoRelease", function () {
    it("should release funds after 3-day deadline (intra)", async function () {
      const { escrow, mockUSDT, buyer, seller, treasury, publicClient } = await deployAll(viem);
      const amount = toUSDT(100);

      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });

      // Fast forward 3 days + 1 second
      await increaseTime(publicClient, 3 * 24 * 3600 + 1);

      const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
      await escrow.write.triggerAutoRelease([0n]);

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 4); // Completed

      const sellerAfter = await mockUSDT.read.balanceOf([seller.account.address]);
      const commission = amount * 180n / 10000n;
      assert.equal(sellerAfter - sellerBefore, amount - commission);
    });

    it("should revert before deadline", async function () {
      const { escrow, buyer, seller, publicClient } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });

      // Only 1 day passed
      await increaseTime(publicClient, 1 * 24 * 3600);

      await expectRevert(
        escrow.write.triggerAutoRelease([0n]),
        "Auto-release not yet available"
      );
    });

    it("should release after 7 days for cross-border", async function () {
      const { escrow, mockUSDT, buyer, seller, publicClient } = await deployAll(viem);
      const amount = toUSDT(200);
      await mockUSDT.write.mint([buyer.account.address, amount]);
      await mockUSDT.write.approve([escrow.address, amount], { account: buyer.account });

      await escrow.write.createOrder([seller.account.address, amount, true], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });

      // 7 days + 1s
      await increaseTime(publicClient, 7 * 24 * 3600 + 1);

      await escrow.write.triggerAutoRelease([0n]);
      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 4); // Completed
    });
  });

  // ── Cancel ────────────────────────────────────────────────
  describe("cancelOrder", function () {
    it("should allow buyer to cancel unfunded order", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(50), false], { account: buyer.account });
      await escrow.write.cancelOrder([0n], { account: buyer.account });

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 7); // Cancelled
    });

    it("should reject cancel on funded order", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(50), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      await expectRevert(
        escrow.write.cancelOrder([0n], { account: buyer.account }),
        "Can only cancel unfunded orders"
      );
    });
  });

  // ── Force Refund (Admin) ──────────────────────────────────
  describe("forceRefund", function () {
    it("should refund buyer and set status to Refunded", async function () {
      const { escrow, mockUSDT, buyer, seller, deployer } = await deployAll(viem);
      const amount = toUSDT(100);

      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
      await escrow.write.forceRefund([0n]); // deployer is owner

      const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, amount);

      const order = await escrow.read.getOrder([0n]);
      assert.equal(order.status, 6); // Refunded
    });

    it("should reject forceRefund by non-owner", async function () {
      const { escrow, buyer, seller } = await deployAll(viem);
      await escrow.write.createOrder([seller.account.address, toUSDT(100), false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });

      await expectRevert(
        escrow.write.forceRefund([0n], { account: buyer.account })
      );
    });
  });

  // ── USDT 6-Decimal Math ───────────────────────────────────
  describe("USDT 6-decimal precision", function () {
    it("should handle fractional USDT amounts correctly", async function () {
      const { escrow, mockUSDT, buyer, seller, treasury } = await deployAll(viem);
      // 99.99 USDT = 99_990_000
      const amount = toUSDT(99) + 990000n;

      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });

      const order = await escrow.read.getOrder([0n]);
      // 1.8% of 99.99 = 1.79982 USDT
      // In integer math: 99_990_000 * 180 / 10000 = 1_799_820
      const expectedCommission = amount * 180n / 10000n;
      assert.equal(order.commission, expectedCommission);
      assert.equal(order.commission, 1799820n);
    });

    it("should have zero dust after full lifecycle", async function () {
      const { escrow, mockUSDT, buyer, seller, treasury } = await deployAll(viem);
      const amount = toUSDT(100);

      await escrow.write.createOrder([seller.account.address, amount, false], { account: buyer.account });
      await escrow.write.fundOrder([0n], { account: buyer.account });
      await escrow.write.markShipped([0n], { account: seller.account });
      await escrow.write.confirmDelivery([0n], { account: buyer.account });

      // Escrow should have zero balance
      const escrowBalance = await mockUSDT.read.balanceOf([escrow.address]);
      assert.equal(escrowBalance, 0n);
    });
  });
});
