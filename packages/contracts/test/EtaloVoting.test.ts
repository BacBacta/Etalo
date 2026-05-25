import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { deployVoting, increaseTime, expectRevert } from "./helpers/fixtures.js";

const VOTING_PERIOD = 14n * 24n * 3600n; // 14 days

describe("EtaloVoting", async function () {
  const { viem } = await network.create();

  // ── createVote ────────────────────────────────────────────
  describe("createVote", function () {
    it("creates a vote via dispute contract with correct state and event", async function () {
      const { voting, mockDispute, voter1, voter2, voter3 } = await deployVoting(viem);
      const voters = [
        voter1.account.address,
        voter2.account.address,
        voter3.account.address,
      ];

      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      const [disputeId, deadline, finalized, buyerWon] = await voting.read.getVote([1n]);
      assert.equal(disputeId, 42n);
      assert.ok(deadline > 0n);
      assert.equal(finalized, false);
      assert.equal(buyerWon, false);
    });

    it("rejects createVote from a non-dispute caller", async function () {
      const { voting, nonEligible, voter1 } = await deployVoting(viem);
      await expectRevert(
        voting.write.createVote(
          [42n, [voter1.account.address], VOTING_PERIOD],
          { account: nonEligible.account }
        ),
        "Only dispute"
      );
    });

    it("rejects createVote with an empty voters list", async function () {
      const { voting, mockDispute } = await deployVoting(viem);
      await expectRevert(
        mockDispute.write.createVoteOn([voting.address, 42n, [], VOTING_PERIOD]),
        "No voters"
      );
    });
  });

  // ── submitVote ────────────────────────────────────────────
  describe("submitVote", function () {
    it("counts a vote from an eligible voter", async function () {
      const { voting, mockDispute, voter1, voter2, voter3 } = await deployVoting(viem);
      const voters = [
        voter1.account.address,
        voter2.account.address,
        voter3.account.address,
      ];
      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      await voting.write.submitVote([1n, true], { account: voter1.account });
      assert.equal(await voting.read.hasVoted([1n, voter1.account.address]), true);
    });

    it("rejects submitVote from a non-eligible voter", async function () {
      const { voting, mockDispute, voter1, nonEligible } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await expectRevert(
        voting.write.submitVote([1n, true], { account: nonEligible.account }),
        "Not eligible"
      );
    });

    it("rejects a double-vote from the same voter", async function () {
      const { voting, mockDispute, voter1 } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await voting.write.submitVote([1n, true], { account: voter1.account });
      await expectRevert(
        voting.write.submitVote([1n, false], { account: voter1.account }),
        "Already voted"
      );
    });

    it("rejects submitVote after the deadline", async function () {
      const { voting, mockDispute, voter1, publicClient } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await expectRevert(
        voting.write.submitVote([1n, true], { account: voter1.account }),
        "Voting closed"
      );
    });
  });

  // ── finalizeVote ──────────────────────────────────────────
  describe("finalizeVote", function () {
    it("rejects finalizeVote before the deadline", async function () {
      const { voting, mockDispute, voter1 } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await expectRevert(voting.write.finalizeVote([1n]), "Voting still open");
    });

    it("majority buyer wins (2 for buyer, 1 for seller)", async function () {
      const { voting, mockDispute, voter1, voter2, voter3, publicClient } =
        await deployVoting(viem);
      const voters = [
        voter1.account.address,
        voter2.account.address,
        voter3.account.address,
      ];
      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      await voting.write.submitVote([1n, true], { account: voter1.account });
      await voting.write.submitVote([1n, false], { account: voter2.account });
      await voting.write.submitVote([1n, true], { account: voter3.account });

      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);

      const [buyerWon, isFinalized] = await voting.read.getResult([1n]);
      assert.equal(buyerWon, true);
      assert.equal(isFinalized, true);
    });

    it("majority seller wins (1 for buyer, 2 for seller)", async function () {
      const { voting, mockDispute, voter1, voter2, voter3, publicClient } =
        await deployVoting(viem);
      const voters = [
        voter1.account.address,
        voter2.account.address,
        voter3.account.address,
      ];
      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      await voting.write.submitVote([1n, true], { account: voter1.account });
      await voting.write.submitVote([1n, false], { account: voter2.account });
      await voting.write.submitVote([1n, false], { account: voter3.account });

      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);

      const [buyerWon] = await voting.read.getResult([1n]);
      assert.equal(buyerWon, false);
    });

    it("tie defaults to buyer (1 for buyer, 1 for seller)", async function () {
      const { voting, mockDispute, voter1, voter2, publicClient } = await deployVoting(viem);
      const voters = [voter1.account.address, voter2.account.address];
      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      await voting.write.submitVote([1n, true], { account: voter1.account });
      await voting.write.submitVote([1n, false], { account: voter2.account });

      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);

      const [buyerWon] = await voting.read.getResult([1n]);
      assert.equal(buyerWon, true);
    });

    it("rejects a second finalize on an already finalized vote", async function () {
      const { voting, mockDispute, voter1, publicClient } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await voting.write.submitVote([1n, true], { account: voter1.account });
      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);
      await expectRevert(voting.write.finalizeVote([1n]), "Already finalized");
    });

    it("rejects finalize on a zero-quorum vote (ADR-054, Pashov #5)", async function () {
      // Without the quorum guard, the previous behavior was
      // `buyerWon = forBuyer >= forSeller` with both at 0 → buyer
      // wins by inaction. The audit demonstrated that this turned
      // voter apathy into a guaranteed refund extraction for the
      // buyer. Real ties (1-1, 2-2, ...) still default to buyer;
      // only the 0-0 case is now rejected.
      const { voting, mockDispute, voter1, publicClient } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      // No vote cast.
      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await expectRevert(voting.write.finalizeVote([1n]), "No quorum");
    });

    it("accepts finalize with a single buyer vote (1-0 ≠ zero quorum)", async function () {
      // Regression — the quorum guard fires only on 0-0, not 1-0.
      const { voting, mockDispute, voter1, publicClient } = await deployVoting(viem);
      await mockDispute.write.createVoteOn([
        voting.address,
        42n,
        [voter1.account.address],
        VOTING_PERIOD,
      ]);
      await voting.write.submitVote([1n, true], { account: voter1.account });
      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);
      const [buyerWon, isFinalized] = await voting.read.getResult([1n]);
      assert.equal(buyerWon, true);
      assert.equal(isFinalized, true);
    });

    it("exposes getVoteCounts for the EtaloDispute escape hatch", async function () {
      const { voting, mockDispute, voter1, voter2 } = await deployVoting(viem);
      const voters = [voter1.account.address, voter2.account.address];
      await mockDispute.write.createVoteOn([voting.address, 42n, voters, VOTING_PERIOD]);

      let [forBuyer, forSeller] = await voting.read.getVoteCounts([1n]);
      assert.equal(forBuyer, 0n);
      assert.equal(forSeller, 0n);

      await voting.write.submitVote([1n, true], { account: voter1.account });
      await voting.write.submitVote([1n, false], { account: voter2.account });
      [forBuyer, forSeller] = await voting.read.getVoteCounts([1n]);
      assert.equal(forBuyer, 1n);
      assert.equal(forSeller, 1n);
    });
  });

  // ── Dispute callback (ADR-022) ────────────────────────────
  describe("Dispute callback (ADR-022)", function () {
    it("forwards the result to disputeContract.resolveFromVote", async function () {
      const { voting, mockDispute, voter1, voter2, publicClient } = await deployVoting(viem);
      const voters = [voter1.account.address, voter2.account.address];
      await mockDispute.write.createVoteOn([voting.address, 99n, voters, VOTING_PERIOD]);

      // Both vote against buyer — seller wins, callback should fire with false.
      await voting.write.submitVote([1n, false], { account: voter1.account });
      await voting.write.submitVote([1n, false], { account: voter2.account });

      await increaseTime(publicClient, Number(VOTING_PERIOD) + 1);
      await voting.write.finalizeVote([1n]);

      assert.equal(await mockDispute.read.wasCalled(), true);
      assert.equal(await mockDispute.read.lastVoteId(), 1n);
      assert.equal(await mockDispute.read.lastBuyerWon(), false);
    });
  });
});
