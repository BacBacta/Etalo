import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployStake,
  grantTopSeller,
  reachTier2Eligibility,
  increaseTime,
  toUSDT,
  expectRevert,
} from "./helpers/fixtures.js";

// StakeTier enum encoding (EtaloTypes.StakeTier)
const TIER_NONE = 0;
const TIER_STARTER = 1;
const TIER_ESTABLISHED = 2;
const TIER_TOPSELLER = 3;

describe("EtaloStake", async function () {
  const { viem } = await network.create();

  // ── depositStake ──────────────────────────────────────────
  describe("depositStake", function () {
    it("should deposit Tier 1 (10 USDT) and update state + balance", async function () {
      const { stake, mockUSDT, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(10));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_STARTER);
      assert.equal(await mockUSDT.read.balanceOf([stake.address]), toUSDT(10));
    });

    it("should reject Tier 2 deposit without eligibility", async function () {
      const { stake, seller } = await deployStake(viem);
      await expectRevert(
        stake.write.depositStake([TIER_ESTABLISHED], { account: seller.account }),
        "Tier 2"
      );
    });

    it("should accept Tier 2 deposit after 20+ orders and 60+ days", async function () {
      const { stake, reputation, seller, publicClient } = await deployStake(viem);
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.depositStake([TIER_ESTABLISHED], { account: seller.account });
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    });

    it("should gate Tier 3 on Top Seller badge (revert then succeed)", async function () {
      const { stake, reputation, seller } = await deployStake(viem);
      await expectRevert(
        stake.write.depositStake([TIER_TOPSELLER], { account: seller.account }),
        "Top Seller"
      );
      await grantTopSeller(reputation, seller);
      await stake.write.depositStake([TIER_TOPSELLER], { account: seller.account });
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(50));
    });

    it("should reject re-deposit and reject Tier.None", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await expectRevert(
        stake.write.depositStake([TIER_STARTER], { account: seller.account }),
        "Already staked"
      );

      const fresh = await deployStake(viem);
      await expectRevert(
        fresh.stake.write.depositStake([TIER_NONE], { account: fresh.seller.account }),
        "Invalid tier"
      );
    });
  });

  // ── upgradeTier ───────────────────────────────────────────
  describe("upgradeTier", function () {
    it("should upgrade T1 → T2 with +15 USDT delta", async function () {
      const { stake, reputation, seller, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    });

    it("should upgrade T2 → T3 with Top Seller and +25 USDT delta", async function () {
      const { stake, reputation, seller, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });

      // Top seller requires 50 total orders (we have 20 from reach); add 30 more.
      for (let i = 20; i < 50; i++) {
        await reputation.write.recordCompletedOrder([
          seller.account.address,
          BigInt(i),
          toUSDT(50),
        ]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      await stake.write.upgradeTier([TIER_TOPSELLER], { account: seller.account });

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(50));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_TOPSELLER);
    });

    it("should reject downgrade direction via upgradeTier", async function () {
      const { stake, reputation, seller, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });

      await expectRevert(
        stake.write.upgradeTier([TIER_STARTER], { account: seller.account }),
        "Not an upgrade"
      );
    });

    it("should reject upgrade during a pending withdrawal", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await expectRevert(
        stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account }),
        "Withdrawal active"
      );
    });
  });

  // ── initiateWithdrawal ────────────────────────────────────
  describe("initiateWithdrawal", function () {
    it("should queue a full exit with 14-day cooldown", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });

      const [amount, targetTier, unlockAt, frozenRemaining, active] =
        await stake.read.getWithdrawal([seller.account.address]);
      assert.equal(amount, toUSDT(10));
      assert.equal(targetTier, TIER_NONE);
      assert.ok(unlockAt > 0n);
      assert.equal(frozenRemaining, 0n);
      assert.equal(active, true);
    });

    it("should queue a T2 → T1 downgrade with 15 USDT delta", async function () {
      const { stake, reputation, seller, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_STARTER], { account: seller.account });

      const [amount, targetTier] = await stake.read.getWithdrawal([seller.account.address]);
      assert.equal(amount, toUSDT(15));
      assert.equal(targetTier, TIER_STARTER);
    });

    it("should reject initiateWithdrawal when activeSales > 0", async function () {
      const { stake, seller, fakeEscrow } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.incrementActiveSales([seller.account.address], {
        account: fakeEscrow.account,
      });
      await expectRevert(
        stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account }),
        "Active cross-border sales"
      );
    });
  });

  // ── executeWithdrawal ─────────────────────────────────────
  describe("executeWithdrawal", function () {
    it("should revert before the cooldown expires", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await expectRevert(
        stake.write.executeWithdrawal({ account: seller.account }),
        "Cooldown"
      );
    });

    it("should execute after 14-day cooldown and return USDT", async function () {
      const { stake, mockUSDT, seller, publicClient } = await deployStake(viem);
      const before = await mockUSDT.read.balanceOf([seller.account.address]);

      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await increaseTime(publicClient, 14 * 24 * 3600 + 1);
      await stake.write.executeWithdrawal({ account: seller.account });

      const after = await mockUSDT.read.balanceOf([seller.account.address]);
      assert.equal(after, before);
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
      assert.equal(await stake.read.getStake([seller.account.address]), 0n);
    });

    it("should revert executeWithdrawal while frozen by a dispute", async function () {
      const { stake, seller, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await stake.write.pauseWithdrawal([seller.account.address, 1n], {
        account: fakeDispute.account,
      });
      await increaseTime(publicClient, 14 * 24 * 3600 + 1);

      await expectRevert(
        stake.write.executeWithdrawal({ account: seller.account }),
        "Frozen"
      );
    });
  });

  // ── cancelWithdrawal ──────────────────────────────────────
  describe("cancelWithdrawal", function () {
    it("should cancel a pending withdrawal and keep the stake intact", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await stake.write.cancelWithdrawal({ account: seller.account });

      const [, , , , active] = await stake.read.getWithdrawal([seller.account.address]);
      assert.equal(active, false);
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(10));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_STARTER);
    });
  });

  // ── pause / resume ────────────────────────────────────────
  describe("pauseWithdrawal / resumeWithdrawal", function () {
    it("pauseWithdrawal captures remaining cooldown on 0 → 1 transition", async function () {
      const { stake, seller, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });

      await increaseTime(publicClient, 5 * 24 * 3600);
      await stake.write.pauseWithdrawal([seller.account.address, 1n], {
        account: fakeDispute.account,
      });

      const [, , unlockAt, frozenRemaining] = await stake.read.getWithdrawal([
        seller.account.address,
      ]);
      assert.equal(unlockAt, 0n);
      // ~9 days remaining (14 - 5), allow ±1 minute tolerance
      const nineDays = 9n * 24n * 3600n;
      assert.ok(frozenRemaining >= nineDays - 60n && frozenRemaining <= nineDays + 60n);
    });

    it("resumeWithdrawal recomputes unlockAt on N → 0 transition", async function () {
      const { stake, seller, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });

      await increaseTime(publicClient, 5 * 24 * 3600);
      await stake.write.pauseWithdrawal([seller.account.address, 1n], {
        account: fakeDispute.account,
      });
      await increaseTime(publicClient, 3 * 24 * 3600); // freeze time doesn't count
      await stake.write.resumeWithdrawal([seller.account.address], {
        account: fakeDispute.account,
      });

      const [, , unlockAtAfter] = await stake.read.getWithdrawal([seller.account.address]);
      assert.ok(unlockAtAfter > 0n);

      // Execute after the remaining ~9 days
      await increaseTime(publicClient, 9 * 24 * 3600 + 60);
      await stake.write.executeWithdrawal({ account: seller.account });
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
    });

    it("multiple pauses require equal resumes before execute", async function () {
      const { stake, seller, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });

      await stake.write.pauseWithdrawal([seller.account.address, 1n], {
        account: fakeDispute.account,
      });
      await stake.write.pauseWithdrawal([seller.account.address, 2n], {
        account: fakeDispute.account,
      });
      await increaseTime(publicClient, 14 * 24 * 3600 + 1);

      await stake.write.resumeWithdrawal([seller.account.address], {
        account: fakeDispute.account,
      });
      await expectRevert(
        stake.write.executeWithdrawal({ account: seller.account }),
        "Frozen"
      );

      await stake.write.resumeWithdrawal([seller.account.address], {
        account: fakeDispute.account,
      });
      // After 2nd resume, unlockAt = now + frozenRemaining (~14 days captured at first freeze)
      await increaseTime(publicClient, 14 * 24 * 3600 + 1);
      await stake.write.executeWithdrawal({ account: seller.account });
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
    });
  });

  // ── slashStake ────────────────────────────────────────────
  describe("slashStake", function () {
    it("reduces stake and transfers the slashed amount to the recipient", async function () {
      const { stake, mockUSDT, seller, buyer, fakeDispute } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      const before = await mockUSDT.read.balanceOf([buyer.account.address]);

      await stake.write.slashStake(
        [seller.account.address, toUSDT(5), buyer.account.address, 42n],
        { account: fakeDispute.account }
      );

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(5));
      const after = await mockUSDT.read.balanceOf([buyer.account.address]);
      assert.equal(after - before, toUSDT(5));
    });

    it("rejects slashStake from non-dispute caller", async function () {
      const { stake, seller, buyer } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await expectRevert(
        stake.write.slashStake(
          [seller.account.address, toUSDT(5), buyer.account.address, 42n],
          { account: buyer.account }
        ),
        "Only dispute"
      );
    });

    it("reverts slashStake when amount exceeds the seller's stake", async function () {
      const { stake, seller, buyer, fakeDispute } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await expectRevert(
        stake.write.slashStake(
          [seller.account.address, toUSDT(50), buyer.account.address, 42n],
          { account: fakeDispute.account }
        ),
        "Slash exceeds stake"
      );
    });
  });

  // ── Escrow hooks ──────────────────────────────────────────
  describe("Escrow hooks", function () {
    it("incrementActiveSales + decrementActiveSales adjust the counter", async function () {
      const { stake, seller, fakeEscrow } = await deployStake(viem);
      await stake.write.incrementActiveSales([seller.account.address], {
        account: fakeEscrow.account,
      });
      await stake.write.incrementActiveSales([seller.account.address], {
        account: fakeEscrow.account,
      });
      assert.equal(await stake.read.getActiveSales([seller.account.address]), 2n);

      await stake.write.decrementActiveSales([seller.account.address], {
        account: fakeEscrow.account,
      });
      assert.equal(await stake.read.getActiveSales([seller.account.address]), 1n);
    });

    it("rejects incrementActiveSales from a non-escrow caller", async function () {
      const { stake, seller, buyer } = await deployStake(viem);
      await expectRevert(
        stake.write.incrementActiveSales([seller.account.address], {
          account: buyer.account,
        }),
        "Only escrow"
      );
    });
  });

  // ── isEligibleForOrder ────────────────────────────────────
  describe("isEligibleForOrder", function () {
    it("enforces Tier 1 concurrent cap, price cap, and withdrawal-active guard", async function () {
      const { stake, seller, fakeEscrow } = await deployStake(viem);

      // Not staked → false
      assert.equal(
        await stake.read.isEligibleForOrder([seller.account.address, toUSDT(50)]),
        false
      );

      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      // Within caps → true
      assert.equal(
        await stake.read.isEligibleForOrder([seller.account.address, toUSDT(100)]),
        true
      );
      // Over price cap → false
      assert.equal(
        await stake.read.isEligibleForOrder([seller.account.address, toUSDT(101)]),
        false
      );

      // Fill concurrent cap (3 active sales)
      for (let i = 0; i < 3; i++) {
        await stake.write.incrementActiveSales([seller.account.address], {
          account: fakeEscrow.account,
        });
      }
      assert.equal(
        await stake.read.isEligibleForOrder([seller.account.address, toUSDT(50)]),
        false
      );

      // Clear sales and trigger withdrawal → false
      for (let i = 0; i < 3; i++) {
        await stake.write.decrementActiveSales([seller.account.address], {
          account: fakeEscrow.account,
        });
      }
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      assert.equal(
        await stake.read.isEligibleForOrder([seller.account.address, toUSDT(50)]),
        false
      );
    });
  });

  // ── slashStake auto-downgrade (ADR-028) ───────────────────
  describe("slashStake auto-downgrade (ADR-028)", function () {
    it("auto-downgrades T3 → T2 on an exact-match slash", async function () {
      const { stake, reputation, seller, buyer, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
      for (let i = 20; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      await stake.write.upgradeTier([TIER_TOPSELLER], { account: seller.account });
      // Seller is now at T3 with 50 USDT staked.

      await stake.write.slashStake(
        [seller.account.address, toUSDT(25), buyer.account.address, 1n],
        { account: fakeDispute.account }
      );

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    });

    it("auto-downgrades T3 → T1 when the slash skips Tier 2", async function () {
      const { stake, reputation, seller, buyer, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
      for (let i = 20; i < 50; i++) {
        await reputation.write.recordCompletedOrder([seller.account.address, BigInt(i), toUSDT(50)]);
      }
      await reputation.write.checkAndUpdateTopSeller([seller.account.address]);
      await stake.write.upgradeTier([TIER_TOPSELLER], { account: seller.account });

      // Slash 40 — remaining 10 falls between T2 threshold (25) and T1 threshold (10).
      await stake.write.slashStake(
        [seller.account.address, toUSDT(40), buyer.account.address, 1n],
        { account: fakeDispute.account }
      );

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(10));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_STARTER);
    });

    it("auto-downgrades T1 → None leaving an orphan residual", async function () {
      const { stake, seller, buyer, fakeDispute } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });

      await stake.write.slashStake(
        [seller.account.address, toUSDT(5), buyer.account.address, 1n],
        { account: fakeDispute.account }
      );

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(5));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
    });

    it("does not downgrade when remaining stake still covers the tier", async function () {
      const { stake, reputation, seller, buyer, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
      // T2 with 25 USDT. Top up 20 → 45 USDT (within TIER_3_STAKE cap of 50).
      await stake.write.topUpStake([toUSDT(20)], { account: seller.account });
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(45));

      // Slash 3 → remaining 42 still >= TIER_2_STAKE (25), no downgrade.
      await stake.write.slashStake(
        [seller.account.address, toUSDT(3), buyer.account.address, 1n],
        { account: fakeDispute.account }
      );

      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(42));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    });
  });

  // ── topUpStake ────────────────────────────────────────────
  describe("topUpStake", function () {
    it("adds to the stake and keeps the tier unchanged", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.topUpStake([toUSDT(3)], { account: seller.account });
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(13));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_STARTER);
    });

    it("rejects topUpStake during an active withdrawal", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await expectRevert(
        stake.write.topUpStake([toUSDT(3)], { account: seller.account }),
        "Withdrawal active"
      );
    });

    it("rejects topUpStake when total would exceed TIER_3_STAKE", async function () {
      const { stake, seller } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      // Already at 10 USDT; adding 50 would overflow the 50 USDT cap.
      await expectRevert(
        stake.write.topUpStake([toUSDT(50)], { account: seller.account }),
        "Would exceed max tier stake"
      );
    });
  });

  // ── orphan stake drain (ADR-028) ──────────────────────────
  describe("orphan stake drain (ADR-028)", function () {
    it("drains orphan stake via initiateWithdrawal(None) from tier None", async function () {
      const { stake, mockUSDT, seller, buyer, fakeDispute, publicClient } = await deployStake(viem);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });

      // Slash 5 → stake 5, tier None (orphan state).
      await stake.write.slashStake(
        [seller.account.address, toUSDT(5), buyer.account.address, 1n],
        { account: fakeDispute.account }
      );
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_NONE);
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(5));

      const before = await mockUSDT.read.balanceOf([seller.account.address]);
      await stake.write.initiateWithdrawal([TIER_NONE], { account: seller.account });
      await increaseTime(publicClient, 14 * 24 * 3600 + 1);
      await stake.write.executeWithdrawal({ account: seller.account });
      const after = await mockUSDT.read.balanceOf([seller.account.address]);

      assert.equal(await stake.read.getStake([seller.account.address]), 0n);
      assert.equal(after - before, toUSDT(5));
    });
  });

  // ── upgradeTier over-collateralization (ADR-028) ──────────
  describe("upgradeTier over-collateralization (ADR-028)", function () {
    it("is free when seller is already over-collateralized at target tier", async function () {
      const { stake, mockUSDT, reputation, seller, publicClient } = await deployStake(viem);
      await reachTier2Eligibility(reputation, seller, publicClient);
      await stake.write.depositStake([TIER_STARTER], { account: seller.account });
      // Top up to exactly Tier 2's threshold while still at Tier 1.
      await stake.write.topUpStake([toUSDT(15)], { account: seller.account });
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_STARTER);

      const before = await mockUSDT.read.balanceOf([seller.account.address]);
      await stake.write.upgradeTier([TIER_ESTABLISHED], { account: seller.account });
      const after = await mockUSDT.read.balanceOf([seller.account.address]);

      assert.equal(after, before); // no USDT was transferred — delta was 0
      assert.equal(await stake.read.getStake([seller.account.address]), toUSDT(25));
      assert.equal(await stake.read.getTier([seller.account.address]), TIER_ESTABLISHED);
    });
  });
});
