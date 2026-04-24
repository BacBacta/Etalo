// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import { EtaloEscrow } from "../../../contracts/EtaloEscrow.sol";
import { EtaloStake } from "../../../contracts/EtaloStake.sol";
import { EtaloDispute } from "../../../contracts/EtaloDispute.sol";
import { EtaloVoting } from "../../../contracts/EtaloVoting.sol";
import { EtaloReputation } from "../../../contracts/EtaloReputation.sol";
import { MockUSDT } from "../../../contracts/test/MockUSDT.sol";
import { EtaloTypes } from "../../../contracts/types/EtaloTypes.sol";

/// @dev Foundry invariant handler — drives random actions on the full
/// EtaloEscrow/Stake/Dispute/Voting/Reputation stack. Reverts from
/// unmet preconditions are swallowed (fuzzer skips); reverts after
/// preconditions pass are counted via `unexpectedRevertCount` so
/// `invariant_NoUnexpectedReverts` can surface them.
contract EscrowHandler is Test {
    EtaloEscrow public escrow;
    EtaloStake public stake;
    EtaloDispute public dispute;
    EtaloVoting public voting;
    EtaloReputation public reputation;
    MockUSDT public usdt;

    // Actor pools
    address[5] public sellers;
    address[3] public buyers;
    address[3] public mediators;

    // Tracked entities
    uint256[] public createdOrderIds;
    uint256[] public fundedOrderIds;
    uint256[] public shippedGroupIds;
    uint256[] public disputeIds;

    // Ghost state for monotonicity invariants
    uint256[] public completedOrderIds;
    mapping(uint256 => bool) public everCompleted;

    uint256[] public releasedItemIds;
    mapping(uint256 => bool) public everReleasedItem;

    uint256[] public refundedItemIds;
    mapping(uint256 => bool) public everRefundedItem;

    // Ghost counters for cross-contract invariants
    uint256 public ghostTotalDeposited;
    uint256 public ghostTotalSlashed;

    // Metrics
    uint256 public ghostCallCount;
    uint256 public unexpectedRevertCount;

    // Amount ceiling for handler-generated orders (keeps the fuzzer inside
    // Tier 1 reach on cross-border + comfortably below MAX_ORDER_USDT)
    uint256 internal constant MAX_HANDLER_ITEM_PRICE = 99 * 1e6;   // 99 USDT
    uint256 internal constant MIN_HANDLER_ITEM_PRICE = 1 * 1e6;    // 1 USDT

    constructor(
        EtaloEscrow _escrow,
        EtaloStake _stake,
        EtaloDispute _dispute,
        EtaloVoting _voting,
        EtaloReputation _reputation,
        MockUSDT _usdt
    ) {
        escrow = _escrow;
        stake = _stake;
        dispute = _dispute;
        voting = _voting;
        reputation = _reputation;
        usdt = _usdt;
    }

    // ========================================================
    // Setup (called by Invariants.setUp)
    // ========================================================

    function setupActors() external {
        // Sellers: 5 wallets staked at Tier 1 with 1000 USDT cushion.
        for (uint256 i = 0; i < 5; i++) {
            address s = makeAddr(string.concat("seller", vm.toString(i)));
            sellers[i] = s;
            usdt.mint(s, 1_000 * 1e6);
            vm.startPrank(s);
            usdt.approve(address(stake), type(uint256).max);
            stake.depositStake(EtaloTypes.StakeTier.Starter);
            vm.stopPrank();
            ghostTotalDeposited += 10 * 1e6;
        }
        // Buyers: 3 wallets with 100k USDT each + approval to Escrow.
        for (uint256 i = 0; i < 3; i++) {
            address b = makeAddr(string.concat("buyer", vm.toString(i)));
            buyers[i] = b;
            usdt.mint(b, 100_000 * 1e6);
            vm.prank(b);
            usdt.approve(address(escrow), type(uint256).max);
        }
        // Mediators: addresses only — the Invariants test contract owns
        // Dispute and calls approveMediator itself.
        mediators[0] = makeAddr("mediator0");
        mediators[1] = makeAddr("mediator1");
        mediators[2] = makeAddr("mediator2");
    }

    // ========================================================
    // Internal helpers
    // ========================================================

    function _onCall() internal {
        ghostCallCount++;
    }

    function _postSync(uint256 orderId) internal {
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (order.globalStatus == EtaloTypes.OrderStatus.Completed && !everCompleted[orderId]) {
            everCompleted[orderId] = true;
            completedOrderIds.push(orderId);
        }
        uint256[] memory items = escrow.getOrderItems(orderId);
        for (uint256 i = 0; i < items.length; i++) {
            EtaloTypes.Item memory it = escrow.getItem(items[i]);
            if (it.status == EtaloTypes.ItemStatus.Released && !everReleasedItem[items[i]]) {
                everReleasedItem[items[i]] = true;
                releasedItemIds.push(items[i]);
            } else if (it.status == EtaloTypes.ItemStatus.Refunded && !everRefundedItem[items[i]]) {
                everRefundedItem[items[i]] = true;
                refundedItemIds.push(items[i]);
            }
        }
    }

    function _logUnexpected(string memory where, string memory reason) internal {
        console.log("[handler] unexpected revert in", where);
        console.log("  reason:", reason);
        unexpectedRevertCount++;
    }

    function _logUnexpectedRaw(string memory where) internal {
        console.log("[handler] unexpected raw revert in", where);
        unexpectedRevertCount++;
    }

    // ========================================================
    // Handlers
    // ========================================================

    function h_createIntraOrder(
        uint256 buyerSeed,
        uint256 sellerSeed,
        uint256 priceSeed,
        uint256 itemCountSeed
    ) external {
        _onCall();
        address buyer = buyers[buyerSeed % 3];
        address seller = sellers[sellerSeed % 5];
        if (buyer == seller) return;

        uint256 itemCount = bound(itemCountSeed, 1, 5);
        uint256[] memory prices = new uint256[](itemCount);
        uint256 total = 0;
        uint256 s = priceSeed;
        for (uint256 i = 0; i < itemCount; i++) {
            uint256 p = bound(s, MIN_HANDLER_ITEM_PRICE, MAX_HANDLER_ITEM_PRICE);
            prices[i] = p;
            total += p;
            s = uint256(keccak256(abi.encode(s)));
        }
        if (total > escrow.MAX_ORDER_USDT()) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        vm.prank(buyer);
        try escrow.createOrderWithItems(seller, prices, false) returns (uint256 orderId) {
            createdOrderIds.push(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_createIntraOrder", reason);
        } catch {
            _logUnexpectedRaw("h_createIntraOrder");
        }
    }

    function h_createCrossBorderOrder(
        uint256 buyerSeed,
        uint256 sellerSeed,
        uint256 priceSeed
    ) external {
        _onCall();
        address buyer = buyers[buyerSeed % 3];
        address seller = sellers[sellerSeed % 5];
        if (buyer == seller) return;

        uint256 price = bound(priceSeed, MIN_HANDLER_ITEM_PRICE, MAX_HANDLER_ITEM_PRICE);
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;

        if (block.timestamp <= escrow.pausedUntil()) return;
        if (!stake.isEligibleForOrder(seller, price)) return;

        vm.prank(buyer);
        try escrow.createOrderWithItems(seller, prices, true) returns (uint256 orderId) {
            createdOrderIds.push(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_createCrossBorderOrder", reason);
        } catch {
            _logUnexpectedRaw("h_createCrossBorderOrder");
        }
    }

    function h_fundOrder(uint256 orderSeed) external {
        _onCall();
        if (createdOrderIds.length == 0) return;
        uint256 orderId = createdOrderIds[orderSeed % createdOrderIds.length];
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (order.globalStatus != EtaloTypes.OrderStatus.Created) return;
        if (escrow.totalEscrowedAmount() + order.totalAmount > escrow.MAX_TVL_USDT()) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        uint256 weekStart = escrow.sellerWeekStartTimestamp(order.seller);
        uint256 weekly = block.timestamp > weekStart + 1 weeks
            ? 0
            : escrow.sellerWeeklyVolume(order.seller);
        if (weekly + order.totalAmount > escrow.MAX_SELLER_WEEKLY_VOLUME()) return;

        vm.prank(order.buyer);
        try escrow.fundOrder(orderId) {
            fundedOrderIds.push(orderId);
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_fundOrder", reason);
        } catch {
            _logUnexpectedRaw("h_fundOrder");
        }
    }

    function h_shipItems(uint256 orderSeed) external {
        _onCall();
        if (fundedOrderIds.length == 0) return;
        uint256 orderId = fundedOrderIds[orderSeed % fundedOrderIds.length];
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (
            order.globalStatus != EtaloTypes.OrderStatus.Funded &&
            order.globalStatus != EtaloTypes.OrderStatus.PartiallyShipped
        ) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        // Collect up to MAX_ITEMS_PER_GROUP Pending items
        uint256[] memory orderItems = escrow.getOrderItems(orderId);
        uint256 maxGroup = escrow.MAX_ITEMS_PER_GROUP();
        uint256 count = 0;
        uint256[] memory tempIds = new uint256[](orderItems.length);
        for (uint256 i = 0; i < orderItems.length && count < maxGroup; i++) {
            if (escrow.getItem(orderItems[i]).status == EtaloTypes.ItemStatus.Pending) {
                tempIds[count++] = orderItems[i];
            }
        }
        if (count == 0) return;
        uint256[] memory itemIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) itemIds[i] = tempIds[i];

        bytes32 proof = keccak256(abi.encode("ship", orderId, block.timestamp));

        vm.prank(order.seller);
        try escrow.shipItemsGrouped(orderId, itemIds, proof) returns (uint256 groupId) {
            shippedGroupIds.push(groupId);
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_shipItems", reason);
        } catch {
            _logUnexpectedRaw("h_shipItems");
        }
    }

    function h_markArrived(uint256 groupSeed) external {
        _onCall();
        if (shippedGroupIds.length == 0) return;
        uint256 groupId = shippedGroupIds[groupSeed % shippedGroupIds.length];
        EtaloTypes.ShipmentGroup memory group = escrow.getShipmentGroup(groupId);
        if (group.status != EtaloTypes.ShipmentStatus.Shipped) return;
        EtaloTypes.Order memory order = escrow.getOrder(group.orderId);
        if (!order.isCrossBorder) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        bytes32 proof = keccak256(abi.encode("arrive", groupId, block.timestamp));

        vm.prank(order.buyer);
        try escrow.markGroupArrived(group.orderId, groupId, proof) {
            _postSync(group.orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_markArrived", reason);
        } catch {
            _logUnexpectedRaw("h_markArrived");
        }
    }

    function h_triggerMajority(uint256 groupSeed) external {
        _onCall();
        if (shippedGroupIds.length == 0) return;
        uint256 groupId = shippedGroupIds[groupSeed % shippedGroupIds.length];
        EtaloTypes.ShipmentGroup memory group = escrow.getShipmentGroup(groupId);
        if (group.status != EtaloTypes.ShipmentStatus.Arrived) return;
        if (group.releaseStage != 1) return;
        if (block.timestamp < group.majorityReleaseAt) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        try escrow.triggerMajorityRelease(group.orderId, groupId) {
            _postSync(group.orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_triggerMajority", reason);
        } catch {
            _logUnexpectedRaw("h_triggerMajority");
        }
    }

    function h_triggerAutoRelease(uint256 orderSeed, uint256 itemSeed) external {
        _onCall();
        if (fundedOrderIds.length == 0) return;
        uint256 orderId = fundedOrderIds[orderSeed % fundedOrderIds.length];
        uint256[] memory items = escrow.getOrderItems(orderId);
        if (items.length == 0) return;
        uint256 itemId = items[itemSeed % items.length];

        EtaloTypes.Item memory item = escrow.getItem(itemId);
        if (
            item.status == EtaloTypes.ItemStatus.Released ||
            item.status == EtaloTypes.ItemStatus.Refunded ||
            item.status == EtaloTypes.ItemStatus.Disputed
        ) return;
        if (item.shipmentGroupId == 0) return;
        EtaloTypes.ShipmentGroup memory group = escrow.getShipmentGroup(item.shipmentGroupId);
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (order.isCrossBorder && group.status != EtaloTypes.ShipmentStatus.Arrived) return;
        if (group.finalReleaseAfter == 0 || block.timestamp < group.finalReleaseAfter) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        try escrow.triggerAutoReleaseForItem(orderId, itemId) {
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_triggerAutoRelease", reason);
        } catch {
            _logUnexpectedRaw("h_triggerAutoRelease");
        }
    }

    function h_triggerAutoRefund(uint256 orderSeed) external {
        _onCall();
        if (fundedOrderIds.length == 0) return;
        uint256 orderId = fundedOrderIds[orderSeed % fundedOrderIds.length];
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (order.globalStatus != EtaloTypes.OrderStatus.Funded) return;
        uint256 deadline = order.isCrossBorder
            ? order.fundedAt + escrow.AUTO_REFUND_INACTIVE_CROSS()
            : order.fundedAt + escrow.AUTO_REFUND_INACTIVE_INTRA();
        if (block.timestamp <= deadline) return;
        if (block.timestamp <= escrow.pausedUntil()) return;
        // ADR-031: auto-refund blocked while any item is Disputed.
        // Skip precondition rather than catch it as "unexpected".
        uint256[] memory _items = escrow.getOrderItems(orderId);
        for (uint256 i = 0; i < _items.length; i++) {
            if (escrow.getItem(_items[i]).status == EtaloTypes.ItemStatus.Disputed) {
                return;
            }
        }

        try escrow.triggerAutoRefundIfInactive(orderId) {
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_triggerAutoRefund", reason);
        } catch {
            _logUnexpectedRaw("h_triggerAutoRefund");
        }
    }

    function h_confirmItem(uint256 orderSeed, uint256 itemSeed) external {
        _onCall();
        if (fundedOrderIds.length == 0) return;
        uint256 orderId = fundedOrderIds[orderSeed % fundedOrderIds.length];
        uint256[] memory items = escrow.getOrderItems(orderId);
        if (items.length == 0) return;
        uint256 itemId = items[itemSeed % items.length];
        EtaloTypes.Item memory item = escrow.getItem(itemId);
        if (
            item.status != EtaloTypes.ItemStatus.Shipped &&
            item.status != EtaloTypes.ItemStatus.Arrived &&
            item.status != EtaloTypes.ItemStatus.Delivered
        ) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        vm.prank(order.buyer);
        try escrow.confirmItemDelivery(orderId, itemId) {
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_confirmItem", reason);
        } catch {
            _logUnexpectedRaw("h_confirmItem");
        }
    }

    function h_cancelOrder(uint256 orderSeed) external {
        _onCall();
        if (createdOrderIds.length == 0) return;
        uint256 orderId = createdOrderIds[orderSeed % createdOrderIds.length];
        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        if (order.globalStatus != EtaloTypes.OrderStatus.Created) return;
        if (block.timestamp <= escrow.pausedUntil()) return;

        vm.prank(order.buyer);
        try escrow.cancelOrder(orderId) {
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_cancelOrder", reason);
        } catch {
            _logUnexpectedRaw("h_cancelOrder");
        }
    }

    function h_openDispute(uint256 orderSeed, uint256 itemSeed) external {
        _onCall();
        if (fundedOrderIds.length == 0) return;
        uint256 orderId = fundedOrderIds[orderSeed % fundedOrderIds.length];
        uint256[] memory items = escrow.getOrderItems(orderId);
        if (items.length == 0) return;
        uint256 itemId = items[itemSeed % items.length];
        EtaloTypes.Item memory item = escrow.getItem(itemId);
        if (
            item.status == EtaloTypes.ItemStatus.Released ||
            item.status == EtaloTypes.ItemStatus.Refunded ||
            item.status == EtaloTypes.ItemStatus.Disputed
        ) return;
        if (dispute.hasActiveDisputeForItem(orderId, itemId)) return;

        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        vm.prank(order.buyer);
        try dispute.openDispute(orderId, itemId, "fuzz reason") returns (uint256 did) {
            disputeIds.push(did);
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_openDispute", reason);
        } catch {
            _logUnexpectedRaw("h_openDispute");
        }
    }

    function h_resolveN1(uint256 disputeSeed, uint256 refundSeed) external {
        _onCall();
        if (disputeIds.length == 0) return;
        uint256 did = disputeIds[disputeSeed % disputeIds.length];
        (uint256 orderId, uint256 itemId, uint8 level, bool resolved) = dispute.getDispute(did);
        if (resolved) return;
        if (level != 1) return; // only N1 bilateral in this handler

        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        EtaloTypes.Item memory item = escrow.getItem(itemId);
        uint256 maxRefund = item.itemPrice - item.releasedAmount;
        uint256 refund = bound(refundSeed, 0, maxRefund);

        // Buyer stores proposal
        vm.prank(order.buyer);
        try dispute.resolveN1Amicable(did, refund) {} catch { _logUnexpectedRaw("h_resolveN1[buyer]"); return; }

        // Seller matches → fires _applyResolution → Escrow + Stake + Reputation
        vm.prank(order.seller);
        try dispute.resolveN1Amicable(did, refund) {
            _postSync(orderId);
        } catch Error(string memory reason) {
            _logUnexpected("h_resolveN1[seller]", reason);
        } catch {
            _logUnexpectedRaw("h_resolveN1[seller]");
        }
    }

    function h_simulateSlash(uint256 sellerSeed, uint256 amountSeed, uint256 recipientSeed) external {
        _onCall();
        address seller = sellers[sellerSeed % 5];
        uint256 bal = stake.getStake(seller);
        if (bal == 0) return;
        uint256 amount = bound(amountSeed, 1, bal);
        address recipient = buyers[recipientSeed % 3];

        // Impersonate the dispute contract to exercise slashStake
        vm.prank(address(dispute));
        try stake.slashStake(seller, amount, recipient, 1) {
            ghostTotalSlashed += amount;
        } catch Error(string memory reason) {
            _logUnexpected("h_simulateSlash", reason);
        } catch {
            _logUnexpectedRaw("h_simulateSlash");
        }
    }

    function h_warp(uint256 timeSeed) external {
        _onCall();
        uint256 delta = bound(timeSeed, 1 hours, 30 days);
        vm.warp(block.timestamp + delta);
    }

    // ========================================================
    // Accessors for invariant assertions
    // ========================================================

    function releasedItemCount() external view returns (uint256) {
        return releasedItemIds.length;
    }

    function refundedItemCount() external view returns (uint256) {
        return refundedItemIds.length;
    }

    function completedOrderCount() external view returns (uint256) {
        return completedOrderIds.length;
    }

    function createdOrderCount() external view returns (uint256) {
        return createdOrderIds.length;
    }

    function fundedOrderCount() external view returns (uint256) {
        return fundedOrderIds.length;
    }

    function shippedGroupCount() external view returns (uint256) {
        return shippedGroupIds.length;
    }

    function disputeCount() external view returns (uint256) {
        return disputeIds.length;
    }
}
