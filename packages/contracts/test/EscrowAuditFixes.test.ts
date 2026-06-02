import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployEscrow,
  increaseTime,
  toUSDT,
  expectRevert,
} from "./helpers/fixtures.js";

const NONZERO_PROOF = ("0x" + "11".repeat(32)) as `0x${string}`;

describe("EtaloEscrow — audit fixes (delivery-chain review)", async function () {
  const { viem } = await network.create();

  // ── Fix #1: V1 intra-only invariant enforced on-chain ──────────
  describe("Fix #1 — cross-border disabled in V1", function () {
    it("reverts createOrderWithItems when isCrossBorder = true", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await expectRevert(
        escrow.write.createOrderWithItems(
          [seller.account.address, [toUSDT(50)], true],
          { account: buyer.account }
        ),
        "Cross-border disabled in V1 (ADR-041)"
      );
    });

    it("still allows intra orders (isCrossBorder = false)", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], false],
        { account: buyer.account }
      );
      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.isCrossBorder, false);
      assert.equal(order.globalStatus, 0); // Created
    });
  });

  // ── Fix #3: per-buyer concurrent escrow cap (lockstep) ─────────
  describe("Fix #3 — per-buyer escrow cap", function () {
    async function createAndFund(escrow: any, buyer: any, seller: any, n: number) {
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([BigInt(n)], { account: buyer.account });
    }

    it("caps a single buyer at MAX_BUYER_ESCROW_USDT (2,500) and frees it on refund", async function () {
      const { escrow, buyer, seller, publicClient } = await deployEscrow(viem);

      // 5 × 500 = 2,500 USDT → exactly at the cap, all succeed.
      for (let i = 1; i <= 5; i++) await createAndFund(escrow, buyer, seller, i);
      assert.equal(
        await escrow.read.buyerActiveEscrow([buyer.account.address]),
        toUSDT(2500)
      );

      // Create the 6th order; funding it would push escrow to 3,000 > cap.
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await expectRevert(
        escrow.write.fundOrder([6n], { account: buyer.account }),
        "Buyer escrow cap reached"
      );

      // Auto-refund order #1 after the 7-day inactivity window → frees 500.
      await increaseTime(publicClient, 7 * 24 * 60 * 60 + 1);
      await escrow.write.triggerAutoRefundIfInactive([1n], {
        account: buyer.account,
      });
      assert.equal(
        await escrow.read.buyerActiveEscrow([buyer.account.address]),
        toUSDT(2000)
      );

      // With 2,000 escrowed, the 6th order (500) now funds (2,500 ≤ cap).
      await escrow.write.fundOrder([6n], { account: buyer.account });
      assert.equal(
        await escrow.read.buyerActiveEscrow([buyer.account.address]),
        toUSDT(2500)
      );
    });
  });

  // ── Fix #4: weekly volume recorded at ship, not at fund ────────
  describe("Fix #4 — seller weekly volume counted at ship", function () {
    it("does not consume the seller's weekly cap at fund; records it at ship", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);

      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });

      // Funding no longer touches the weekly volume (audit finding #4).
      assert.equal(
        await escrow.read.sellerWeeklyVolume([seller.account.address]),
        0n
      );

      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped([1n, itemIds, NONZERO_PROOF], {
        account: seller.account,
      });

      // Shipping records the shipped value toward the weekly cap.
      assert.equal(
        await escrow.read.sellerWeeklyVolume([seller.account.address]),
        toUSDT(500)
      );
    });
  });

  // ── ADR-057 re-audit FINDING-1: refund paths must not release weekly
  //    volume for orders that were never shipped (and thus never counted).
  describe("Re-audit FINDING-1 — auto-refund of unshipped order keeps weekly volume", function () {
    it("does NOT release seller weekly volume when refunding a never-shipped order", async function () {
      const { escrow, buyer, seller, publicClient } = await deployEscrow(viem);

      // Order #1: funded AND shipped → records 500 toward the weekly cap.
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds1 = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped([1n, itemIds1, NONZERO_PROOF], {
        account: seller.account,
      });
      assert.equal(
        await escrow.read.sellerWeeklyVolume([seller.account.address]),
        toUSDT(500)
      );

      // Order #2: funded but NEVER shipped (stays in Funded state).
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([2n], { account: buyer.account });
      // Funding order #2 never touched the weekly counter (finding #4).
      assert.equal(
        await escrow.read.sellerWeeklyVolume([seller.account.address]),
        toUSDT(500)
      );

      // 7-day inactivity window → permissionless auto-refund of order #2.
      await increaseTime(publicClient, 7 * 24 * 60 * 60 + 1);
      await escrow.write.triggerAutoRefundIfInactive([2n], {
        account: buyer.account,
      });

      // FINDING-1: weekly volume must still read 500 — refunding a
      // never-shipped order must NOT free phantom cap headroom. Before the
      // fix this dropped to 0, letting the seller ship 500 more this week.
      assert.equal(
        await escrow.read.sellerWeeklyVolume([seller.account.address]),
        toUSDT(500)
      );
    });
  });
});
