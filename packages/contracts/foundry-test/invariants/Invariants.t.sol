// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { EtaloEscrow } from "../../contracts/EtaloEscrow.sol";
import { EtaloStake } from "../../contracts/EtaloStake.sol";
import { EtaloDispute } from "../../contracts/EtaloDispute.sol";
import { EtaloVoting } from "../../contracts/EtaloVoting.sol";
import { EtaloReputation } from "../../contracts/EtaloReputation.sol";
import { MockUSDT } from "../../contracts/test/MockUSDT.sol";
import { EtaloTypes } from "../../contracts/types/EtaloTypes.sol";
import { EscrowHandler } from "./handlers/EscrowHandler.sol";

/// @title Invariants
/// @notice Foundry invariant suite for Sprint J4 Block 9. Wires the
/// full EtaloEscrow/Stake/Dispute/Voting/Reputation stack (no mocks,
/// same as Block 8 integration) and targets a single handler that
/// drives bounded random actions at depth 50. Seven invariants run
/// after each handler step.
contract Invariants is Test {
    MockUSDT public usdt;
    EtaloReputation public reputation;
    EtaloStake public stake;
    EtaloVoting public voting;
    EtaloDispute public dispute;
    EtaloEscrow public escrow;
    EscrowHandler public handler;

    address constant COMMISSION_TREASURY = address(0xCAFE1);
    address constant CREDITS_TREASURY = address(0xCAFE2);
    address constant COMMUNITY_FUND = address(0xCAFE3);

    function setUp() public {
        usdt = new MockUSDT();
        reputation = new EtaloReputation();
        stake = new EtaloStake(address(usdt));
        voting = new EtaloVoting();
        dispute = new EtaloDispute();
        escrow = new EtaloEscrow(address(usdt));

        // Wire Escrow
        escrow.setStakeContract(address(stake));
        escrow.setDisputeContract(address(dispute));
        escrow.setReputationContract(address(reputation));
        escrow.setCommissionTreasury(COMMISSION_TREASURY);
        escrow.setCreditsTreasury(CREDITS_TREASURY);
        escrow.setCommunityFund(COMMUNITY_FUND);

        // Wire Stake
        stake.setReputationContract(address(reputation));
        stake.setDisputeContract(address(dispute));
        stake.setEscrowContract(address(escrow));
        stake.setCommunityFund(COMMUNITY_FUND);

        // Wire Voting
        voting.setDisputeContract(address(dispute));

        // Wire Dispute
        dispute.setEscrow(address(escrow));
        dispute.setStake(address(stake));
        dispute.setVoting(address(voting));
        dispute.setReputation(address(reputation));

        // Reputation authorizations
        reputation.setAuthorizedCaller(address(escrow), true);
        reputation.setAuthorizedCaller(address(dispute), true);

        // Deploy handler + populate actor pools (mint, stake Tier 1, etc.)
        handler = new EscrowHandler(escrow, stake, dispute, voting, reputation, usdt);
        handler.setupActors();

        // Approve the three handler mediators (onlyOwner — this contract owns Dispute)
        dispute.approveMediator(handler.mediators(0), true);
        dispute.approveMediator(handler.mediators(1), true);
        dispute.approveMediator(handler.mediators(2), true);

        targetContract(address(handler));
    }

    // ========================================================
    // Invariants
    // ========================================================

    /// @notice 1. The USDT sitting in the Escrow contract equals the
    /// on-chain accounting counter (`totalEscrowedAmount`).
    function invariant_BalanceMatchesTotalEscrowed() public view {
        assertEq(
            usdt.balanceOf(address(escrow)),
            escrow.totalEscrowedAmount(),
            "Escrow USDT balance diverged from totalEscrowedAmount"
        );
    }

    /// @notice 2. Terminal item state is monotonic — once an item is
    /// Released or Refunded it stays there forever.
    function invariant_TerminalItemStatusIsMonotonic() public view {
        uint256 rc = handler.releasedItemCount();
        for (uint256 i = 0; i < rc; i++) {
            uint256 itemId = handler.releasedItemIds(i);
            EtaloTypes.Item memory it = escrow.getItem(itemId);
            assertEq(
                uint8(it.status),
                uint8(EtaloTypes.ItemStatus.Released),
                "Released item regressed"
            );
        }
        uint256 fc = handler.refundedItemCount();
        for (uint256 i = 0; i < fc; i++) {
            uint256 itemId = handler.refundedItemIds(i);
            EtaloTypes.Item memory it = escrow.getItem(itemId);
            assertEq(
                uint8(it.status),
                uint8(EtaloTypes.ItemStatus.Refunded),
                "Refunded item regressed"
            );
        }
    }

    /// @notice 3. Every created order's totalCommission matches
    /// exactly one of the three allowed per-rate formulas — compared
    /// against the computed value (amount × bps / 10000) rather than
    /// reverse-derived BPS, so floor-division rounding doesn't fool
    /// the invariant when totalAmount is not divisible by the rate.
    function invariant_CommissionInRange() public view {
        uint256 count = escrow.getOrderCount();
        for (uint256 id = 1; id <= count; id++) {
            EtaloTypes.Order memory order = escrow.getOrder(id);
            if (order.totalAmount == 0) continue;
            uint256 at120 = (order.totalAmount * 120) / 10000;
            uint256 at180 = (order.totalAmount * 180) / 10000;
            uint256 at270 = (order.totalAmount * 270) / 10000;
            assertTrue(
                order.totalCommission == at120 ||
                    order.totalCommission == at180 ||
                    order.totalCommission == at270,
                "Commission not matching any allowed BPS rate"
            );
        }
    }

    /// @notice 4. Total slashed stake never exceeds total deposited.
    function invariant_SlashNeverExceedsDeposited() public view {
        assertLe(
            handler.ghostTotalSlashed(),
            handler.ghostTotalDeposited(),
            "Total slashed exceeded total deposited"
        );
    }

    /// @notice 5. Once an order enters Completed, it stays Completed.
    function invariant_CompletedOrderStaysCompleted() public view {
        uint256 cc = handler.completedOrderCount();
        for (uint256 i = 0; i < cc; i++) {
            uint256 orderId = handler.completedOrderIds(i);
            EtaloTypes.Order memory order = escrow.getOrder(orderId);
            assertEq(
                uint8(order.globalStatus),
                uint8(EtaloTypes.OrderStatus.Completed),
                "Completed order regressed"
            );
        }
    }

    /// @notice 6. (memory note) sum of per-seller activeSales in Stake
    /// equals the count of Escrow cross-border orders whose status is
    /// active (Funded / PartiallyShipped / AllShipped /
    /// PartiallyDelivered).
    function invariant_ActiveSalesReconciliation() public view {
        uint256 sumActiveSales = 0;
        for (uint256 i = 0; i < 5; i++) {
            sumActiveSales += stake.getActiveSales(handler.sellers(i));
        }
        uint256 countActiveOrders = 0;
        uint256 orderCount = escrow.getOrderCount();
        for (uint256 id = 1; id <= orderCount; id++) {
            EtaloTypes.Order memory order = escrow.getOrder(id);
            if (!order.isCrossBorder) continue;
            uint8 s = uint8(order.globalStatus);
            if (
                s == uint8(EtaloTypes.OrderStatus.Funded) ||
                s == uint8(EtaloTypes.OrderStatus.PartiallyShipped) ||
                s == uint8(EtaloTypes.OrderStatus.AllShipped) ||
                s == uint8(EtaloTypes.OrderStatus.PartiallyDelivered)
            ) {
                countActiveOrders++;
            }
        }
        assertEq(
            sumActiveSales,
            countActiveOrders,
            "sum(activeSales) != count(active cross-border orders)"
        );
    }

    /// @notice 7. No unexpected reverts from the handler. When
    /// `fail_on_revert = false`, bounded-action reverts are silently
    /// skipped by the fuzzer; this invariant surfaces any revert that
    /// the handler itself considered unexpected (post-precondition).
    function invariant_NoUnexpectedReverts() public view {
        assertEq(
            handler.unexpectedRevertCount(),
            0,
            "Handler caught unexpected reverts - potential bug"
        );
    }
}
