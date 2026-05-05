/**
 * H-1 regression guard — Unfunded Dispute Drain (FIXED)
 *
 * Original finding (pashov solidity-auditor on EtaloDispute.sol, audit
 * commit f8a12f1 on docs/j11-pre-audit) : `EtaloDispute.openDispute`,
 * `EtaloEscrow.markItemDisputed` and `EtaloEscrow.resolveItemDispute`
 * did not require `order.fundedAt > 0`. A buyer could open a dispute on
 * an unfunded order and (via N1 collusion today, N3 vote post-V1) drain
 * USDT from the escrow custody — funded by other buyers' legitimate
 * deposits.
 *
 * Empirical reproduction (commit dcae418, this branch fix/h1-…) showed
 * the exploit was reachable on local Hardhat fork : 100 USDT drained in
 * one transaction (raw 100_000_000 from escrow custody to attacker).
 *
 * Fix : 3-layer `require(... > 0, "Order not funded")`
 *   Layer 1 (primary)            : EtaloDispute.openDispute  — blocks entry
 *   Layer 2 (defense-in-depth)   : EtaloEscrow.markItemDisputed
 *   Layer 3 (defense-in-depth)   : EtaloEscrow.resolveItemDispute
 *
 * This test is now a REGRESSION GUARD : it asserts that openDispute on
 * an unfunded order reverts with "Order not funded" AND no state
 * mutation occurs. Pre-fix this test would have failed (drain
 * succeeded) ; post-fix it passes (Layer 1 reverts). If a future
 * refactor removes the guard, this test fails and surfaces the
 * regression.
 *
 * Direct unit-tests of Layers 2 & 3 are not feasible from regular test
 * accounts because both functions are gated by `onlyDispute` modifier.
 * They serve as belt-and-suspenders for any future code path that
 * bypasses Layer 1. The pashov re-audit pass (Step G) verifies no
 * other unfunded fund movement paths exist.
 *
 * See ADR-042 for full incident write-up + fix rationale.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployIntegration,
  toUSDT,
} from "../helpers/fixtures.js";

describe("H-1 — Unfunded Dispute Drain (regression guard)", async function () {
  const { viem } = await network.create();

  it("REGRESSION : openDispute on unfunded order MUST revert with 'Order not funded'", async function () {
    const {
      mockUSDT,
      escrow,
      dispute,
      buyer,           // victim — funds a legitimate order
      seller,          // legitimate seller for victim's order
      seller2,         // colluding seller for attacker
      nonParty,        // attacker buyer (no funded order)
    } = await deployIntegration(viem);

    const ITEM_PRICE = toUSDT(100); // 100 USDT (6 decimals)

    // ─────────────────────────────────────────────────────────
    // Step 1 — victim creates + funds a legitimate order
    // ─────────────────────────────────────────────────────────
    // After this, escrow holds 100 USDT in custody. This is the pool
    // an attacker would aim to drain via the H-1 exploit.
    await escrow.write.createOrderWithItems(
      [seller.account.address, [ITEM_PRICE], false],
      { account: buyer.account },
    );
    await escrow.write.fundOrder([1n], { account: buyer.account });

    const escrowBalanceBefore = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    assert.equal(
      escrowBalanceBefore,
      ITEM_PRICE,
      "Setup : escrow custody should equal victim's deposit",
    );

    const attackerBalanceBefore = (await mockUSDT.read.balanceOf([
      nonParty.account.address,
    ])) as bigint;

    // ─────────────────────────────────────────────────────────
    // Step 2 — attacker creates an UNFUNDED order with colluding seller
    // ─────────────────────────────────────────────────────────
    // No fundOrder call → order.fundedAt stays 0. This is the precondition
    // for the H-1 attack.
    await escrow.write.createOrderWithItems(
      [seller2.account.address, [ITEM_PRICE], false],
      { account: nonParty.account },
    );
    const attackerOrder = (await escrow.read.getOrder([2n])) as {
      fundedAt: bigint;
    };
    assert.equal(
      attackerOrder.fundedAt,
      0n,
      "Setup : attacker's order MUST be unfunded (fundedAt == 0)",
    );

    // ─────────────────────────────────────────────────────────
    // Step 3 — attacker attempts to open dispute on unfunded order
    // ─────────────────────────────────────────────────────────
    // POST-FIX EXPECTATION : Layer 1 of the H-1 fix
    // (require(order.fundedAt > 0, "Order not funded") in openDispute)
    // MUST reject this call.
    let openDisputeError: string | null = null;
    try {
      await dispute.write.openDispute([2n, 2n, "drain attempt"], {
        account: nonParty.account,
      });
    } catch (err) {
      openDisputeError = err instanceof Error ? err.message : String(err);
    }

    assert.notEqual(
      openDisputeError,
      null,
      "REGRESSION : openDispute on unfunded order should revert. Layer 1 of H-1 fix is missing.",
    );
    assert.match(
      openDisputeError ?? "",
      /Order not funded/,
      `REGRESSION : openDispute revert reason must be 'Order not funded' (Layer 1 of H-1 fix). Got : ${openDisputeError}`,
    );

    // ─────────────────────────────────────────────────────────
    // Step 4 — verify NO state mutation occurred
    // ─────────────────────────────────────────────────────────
    // The blocked openDispute call must not move USDT, must not create
    // a dispute record, must not flip item status.
    const escrowBalanceAfter = (await mockUSDT.read.balanceOf([
      escrow.address,
    ])) as bigint;
    const attackerBalanceAfter = (await mockUSDT.read.balanceOf([
      nonParty.account.address,
    ])) as bigint;
    const totalEscrowedAfter = (await escrow.read.totalEscrowed()) as bigint;

    assert.equal(
      escrowBalanceAfter,
      escrowBalanceBefore,
      "REGRESSION : escrow USDT custody must be unchanged after blocked openDispute",
    );
    assert.equal(
      attackerBalanceAfter,
      attackerBalanceBefore,
      "REGRESSION : attacker USDT balance must be unchanged after blocked openDispute",
    );
    assert.equal(
      totalEscrowedAfter,
      ITEM_PRICE,
      "REGRESSION : totalEscrowedAmount must still match victim's deposit (no accounting drift)",
    );
  });
});
