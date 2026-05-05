/**
 * H-1 fix happy-path regression — funded dispute resolves correctly
 *
 * The H-1 fix adds three `require(... > 0, "Order not funded")` guards
 * in EtaloDispute.openDispute, EtaloEscrow.markItemDisputed and
 * EtaloEscrow.resolveItemDispute. This test verifies that the guards
 * do NOT break the legitimate dispute flow on a funded order :
 *
 *   1. Buyer creates + funds order (intra-Africa, 100 USDT, 1 item)
 *   2. Buyer opens dispute on the funded item
 *   3. Buyer + seller bilaterally match resolveN1Amicable with a
 *      partial refund (40 USDT)
 *   4. Distribution executes :
 *        - buyer receives 40 USDT (refund)
 *        - seller receives 58.92 USDT (net = remainingAfterRefund - commissionShare)
 *        - commissionTreasury receives 1.08 USDT (proportional commission)
 *        - escrow custody = 0 (fully drained per legitimate accounting)
 *        - totalEscrowedAmount = 0
 *        - item.status = Released (refundAmount != itemPrice)
 *        - dispute.resolved = true
 *
 * Math (intra-Africa, 1.80% commission per ADR-014 + ADR-026) :
 *   itemPrice           = 100_000_000 raw (100 USDT)
 *   itemCommission      =   1_800_000 raw (1.80 USDT, 180 bps of price)
 *   refundAmount        =  40_000_000 raw (40 USDT, partial)
 *   remainingInEscrow   = 100_000_000 raw (no prior release)
 *   remainingAfterRefund= 100_000_000 - 40_000_000 = 60_000_000 raw
 *   commissionShare     = (60_000_000 × 1_800_000) / 100_000_000 = 1_080_000 raw
 *   netShare            = 60_000_000 - 1_080_000 = 58_920_000 raw (58.92 USDT)
 *   buyer + seller + treasury = 40 + 58.92 + 1.08 = 100 USDT (full custody return, no dust)
 *
 * If the H-1 fix's `require(order.fundedAt > 0)` were misplaced or
 * referenced the wrong field, this test would either revert (false
 * positive on Layer 1) or distribute incorrectly. Test passes →
 * funded dispute flow intact.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployIntegration,
  toUSDT,
} from "../helpers/fixtures.js";

describe("H-1 fix happy-path — funded order dispute resolves correctly", async function () {
  const { viem } = await network.create();

  it("funded → openDispute → resolveN1Amicable (partial refund) → correct distribution", async function () {
    const {
      mockUSDT,
      escrow,
      dispute,
      buyer,
      seller,
      commissionTreasury,
    } = await deployIntegration(viem);

    const ITEM_PRICE = toUSDT(100); // 100 USDT
    const REFUND_AMOUNT = toUSDT(40); // 40 USDT partial refund
    const EXPECTED_COMMISSION = 1_080_000n; // 1.08 USDT (computed above)
    const EXPECTED_NET_TO_SELLER = 58_920_000n; // 58.92 USDT

    // ─────────────────────────────────────────────────────────
    // Step 1 — buyer creates + funds order
    // ─────────────────────────────────────────────────────────
    await escrow.write.createOrderWithItems(
      [seller.account.address, [ITEM_PRICE], false], // intra-Africa
      { account: buyer.account },
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });

    // Snapshot all balances post-fund
    const buyerBalanceAfterFund = (await mockUSDT.read.balanceOf([
      buyer.account.address,
    ])) as bigint;
    const sellerBalanceAfterFund = (await mockUSDT.read.balanceOf([
      seller.account.address,
    ])) as bigint;
    const treasuryBalanceAfterFund = (await mockUSDT.read.balanceOf([
      commissionTreasury.account.address,
    ])) as bigint;
    const escrowBalanceAfterFund = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    const totalEscrowedAfterFund = (await escrow.read.totalEscrowed()) as bigint;

    assert.equal(
      escrowBalanceAfterFund,
      ITEM_PRICE,
      "Setup : escrow custody should equal funded amount",
    );
    assert.equal(
      totalEscrowedAfterFund,
      ITEM_PRICE,
      "Setup : totalEscrowedAmount should match funded amount",
    );

    // ─────────────────────────────────────────────────────────
    // Step 2 — buyer opens dispute on the funded item (post-fix MUST succeed)
    // ─────────────────────────────────────────────────────────
    // This is the critical assertion : the fix's Layer 1 guard
    // (require(order.fundedAt > 0)) must NOT block a legitimate
    // dispute on a funded order.
    await dispute.write.openDispute([1n, 1n, "item not as described"], {
      account: buyer.account,
    });

    // getDispute returns tuple (orderId, itemId, level, resolved)
    const [openedOrderId, openedItemId, openedLevel, openedResolved] =
      (await dispute.read.getDispute([1n])) as readonly [
        bigint,
        bigint,
        number,
        boolean,
      ];
    assert.equal(openedOrderId, 1n, "Dispute should reference orderId 1");
    assert.equal(openedItemId, 1n, "Dispute should reference itemId 1");
    assert.equal(openedLevel, 1, "Dispute should be at LEVEL_N1");
    assert.equal(openedResolved, false, "Dispute should NOT be resolved yet");

    // hasActiveDisputeForItem confirms the open state via the
    // dispute-by-item mapping (covers a different storage path than
    // getDispute, so a duplicate sanity check is cheap).
    const isActiveBeforeResolve = (await dispute.read.hasActiveDisputeForItem([
      1n,
      1n,
    ])) as boolean;
    assert.equal(
      isActiveBeforeResolve,
      true,
      "hasActiveDisputeForItem should be true after openDispute",
    );

    // ─────────────────────────────────────────────────────────
    // Step 3 — buyer + seller bilaterally match resolveN1Amicable
    // ─────────────────────────────────────────────────────────
    // First call records the buyer's proposal. Second call (matching
    // amount from the counterparty) triggers _applyResolution which
    // calls escrow.resolveItemDispute(orderId, itemId, refundAmount).
    await dispute.write.resolveN1Amicable([1n, REFUND_AMOUNT], {
      account: buyer.account,
    });
    await dispute.write.resolveN1Amicable([1n, REFUND_AMOUNT], {
      account: seller.account,
    });

    // ─────────────────────────────────────────────────────────
    // Step 4 — verify correct distribution
    // ─────────────────────────────────────────────────────────
    const buyerBalanceAfterResolve = (await mockUSDT.read.balanceOf([
      buyer.account.address,
    ])) as bigint;
    const sellerBalanceAfterResolve = (await mockUSDT.read.balanceOf([
      seller.account.address,
    ])) as bigint;
    const treasuryBalanceAfterResolve = (await mockUSDT.read.balanceOf([
      commissionTreasury.account.address,
    ])) as bigint;
    const escrowBalanceAfterResolve = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    const totalEscrowedAfterResolve = (await escrow.read.totalEscrowed()) as bigint;

    const buyerDelta = buyerBalanceAfterResolve - buyerBalanceAfterFund;
    const sellerDelta = sellerBalanceAfterResolve - sellerBalanceAfterFund;
    const treasuryDelta = treasuryBalanceAfterResolve - treasuryBalanceAfterFund;
    const escrowDelta = escrowBalanceAfterFund - escrowBalanceAfterResolve;

    assert.equal(
      buyerDelta,
      REFUND_AMOUNT,
      `Buyer should receive partial refund of ${REFUND_AMOUNT} raw`,
    );
    assert.equal(
      sellerDelta,
      EXPECTED_NET_TO_SELLER,
      `Seller should receive net ${EXPECTED_NET_TO_SELLER} raw (remainingAfterRefund - commissionShare)`,
    );
    assert.equal(
      treasuryDelta,
      EXPECTED_COMMISSION,
      `Treasury should receive proportional commission ${EXPECTED_COMMISSION} raw`,
    );
    assert.equal(
      escrowDelta,
      ITEM_PRICE,
      "Escrow custody should be fully drained (refund + net + commission == itemPrice)",
    );
    assert.equal(
      escrowBalanceAfterResolve,
      0n,
      "Escrow USDT balance should be 0 after full distribution",
    );
    assert.equal(
      totalEscrowedAfterResolve,
      0n,
      "totalEscrowedAmount should be 0 after dispute resolution",
    );

    // No dust : buyer + seller + treasury = itemPrice exactly
    assert.equal(
      buyerDelta + sellerDelta + treasuryDelta,
      ITEM_PRICE,
      "Distribution should sum to itemPrice with zero dust",
    );

    // Dispute should now be marked resolved
    const [, , , resolvedAfter] = (await dispute.read.getDispute([1n])) as readonly [
      bigint,
      bigint,
      number,
      boolean,
    ];
    assert.equal(
      resolvedAfter,
      true,
      "Dispute should be marked resolved after bilateral match",
    );
    const isActiveAfterResolve = (await dispute.read.hasActiveDisputeForItem([
      1n,
      1n,
    ])) as boolean;
    assert.equal(
      isActiveAfterResolve,
      false,
      "hasActiveDisputeForItem should be false after resolution",
    );
  });
});
