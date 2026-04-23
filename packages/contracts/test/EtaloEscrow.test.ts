import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployEscrow,
  grantTopSeller,
  increaseTime,
  toUSDT,
  expectRevert,
} from "./helpers/fixtures.js";

// EtaloTypes.OrderStatus encoding
const STATUS_CREATED = 0;
const STATUS_FUNDED = 1;
const STATUS_PARTIALLY_SHIPPED = 2;
const STATUS_ALL_SHIPPED = 3;
const STATUS_COMPLETED = 5;
const STATUS_CANCELLED = 8;

// EtaloTypes.ItemStatus encoding
const ITEM_PENDING = 0;
const ITEM_SHIPPED = 1;
const ITEM_ARRIVED = 2;
const ITEM_RELEASED = 4;

// EtaloTypes.ShipmentStatus encoding
const SHIP_SHIPPED = 1;
const SHIP_ARRIVED = 2;

describe("EtaloEscrow — Stage 1 (creation, funding, cancel, limits, views)", async function () {
  const { viem } = await network.create();

  // ── Bytecode size guard (Spurious Dragon 24,576-byte limit) ──
  describe("deployment size", function () {
    it("deployed bytecode must stay under 24,576 bytes", async function () {
      const { escrow, publicClient } = await deployEscrow(viem);
      const bytecode = await publicClient.getCode({ address: escrow.address });
      const sizeInBytes = bytecode ? (bytecode.length - 2) / 2 : 0;
      console.log(`    EtaloEscrow deployed bytecode: ${sizeInBytes} bytes`);
      assert.ok(
        sizeInBytes > 0 && sizeInBytes < 24576,
        `Bytecode ${sizeInBytes} bytes >= 24,576 (Spurious Dragon); extract helpers to a library`
      );
    });
  });

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

    it("Tier 1 seller rejected when cross-border totalAmount exceeds tier cap (ADR-020 Q1 canonical)", async function () {
      // ADR-020 cap is per ORDER TOTAL for V2 multi-item (Q1 Block 7).
      // Tier 1 max 100 USDT order total; 2 items [60, 50] summing to
      // 110 exceeds the cap even though each item is individually
      // below 100. Guards against the misinterpretation that would
      // let a Tier 1 stake of 10 USDT back multi-kUSDT exposure.
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await expectRevert(
        escrow.write.createOrderWithItems(
          [seller.account.address, [toUSDT(60), toUSDT(50)], true],
          { account: buyer.account }
        ),
        "Seller stake ineligible"
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

  // ── Stage 2 — shipment groups + release flows ──────────────
  describe("shipItemsGrouped", function () {
    it("creates a group for an intra order, marks items Shipped, transitions order status", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      // 5-item intra order (10 USDT each = 50 USDT total)
      const prices = [toUSDT(10), toUSDT(10), toUSDT(10), toUSDT(10), toUSDT(10)];
      await escrow.write.createOrderWithItems(
        [seller.account.address, prices, false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });

      // Ship first 3 items
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1], itemIds[2]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );

      let order = await escrow.read.getOrder([1n]);
      assert.equal(order.globalStatus, STATUS_PARTIALLY_SHIPPED);
      assert.equal(order.shipmentGroupCount, 1n);

      for (let i = 0; i < 3; i++) {
        const it = await escrow.read.getItem([itemIds[i]]);
        assert.equal(it.status, ITEM_SHIPPED);
        assert.equal(it.shipmentGroupId, 1n);
      }
      // Items not yet shipped remain Pending
      const pendingItem = await escrow.read.getItem([itemIds[3]]);
      assert.equal(pendingItem.status, ITEM_PENDING);
    });

    it("transitions to AllShipped after the last items are grouped", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      const prices = [toUSDT(10), toUSDT(10), toUSDT(10), toUSDT(10), toUSDT(10)];
      await escrow.write.createOrderWithItems(
        [seller.account.address, prices, false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);

      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1], itemIds[2]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[3], itemIds[4]], "0x" + "bb".repeat(32)],
        { account: seller.account }
      );

      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.globalStatus, STATUS_ALL_SHIPPED);
      assert.equal(order.shipmentGroupCount, 2n);
    });

    it("releases 20% net to the seller for a cross-border ship", async function () {
      const { escrow, mockUSDT, buyer, seller } = await deployEscrow(viem);
      // 2 items × 40 = 80 USDT total, cross-border (fits Tier 1 cap 100)
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(40), toUSDT(40)], true],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });

      const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1]], "0x" + "cc".repeat(32)],
        { account: seller.account }
      );

      // Per-item commission = 40 × 2.7% = 1.08 USDT → net = 38.92 USDT
      // 20% of net = 7.784 USDT per item; 2 items → 15.568 USDT released
      const expectedRelease = ((toUSDT(40) - toUSDT(108) / 100n) * 2000n) / 10000n * 2n;
      const sellerAfter = await mockUSDT.read.balanceOf([seller.account.address]);
      assert.equal(sellerAfter - sellerBefore, expectedRelease);

      const group = await escrow.read.getShipmentGroup([1n]);
      assert.equal(group.releaseStage, 1);
      assert.equal(group.status, SHIP_SHIPPED);
    });

    it("rejects shipItemsGrouped from a non-seller caller", async function () {
      const { escrow, buyer, seller, nonParty } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await expectRevert(
        escrow.write.shipItemsGrouped(
          [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
          { account: nonParty.account }
        ),
        "Only seller"
      );
    });

    it("rejects a group containing more than MAX_ITEMS_PER_GROUP (20) items", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      // 25 items × 10 USDT each = 250 USDT total (under MAX_ORDER=500)
      const prices = new Array(25).fill(toUSDT(10));
      await escrow.write.createOrderWithItems(
        [seller.account.address, prices, false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      // Try to ship all 25 in one group (exceeds 20 cap).
      await expectRevert(
        escrow.write.shipItemsGrouped(
          [1n, itemIds as any, "0x" + "aa".repeat(32)],
          { account: seller.account }
        ),
        "Invalid group size"
      );
    });

    it("rejects shipping an item that is already assigned to another group", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10), toUSDT(10)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );
      await expectRevert(
        escrow.write.shipItemsGrouped(
          [1n, [itemIds[0]], "0x" + "bb".repeat(32)],
          { account: seller.account }
        ),
        "Item not Pending"
      );
    });
  });

  describe("markGroupArrived", function () {
    it("sets arrival timers and transitions items to Arrived for a cross-border group", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], true],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );
      await escrow.write.markGroupArrived(
        [1n, 1n, "0x" + "bb".repeat(32)],
        { account: buyer.account }
      );

      const group = await escrow.read.getShipmentGroup([1n]);
      assert.equal(group.status, SHIP_ARRIVED);
      assert.ok(group.arrivedAt > 0n);
      assert.ok(group.majorityReleaseAt > group.arrivedAt);
      assert.ok(group.finalReleaseAfter > group.arrivedAt);

      const item = await escrow.read.getItem([itemIds[0]]);
      assert.equal(item.status, ITEM_ARRIVED);
    });

    it("rejects markGroupArrived for an intra order", async function () {
      const { escrow, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );
      await expectRevert(
        escrow.write.markGroupArrived(
          [1n, 1n, "0x" + "bb".repeat(32)],
          { account: buyer.account }
        ),
        "Intra order has no arrival step"
      );
    });
  });

  describe("release flows", function () {
    it("confirmItemDelivery intra releases full net to seller and commission to treasury", async function () {
      const { escrow, mockUSDT, buyer, seller, commissionTreasury } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );

      const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryBefore = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);
      await escrow.write.confirmItemDelivery([1n, itemIds[0]], {
        account: buyer.account,
      });
      const sellerAfter = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryAfter = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);

      // Intra 1.8% commission on 50 = 0.9 USDT
      const commission = (toUSDT(50) * 180n) / 10000n;
      const net = toUSDT(50) - commission;
      assert.equal(sellerAfter - sellerBefore, net);
      assert.equal(treasuryAfter - treasuryBefore, commission);

      const item = await escrow.read.getItem([itemIds[0]]);
      assert.equal(item.status, ITEM_RELEASED);
    });

    it("confirmItemDelivery cross-border after 20% ship releases the remaining 80% net + commission", async function () {
      const { escrow, mockUSDT, buyer, seller, commissionTreasury } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(50)], true],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );

      // After ship, seller has 20% of net already
      const commission = (toUSDT(50) * 270n) / 10000n;
      const net = toUSDT(50) - commission;
      const shipRelease = (net * 2000n) / 10000n;

      const sellerBeforeConfirm = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryBefore = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);
      await escrow.write.confirmItemDelivery([1n, itemIds[0]], {
        account: buyer.account,
      });
      const sellerAfter = await mockUSDT.read.balanceOf([seller.account.address]);
      const treasuryAfter = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);

      // Buyer confirm releases the remaining net (net - shipRelease) and full commission
      assert.equal(sellerAfter - sellerBeforeConfirm, net - shipRelease);
      assert.equal(treasuryAfter - treasuryBefore, commission);
    });

    it("confirmGroupDelivery batch-releases every non-terminal item in the group", async function () {
      const { escrow, mockUSDT, buyer, seller, commissionTreasury } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(10), toUSDT(20), toUSDT(30)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1], itemIds[2]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );

      const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
      await escrow.write.confirmGroupDelivery([1n, 1n], { account: buyer.account });
      const sellerAfter = await mockUSDT.read.balanceOf([seller.account.address]);

      const commission = (toUSDT(60) * 180n) / 10000n;
      const net = toUSDT(60) - commission;
      assert.equal(sellerAfter - sellerBefore, net);

      for (const id of itemIds as any) {
        const it = await escrow.read.getItem([id]);
        assert.equal(it.status, ITEM_RELEASED);
      }
    });

    it("applies the Top Seller (1.2%) commission rate for an intra order", async function () {
      const { escrow, reputation, buyer, seller } = await deployEscrow(viem);
      await grantTopSeller(reputation, seller);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(100)], false],
        { account: buyer.account }
      );
      const order = await escrow.read.getOrder([1n]);
      // Top Seller intra: 100 × 1.2% = 1.2 USDT
      assert.equal(order.totalCommission, (toUSDT(100) * 120n) / 10000n);
    });

    it("completes the order and decrements cross-border active sales after all items are released", async function () {
      const { escrow, stake, buyer, seller } = await deployEscrow(viem);
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(40), toUSDT(40)], true],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });
      assert.equal(await stake.read.getActiveSales([seller.account.address]), 1n);

      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );
      await escrow.write.confirmItemDelivery([1n, itemIds[0]], { account: buyer.account });
      await escrow.write.confirmItemDelivery([1n, itemIds[1]], { account: buyer.account });

      const order = await escrow.read.getOrder([1n]);
      assert.equal(order.globalStatus, STATUS_COMPLETED);
      assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);
    });

    it("pro-rata commission paid to treasury sums to the order's totalCommission (dust-free)", async function () {
      const { escrow, mockUSDT, buyer, seller, commissionTreasury } = await deployEscrow(viem);
      // Prices chosen so pro-rata introduces dust: 7, 11, 13 USDT
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(7), toUSDT(11), toUSDT(13)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([1n], { account: buyer.account });

      const order = await escrow.read.getOrder([1n]);
      const expectedCommission = order.totalCommission;

      const itemIds = await escrow.read.getOrderItems([1n]);
      await escrow.write.shipItemsGrouped(
        [1n, [itemIds[0], itemIds[1], itemIds[2]], "0x" + "aa".repeat(32)],
        { account: seller.account }
      );

      const treasuryBefore = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);
      await escrow.write.confirmGroupDelivery([1n, 1n], { account: buyer.account });
      const treasuryAfter = await mockUSDT.read.balanceOf([commissionTreasury.account.address]);
      assert.equal(treasuryAfter - treasuryBefore, expectedCommission);
    });
  });
});
