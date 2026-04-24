import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployIntegration,
  grantTopSeller,
  reachTier2Eligibility,
  increaseTime,
  toUSDT,
  expectRevert,
} from "./helpers/fixtures.js";

// OrderStatus
const STATUS_FUNDED = 1;
const STATUS_PARTIALLY_SHIPPED = 2;
const STATUS_ALL_SHIPPED = 3;
const STATUS_COMPLETED = 5;
const STATUS_REFUNDED = 7;

// ItemStatus
const ITEM_RELEASED = 4;
const ITEM_REFUNDED = 6;

// ShipmentStatus
const SHIP_SHIPPED = 1;
const SHIP_ARRIVED = 2;

// StakeTier
const TIER_NONE = 0;
const TIER_ESTABLISHED = 2;

const PROOF_A = "0x" + "aa".repeat(32);
const PROOF_B = "0x" + "bb".repeat(32);
const PROOF_C = "0x" + "cc".repeat(32);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

describe("Integration V2 — end-to-end scenarios", async function () {
  const { viem } = await network.create();

  // ── 1 ─────────────────────────────────────────────────────
  it("1. intra-Africa happy path: create → fund → ship → triggerAutoRelease per item", async function () {
    const { escrow, mockUSDT, reputation, buyer, seller, commissionTreasury, publicClient } =
      await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(30), toUSDT(30)], false],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0], itemIds[1]], PROOF_A], {
      account: seller.account,
    });

    await increaseTime(publicClient, 3 * 24 * 3600 + 1);

    const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
    const treasuryBefore = await mockUSDT.read.balanceOf([
      commissionTreasury.account.address,
    ]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[1]]);

    const commission = (toUSDT(60) * 180n) / 10000n;
    const net = toUSDT(60) - commission;
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerBefore,
      net
    );
    assert.equal(
      (await mockUSDT.read.balanceOf([commissionTreasury.account.address])) -
        treasuryBefore,
      commission
    );

    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_COMPLETED);
    const rep = await reputation.read.getReputation([seller.account.address]);
    assert.equal(rep.ordersCompleted, 2n);
  });

  // ── 2 ─────────────────────────────────────────────────────
  it("2. cross-border 20/70/10 progressive release lifecycle", async function () {
    const { escrow, mockUSDT, stake, buyer, seller, commissionTreasury, publicClient } =
      await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);

    const commission = (toUSDT(50) * 270n) / 10000n;
    const net = toUSDT(50) - commission;
    const sellerStart = await mockUSDT.read.balanceOf([seller.account.address]);

    // Ship — 20% of net
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    const expectedShip = (net * 2000n) / 10000n;
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerStart,
      expectedShip
    );

    // Arrive + 72h + majority — 70% of net
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], {
      account: buyer.account,
    });
    await increaseTime(publicClient, 72 * 3600 + 1);
    await escrow.write.triggerMajorityRelease([1n, 1n]);
    const expectedMajority = (net * 7000n) / 10000n;
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerStart,
      expectedShip + expectedMajority
    );

    // 5 days total from arrival → final 10% + commission
    await increaseTime(publicClient, 5 * 24 * 3600 - 72 * 3600 + 60);
    const treasuryBefore = await mockUSDT.read.balanceOf([
      commissionTreasury.account.address,
    ]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);

    // Cumulative seller = full net; treasury = full commission
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerStart,
      net
    );
    assert.equal(
      (await mockUSDT.read.balanceOf([commissionTreasury.account.address])) -
        treasuryBefore,
      commission
    );
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);
  });

  // ── 3 ─────────────────────────────────────────────────────
  it("3. disputed item isolation: siblings complete, treasury sum is exact", async function () {
    const {
      escrow,
      mockUSDT,
      stake,
      dispute,
      buyer,
      seller,
      commissionTreasury,
      publicClient,
    } = await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(20), toUSDT(20), toUSDT(20), toUSDT(20)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped(
      [1n, [itemIds[0], itemIds[1], itemIds[2], itemIds[3]], PROOF_A],
      { account: seller.account }
    );
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });

    // Dispute item 2 and resolve N1 amicable at refund=10
    await dispute.write.openDispute([1n, itemIds[1], "issue"], {
      account: buyer.account,
    });
    await dispute.write.resolveN1Amicable([1n, toUSDT(10)], { account: buyer.account });
    await dispute.write.resolveN1Amicable([1n, toUSDT(10)], { account: seller.account });

    // Majority release on group (items 1/3/4 get 70%; item 2 is now Released and skipped)
    await increaseTime(publicClient, 72 * 3600 + 1);
    await escrow.write.triggerMajorityRelease([1n, 1n]);

    // Final auto-release for the 3 non-disputed items
    await increaseTime(publicClient, 5 * 24 * 3600 - 72 * 3600 + 60);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[2]]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[3]]);

    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_COMPLETED);
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);

    const item2 = await escrow.read.getItem([itemIds[1]]);
    assert.equal(item2.status, ITEM_RELEASED);

    // Treasury assertion (user's explicit request): full commission of items 1/3/4
    // plus the commissionShare from item 2's resolveItemDispute.
    // itemCommission = 20 × 2.7% = 0.54 USDT = 540_000 per item.
    // remainingInEscrow(item2) = 20 - 20%×net(19.46) = 20 - 3.892 = 16.108
    // remainingAfterRefund = 16.108 - 10 = 6.108
    // commissionShare = 6.108 × 0.54 / 20 = 0.164916
    const perItemCommission = (toUSDT(20) * 270n) / 10000n;
    const perItemNet = toUSDT(20) - perItemCommission;
    const shipReleasePerItem = (perItemNet * 2000n) / 10000n;
    const remainingInEscrow = toUSDT(20) - shipReleasePerItem;
    const remainingAfterRefund = remainingInEscrow - toUSDT(10);
    const commissionShareItem2 = (remainingAfterRefund * perItemCommission) / toUSDT(20);
    const expectedTreasury = perItemCommission * 3n + commissionShareItem2;
    assert.equal(
      await mockUSDT.read.balanceOf([commissionTreasury.account.address]),
      expectedTreasury
    );
  });

  // ── 4 ─────────────────────────────────────────────────────
  it("4. seller fraud → N2 mediator refund + slash → stake auto-downgrade (ADR-028)", async function () {
    const { escrow, stake, dispute, reputation, buyer, seller, mediator } =
      await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });

    // Open dispute + escalate + assign mediator + resolve
    await dispute.write.openDispute([1n, itemIds[0], "fraud"], {
      account: buyer.account,
    });
    await dispute.write.escalateToMediation([1n], { account: buyer.account });
    await dispute.write.assignN2Mediator([1n, mediator.account.address]);
    await dispute.write.resolveN2Mediation([1n, toUSDT(25), toUSDT(5)], {
      account: mediator.account,
    });

    // Stake originally 10 USDT; slashed by 5 → remaining 5; auto-downgrade → None
    assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(5));
    assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);

    // Active sales back to 0
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);

    // Reputation: a dispute was recorded as lost (refundAmount > 0)
    const rep = await reputation.read.getReputation([seller.account.address]);
    assert.equal(rep.disputesLost, 1n);
  });

  // ── 5 ─────────────────────────────────────────────────────
  it("5. 14-day inactivity auto-refund (cross-border), permissionless trigger", async function () {
    const { escrow, mockUSDT, stake, buyer, seller, nonParty, publicClient } =
      await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 1n);

    await increaseTime(publicClient, 14 * 24 * 3600 + 1);

    const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
    // Third-party (nonParty) triggers — the trigger is permissionless
    await escrow.write.triggerAutoRefundIfInactive([1n], { account: nonParty.account });

    assert.equal(
      (await mockUSDT.read.balanceOf([buyer.account.address])) - buyerBefore,
      toUSDT(50)
    );
    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_REFUNDED);
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);
  });

  // ── 6 ─────────────────────────────────────────────────────
  it("6. Top Seller path: 1.2% commission + 2-day intra auto-release", async function () {
    const { escrow, mockUSDT, reputation, buyer, seller, commissionTreasury, publicClient } =
      await deployIntegration(viem);

    await grantTopSeller(reputation, seller);
    assert.equal(await reputation.read.isTopSeller([seller.account.address]), true);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(40)], false],
      { account: buyer.account }
    );
    const order = await escrow.read.getOrder([1n]);
    // 40 × 1.2% = 0.48 USDT
    assert.equal(order.totalCommission, (toUSDT(40) * 120n) / 10000n);

    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });

    // Release before the 2-day window reverts; after 2 days it succeeds.
    await expectRevert(
      escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]),
      "Final release not yet"
    );
    await increaseTime(publicClient, 2 * 24 * 3600 + 1);

    const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
    const treasuryBefore = await mockUSDT.read.balanceOf([
      commissionTreasury.account.address,
    ]);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);

    const commission = (toUSDT(40) * 120n) / 10000n;
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerBefore,
      toUSDT(40) - commission
    );
    assert.equal(
      (await mockUSDT.read.balanceOf([commissionTreasury.account.address])) -
        treasuryBefore,
      commission
    );
  });

  // ── 7 ─────────────────────────────────────────────────────
  it("7. stake tier upgrade mid-cycle (T1 → T2 while an active sale is in progress)", async function () {
    const { escrow, stake, reputation, buyer, seller, publicClient } =
      await deployIntegration(viem);

    // Open a cross-border sale (activeSales = 1)
    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 1n);

    // Reach Tier 2 eligibility (20 orders + 60 days since firstOrderAt)
    await reachTier2Eligibility(reputation, seller, publicClient);

    // Upgrade to Tier 2 while a cross-border sale is active — should succeed
    await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
    assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));

    // Order continues normally through ship + auto-release
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });
    await increaseTime(publicClient, 5 * 24 * 3600 + 60);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);
    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_COMPLETED);
  });

  // ── 8 ─────────────────────────────────────────────────────
  it("8. stake withdrawal after completing all sales returns full stake", async function () {
    const { escrow, mockUSDT, stake, buyer, seller, publicClient } =
      await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(40)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });
    await increaseTime(publicClient, 5 * 24 * 3600 + 60);
    await escrow.write.triggerAutoReleaseForItem([1n, itemIds[0]]);
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);

    // Withdraw full stake
    await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
    await increaseTime(publicClient, 14 * 24 * 3600 + 1);

    const sellerBefore = await mockUSDT.read.balanceOf([seller.account.address]);
    await stake.write.executeWithdrawal({ account: seller.account });
    assert.equal(
      (await mockUSDT.read.balanceOf([seller.account.address])) - sellerBefore,
      toUSDT(10)
    );
    assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
    assert.equal(await stake.read.getStake([seller.account.address]), 0n);
  });

  // ── 9 ─────────────────────────────────────────────────────
  it("9. concurrent disputes: freezeCount transitions 0 → 1 → 2 → 1 → 0 as each resolves", async function () {
    const { escrow, stake, dispute, buyer, seller } = await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(30), toUSDT(30), toUSDT(30)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped(
      [1n, [itemIds[0], itemIds[1], itemIds[2]], PROOF_A],
      { account: seller.account }
    );
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });

    const getFreeze = async () => {
      const [, , , , , fc] = await stake.read.getWithdrawal([seller.account.address]);
      return fc;
    };

    assert.equal(await getFreeze(), 0n);

    await dispute.write.openDispute([1n, itemIds[0], "bad 1"], {
      account: buyer.account,
    });
    assert.equal(await getFreeze(), 1n);

    await dispute.write.openDispute([1n, itemIds[1], "bad 2"], {
      account: buyer.account,
    });
    assert.equal(await getFreeze(), 2n);

    // Resolve dispute 1 (N1 bilateral, refund 10)
    await dispute.write.resolveN1Amicable([1n, toUSDT(10)], { account: buyer.account });
    await dispute.write.resolveN1Amicable([1n, toUSDT(10)], { account: seller.account });
    assert.equal(await getFreeze(), 1n);

    // Resolve dispute 2 (N1 bilateral, refund 5)
    await dispute.write.resolveN1Amicable([2n, toUSDT(5)], { account: buyer.account });
    await dispute.write.resolveN1Amicable([2n, toUSDT(5)], { account: seller.account });
    assert.equal(await getFreeze(), 0n);
  });

  // ── 10 ────────────────────────────────────────────────────
  it("10. N3 vote escalation with partial release (ADR-029 regression guard)", async function () {
    const { escrow, mockUSDT, dispute, voting, buyer, seller, mediator, mediator2, mediator3, publicClient } =
      await deployIntegration(viem);

    // 40 USDT cross-border 1-item (fits Tier 1 cap 100)
    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(40)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    const itemAfterShip = await escrow.read.getItem([itemIds[0]]);
    const released = itemAfterShip.releasedAmount;
    await escrow.write.markGroupArrived([1n, 1n, PROOF_B], { account: buyer.account });

    // Open dispute, buyer escalates N1→N2→N3 directly (buyer may escalate at any time)
    await dispute.write.openDispute([1n, itemIds[0], "N3 case"], {
      account: buyer.account,
    });
    await dispute.write.escalateToMediation([1n], { account: buyer.account });
    await dispute.write.escalateToVoting([1n], { account: buyer.account });

    // Three mediators vote favorBuyer=true
    await voting.write.submitVote([1n, true], { account: mediator.account });
    await voting.write.submitVote([1n, true], { account: mediator2.account });
    await voting.write.submitVote([1n, true], { account: mediator3.account });

    await increaseTime(publicClient, 14 * 24 * 3600 + 1);
    const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);

    // Finalize → callback into dispute.resolveFromVote(voteId, true)
    // Per ADR-029: refundAmount = itemPrice - released (not full itemPrice),
    // so the 20% shipping release stays with the seller.
    await voting.write.finalizeVote([1n]);

    const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
    assert.equal(buyerAfter - buyerBefore, toUSDT(40) - released);

    const item = await escrow.read.getItem([itemIds[0]]);
    assert.equal(item.status, ITEM_RELEASED);
    const [, , , resolved] = await dispute.read.getDispute([1n]);
    assert.equal(resolved, true);
  });

  // ── 11 ────────────────────────────────────────────────────
  it("11. forceRefund after 90 days with legal hold (ADR-023 three conditions)", async function () {
    const { escrow, mockUSDT, buyer, seller, publicClient } = await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], false],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });

    // Satisfy the three ADR-023 conditions
    await escrow.write.setDisputeContract([ZERO_ADDR]);
    await escrow.write.registerLegalHold([1n, "0x" + "dd".repeat(32)]);
    await increaseTime(publicClient, 91 * 24 * 3600);

    const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
    await escrow.write.forceRefund([1n, "0x" + "ee".repeat(32)]);
    const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);
    assert.equal(buyerAfter - buyerBefore, toUSDT(50));

    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_REFUNDED);
  });

  // ── 12 ────────────────────────────────────────────────────
  it("12. emergencyPause during active order blocks ship; unblocks after 7 days", async function () {
    const { escrow, buyer, seller, publicClient } = await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], false],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });

    await escrow.write.emergencyPause();
    const itemIds = await escrow.read.getOrderItems([1n]);
    await expectRevert(
      escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
        account: seller.account,
      }),
      "Contract paused"
    );

    await increaseTime(publicClient, 7 * 24 * 3600 + 1);
    await escrow.write.shipItemsGrouped([1n, [itemIds[0]], PROOF_A], {
      account: seller.account,
    });
    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_ALL_SHIPPED);
  });

  // ── 13 ────────────────────────────────────────────────────
  it('13. TVL cap: 101st fund reverts with exact message "Global TVL cap reached"', async function () {
    const { escrow, seller, seller2, buyer, wallets } = await deployIntegration(viem);

    // 10 distinct sellers × 10 orders × 500 USDT intra = 50,000 USDT TVL
    const sellers = [seller, seller2, wallets[11], wallets[12], wallets[13], wallets[14], wallets[15], wallets[16], wallets[17], wallets[18]];
    let orderId = 0n;
    for (const s of sellers) {
      for (let i = 0; i < 10; i++) {
        await escrow.write.createOrderWithItems(
          [s.account.address, [toUSDT(500)], false],
          { account: buyer.account }
        );
        orderId++;
        await escrow.write.fundOrder([orderId], { account: buyer.account });
      }
    }
    assert.equal(await escrow.read.totalEscrowed(), toUSDT(50_000));

    // 101st order of any size reverts on the TVL check
    await escrow.write.createOrderWithItems(
      [wallets[11].account.address, [toUSDT(1)], false],
      { account: buyer.account }
    );
    orderId++;
    await expectRevert(
      escrow.write.fundOrder([orderId], { account: buyer.account }),
      "Global TVL cap reached"
    );
  });

  // ── 14 ────────────────────────────────────────────────────
  it('14. weekly seller cap: 11th fund reverts with exact message "Seller weekly cap"', async function () {
    const { escrow, buyer, seller } = await deployIntegration(viem);

    // 10 orders × 500 USDT intra = 5,000 USDT (MAX_SELLER_WEEKLY_VOLUME)
    for (let i = 1; i <= 10; i++) {
      await escrow.write.createOrderWithItems(
        [seller.account.address, [toUSDT(500)], false],
        { account: buyer.account }
      );
      await escrow.write.fundOrder([BigInt(i)], { account: buyer.account });
    }

    // 11th order of 1 USDT trips the weekly cap (TVL still under 50k)
    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(1)], false],
      { account: buyer.account }
    );
    await expectRevert(
      escrow.write.fundOrder([11n], { account: buyer.account }),
      "Seller weekly cap"
    );
  });

  // ── 15b — ADR-031 regression guard ────────────────────────
  it("15b. disputed item blocks auto-refund; buyer recovers via N3 escalation (ADR-031)", async function () {
    const {
      escrow,
      mockUSDT,
      stake,
      dispute,
      voting,
      buyer,
      seller,
      mediator,
      mediator2,
      mediator3,
      publicClient,
    } = await deployIntegration(viem);

    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(50)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);

    // Buyer opens dispute pre-ship (item is Pending).
    await dispute.write.openDispute([1n, itemIds[0], "seller absent"], {
      account: buyer.account,
    });

    await increaseTime(publicClient, 14 * 24 * 3600 + 1);

    // Auto-refund refuses to bulldoze the open dispute.
    await expectRevert(
      escrow.write.triggerAutoRefundIfInactive([1n]),
      "Open dispute blocks auto-refund"
    );

    // Buyer escalates N1 → N2 → N3 directly (buyer may escalate at any time).
    await dispute.write.escalateToMediation([1n], { account: buyer.account });
    await dispute.write.escalateToVoting([1n], { account: buyer.account });

    // Three mediators vote for buyer.
    await voting.write.submitVote([1n, true], { account: mediator.account });
    await voting.write.submitVote([1n, true], { account: mediator2.account });
    await voting.write.submitVote([1n, true], { account: mediator3.account });

    await increaseTime(publicClient, 14 * 24 * 3600 + 1);

    const buyerBefore = await mockUSDT.read.balanceOf([buyer.account.address]);
    await voting.write.finalizeVote([1n]);
    const buyerAfter = await mockUSDT.read.balanceOf([buyer.account.address]);

    // Pre-ship: item.releasedAmount == 0 → full itemPrice refunded to buyer.
    assert.equal(buyerAfter - buyerBefore, toUSDT(50));

    // Stake freezeCount cleared + cross-border active sales back to 0.
    const [, , , , , freezeCount] = await stake.read.getWithdrawal([
      seller.account.address,
    ]);
    assert.equal(freezeCount, 0n);
    assert.equal(await stake.read.getActiveSales([seller.account.address]), 0n);
  });

  // ── 15 ────────────────────────────────────────────────────
  it("15. multiple shipment groups with mixed statuses (one Arrived, one Shipped)", async function () {
    const { escrow, buyer, seller, publicClient } = await deployIntegration(viem);

    // 4-item cross-border 20 USDT each = 80 USDT (fits Tier 1 cap 100)
    await escrow.write.createOrderWithItems(
      [seller.account.address, [toUSDT(20), toUSDT(20), toUSDT(20), toUSDT(20)], true],
      { account: buyer.account }
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });
    const itemIds = await escrow.read.getOrderItems([1n]);

    // Ship items 1-2 in group 1
    await escrow.write.shipItemsGrouped([1n, [itemIds[0], itemIds[1]], PROOF_A], {
      account: seller.account,
    });
    // Ship items 3-4 in group 2
    await escrow.write.shipItemsGrouped([1n, [itemIds[2], itemIds[3]], PROOF_B], {
      account: seller.account,
    });

    // Only group 1 arrives; group 2 stays Shipped.
    await escrow.write.markGroupArrived([1n, 1n, PROOF_C], { account: buyer.account });

    await increaseTime(publicClient, 72 * 3600 + 1);
    await escrow.write.triggerMajorityRelease([1n, 1n]);

    const group1 = await escrow.read.getShipmentGroup([1n]);
    const group2 = await escrow.read.getShipmentGroup([2n]);
    assert.equal(group1.status, SHIP_ARRIVED);
    assert.equal(group2.status, SHIP_SHIPPED);
    assert.equal(group1.releaseStage, 2);
    assert.equal(group2.releaseStage, 1);

    // Items 1/2 have released 90% of net; items 3/4 only 20%
    const perItemNet = toUSDT(20) - (toUSDT(20) * 270n) / 10000n;
    const expectedGroup1Per = (perItemNet * 9000n) / 10000n;
    const expectedGroup2Per = (perItemNet * 2000n) / 10000n;
    for (const [i, expected] of [
      [0, expectedGroup1Per],
      [1, expectedGroup1Per],
      [2, expectedGroup2Per],
      [3, expectedGroup2Per],
    ] as const) {
      const it = await escrow.read.getItem([itemIds[i]]);
      assert.equal(it.releasedAmount, expected);
    }

    const order = await escrow.read.getOrder([1n]);
    assert.equal(order.globalStatus, STATUS_ALL_SHIPPED);
  });
});
