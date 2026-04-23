import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployEscrow, increaseTime, toUSDT, expectRevert } from "./helpers/fixtures.js";

// EtaloTypes.OrderStatus encoding
const STATUS_CREATED = 0;
const STATUS_FUNDED = 1;
const STATUS_CANCELLED = 8;

// EtaloTypes.ItemStatus encoding
const ITEM_PENDING = 0;

describe("EtaloEscrow — Stage 1 (creation, funding, cancel, limits, views)", async function () {
  const { viem } = await network.create();

  // ── createOrderWithItems + fundOrder ───────────────────────
  describe("createOrderWithItems", function () {
    it("creates an intra single-item order with correct state and per-item commission", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], false],
        { account: buyer.account }
      );

      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.orderId, 1n);
      assert.equal(order.buyer.toLowerCase(), buyer.account.address.toLowerCase());
      assert.equal(order.seller.toLowerCase(), seller.account.address.toLowerCase());
      assert.equal(order.totalAmount, toUSDT(50));
      // Intra, no Top Seller → 1.8%
      assert.equal(order.totalCommission, (toUSDT(50) * 180n) / 10000n);
      assert.equal(order.isCrossBorder, false);
      assert.equal(order.globalStatus, STATUS_CREATED);
      assert.equal(order.itemCount, 1n);

      const itemIds = await escrow.read.getOrderItems([1n]);
      assert.equal(itemIds.length, 1);

      const item = await escrow.read.getItem([itemIds[0]]);
      assert.equal(item.itemPrice, toUSDT(50));
      assert.equal(item.itemCommission, (toUSDT(50) * 180n) / 10000n);
      assert.equal(item.status, ITEM_PENDING);
    });

    it("creates a multi-item intra order with pro-rata commission and dust in the last item", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      // Item prices chosen so pro-rata introduces dust: 3 + 5 + 7 = 15 USDT total
      const prices = [toUSDT(3), toUSDT(5), toUSDT(7)];
      await escrow.write.createOrderWithItems([seller.account.address, prices, false], {
        account: buyer.account,
      });

      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.totalAmount, toUSDT(15));
      const expectedTotalComm = (toUSDT(15) * 180n) / 10000n; // 0.27 USDT = 270_000
      assert.equal(order.totalCommission, expectedTotalComm);

      const itemIds = await escrow.read.getOrderItems([1n]);
      const items = await Promise.all(itemIds.map((id: bigint) => escrow.read.getItem([id])));

      // Pro-rata commissions sum exactly to totalCommission (last absorbs dust)
      const sum = items.reduce((acc: bigint, it: any) => acc + it.itemCommission, 0n);
      assert.equal(sum, expectedTotalComm);

      // First two items use integer-division pro-rata
      const expected0 = (toUSDT(3) * expectedTotalComm) / toUSDT(15);
      const expected1 = (toUSDT(5) * expectedTotalComm) / toUSDT(15);
      assert.equal(items[0].itemCommission, expected0);
      assert.equal(items[1].itemCommission, expected1);
    });

    it("rejects cross-border createOrder when the seller is not staked", async function () {
      const { escrow, buyer, nonParty } = await deployEscrow(viem);
      // nonParty has no stake → isEligibleForOrder returns false
      await expectRevert(
        escrow.write.createOrderWithItems(
          [nonParty.account.address, [toUSDT(50)], true],
          { account: buyer.account }
        ),
        "Seller stake ineligible"
      );
    });

    it("accepts a cross-border order within the Tier 1 cap with a staked seller", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      // Seller is staked at Tier 1 (max 100 USDT per order totalAmount per Q1).
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50), toUSDT(40)], true],
        { account: buyer.account }
      );
      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.totalAmount, toUSDT(90));
      assert.equal(order.isCrossBorder, true);
      assert.equal(order.totalCommission, (toUSDT(90) * 270n) / 10000n);
    });
  });

  describe("fundOrder", function () {
    it("transfers USDT, marks Funded, updates TVL, and increments activeSales for cross-border", async function () {
      const { escrow, mockUSDT, stake, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(60)], true],
        { account: buyer.account }
      );

      const tvlBefore = await escrow.read.totalEscrowed();
      const activeBefore = await stake.read.getActiveSales([seller.account.address]);

      await escrow.write.fundOrder([1n], { account: buyer.account });

      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.globalStatus, STATUS_FUNDED);
      assert.ok(order.fundedAt > 0n);
      assert.equal(
        await escrow.read.totalEscrowed(),
        tvlBefore + toUSDT(60)
      );
      assert.equal(
        await mockUSDT.read.balanceOf([escrow.address]),
        toUSDT(60)
      );
      assert.equal(
        await stake.read.getActiveSales([seller.account.address]),
        activeBefore + 1n
      );
    });
  });

  // ── ADR-026 architectural limits ──────────────────────────
  describe("ADR-026 limits", function () {
    it("rejects createOrder when totalAmount exceeds MAX_ORDER_USDT (500)", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await expectRevert(
        escrow.write.createOrderWithItems(
          [seller.account.address, [toUSDT(501)], false],
          { account: buyer.account }
        ),
        "Exceeds per-order cap"
      );
    });

    it("rejects createOrder with more than MAX_ITEMS_PER_ORDER (50) items", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      const prices = new Array(51).fill(toUSDT(1));
      await expectRevert(
        escrow.write.createOrderWithItems(
          [seller.account.address, prices, false],
          { account: buyer.account }
        ),
        "Too many items"
      );
    });

    it("rejects fundOrder when it would exceed MAX_TVL_USDT (50,000)", async function () {
      const { escrow, mockUSDT, buyer, seller, seller2, seller3, seller4, publicClient } =
        await deployEscrow(viem);
      // Fill escrow to exactly MAX_TVL using 10 sellers × 10 orders × 500 USDT (intra, no stake needed).
      // MAX_SELLER_WEEKLY_VOLUME = 5000 USDT per seller → 10 × 500 = 5000 per seller hits the cap.
      const wallets = await viem.getWalletClients();
      // Use wallets 2..11 as sellers (10 distinct). `seller` is wallet 2; extend.
      const sellers = [
        seller,
        seller2,
        seller3,
        seller4,
        wallets[10],
        wallets[11],
        wallets[12],
        wallets[13],
        wallets[14],
        wallets[15],
      ];

      let orderIdCounter = 0n;
      for (let s = 0; s < 10; s++) {
        for (let i = 0; i < 10; i++) {
          await escrow.write.createOrderWithItems(
            [sellers[s].account.address, [toUSDT(500)], false],
            { account: buyer.account }
          );
          orderIdCounter++;
          await escrow.write.fundOrder([orderIdCounter], { account: buyer.account });
        }
      }
      assert.equal(await escrow.read.totalEscrowed(), toUSDT(50_000));

      // Advance 1 week so a seller's weekly window resets; then the next
      // fundOrder should still revert because TVL is already at cap.
      await increaseTime(publicClient, 7 * 24 * 3600 + 1);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(1)], false],
        { account: buyer.account }
      );
      orderIdCounter++;
      await expectRevert(
        escrow.write.fundOrder([orderIdCounter], { account: buyer.account }),
        "Global TVL cap reached"
      );
    });

    it("rejects fundOrder exceeding MAX_SELLER_WEEKLY_VOLUME (5,000)", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      // 10 orders × 500 = 5000 exact cap for same seller.
      for (let i = 1; i <= 10; i++) {
        await escrow.write.createOrderWithItems(
          [seller.account.address, [toUSDT(500)], false],
          { account: buyer.account }
        );
        await escrow.write.fundOrder([BigInt(i)], { account: buyer.account });
      }
      // 11th order even at 1 USDT puts the seller's weekly volume above cap.
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(1)], false],
        { account: buyer.account }
      );
      await expectRevert(
        escrow.write.fundOrder([11n], { account: buyer.account }),
        "Seller weekly cap"
      );
    });

    it("rejects createOrder when seller == buyer", async function () {
      const { escrow, buyer } = await deployEscrow(viem);
      await expectRevert(
        escrow.write.createOrderWithItems(
          [buyer.account.address, [toUSDT(10)], false],
          { account: buyer.account }
        ),
        "Cannot buy from self"
      );
    });
  });

  // ── cancelOrder + getOrderCount + admin setters ───────────
  describe("cancel, count, setters", function () {
    it("cancels a Created order and sets status to Cancelled", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10)], false],
        { account: buyer.account }
      );
      await escrow.write.cancelOrder([1n], { account: buyer.account });
      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.globalStatus, STATUS_CANCELLED);
    });

    it("rejects cancelOrder once the order is Funded", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      await expectRevert(
        escrow.write.cancelOrder([1n], { account: buyer.account }),
        "Can only cancel Created orders"
      );
    });

    it("getOrderCount increments with each create, and admin setters persist new addresses", async function () {
      const {
        escrow,
        buyer,
        seller,
        commissionTreasury,
        creditsTreasury,
        communityFund,
      } = await deployEscrow(viem);

      assert.equal(await escrow.read.getOrderCount(), 0n);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10)], false],
        { account: buyer.account }
      );
      assert.equal(await escrow.read.getOrderCount(), 1n);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(20)], false],
        { account: buyer.account }
      );
      assert.equal(await escrow.read.getOrderCount(), 2n);

      // Setters updated the public state (fixture already invoked them,
      // so the current values should match the fixture's treasury wallets).
      assert.equal(
        (await escrow.read.commissionTreasury()).toLowerCase(),
        commissionTreasury.account.address.toLowerCase()
      );
      assert.equal(
        (await escrow.read.creditsTreasury()).toLowerCase(),
        creditsTreasury.account.address.toLowerCase()
      );
      assert.equal(
        (await escrow.read.communityFund()).toLowerCase(),
        communityFund.account.address.toLowerCase()
      );
    });
  });
});
