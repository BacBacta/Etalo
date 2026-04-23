// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IEtaloEscrow.sol";
import "./interfaces/IEtaloStake.sol";
import "./interfaces/IEtaloDispute.sol";
import "./interfaces/IEtaloReputation.sol";
import { EtaloTypes } from "./types/EtaloTypes.sol";

/// @title EtaloEscrow
/// @notice Central escrow orchestrator for Etalo V2 (ADR-015).
/// Holds USDT funded by buyers and releases it to sellers along the
/// progressive schedule of ADR-018 (cross-border 20/70/10), enforces
/// ADR-019 auto-refund on seller inactivity, gates forceRefund on the
/// three ADR-023 conditions, routes commission to commissionTreasury
/// (ADR-024), and applies the hardcoded caps from ADR-026.
/// @dev Implemented in 4 stages (Block 7 Sprint J4):
///   Stage 1 — skeleton + state + admin + create/fund/cancel + views
///   Stage 2 — shipment groups + release flows
///   Stage 3 — permissionless triggers
///   Stage 4 — dispute hooks + forceRefund + legal hold + pause
/// Stage 1 functions not yet implemented revert with "Not yet
/// implemented — Sprint J4 block later".
///
/// Naming note (ADR-027): the interface-level setter names are
/// setStakeContract / setDisputeContract / setReputationContract
/// (long form, canonical per SPEC §12.4), while EtaloDispute's
/// internal setters use the short form (setStake / setDispute / ...).
/// This cosmetic inconsistency is accepted — SPEC §12 is canonical
/// for the escrow surface.
contract EtaloEscrow is IEtaloEscrow, Ownable, ReentrancyGuard {
    // ============================================================
    // Constants (SPEC §11)
    // ============================================================

    // Commissions
    uint256 public constant COMMISSION_INTRA_BPS = 180;          // 1.8%
    uint256 public constant COMMISSION_CROSS_BPS = 270;          // 2.7%
    uint256 public constant COMMISSION_TOP_SELLER_BPS = 120;     // 1.2%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Auto-release timers
    uint256 public constant AUTO_RELEASE_INTRA = 3 days;
    uint256 public constant AUTO_RELEASE_TOP_SELLER = 2 days;
    uint256 public constant AUTO_RELEASE_CROSS_FINAL = 5 days;
    uint256 public constant MAJORITY_RELEASE_DELAY = 72 hours;

    // Auto-refund deadlines
    uint256 public constant AUTO_REFUND_INACTIVE_INTRA = 7 days;
    uint256 public constant AUTO_REFUND_INACTIVE_CROSS = 14 days;

    // Cross-border release percentages (basis points of itemNet)
    uint256 public constant SHIPPING_RELEASE_PCT = 2000;         // 20%
    uint256 public constant MAJORITY_RELEASE_PCT = 7000;         // 70%
    uint256 public constant FINAL_RELEASE_PCT = 1000;            // 10%

    // Architectural limits (ADR-026)
    uint256 public constant MAX_TVL_USDT = 50_000 * 10 ** 6;
    uint256 public constant MAX_ORDER_USDT = 500 * 10 ** 6;
    uint256 public constant MAX_SELLER_WEEKLY_VOLUME = 5_000 * 10 ** 6;
    uint256 public constant EMERGENCY_PAUSE_MAX = 7 days;
    uint256 public constant EMERGENCY_PAUSE_COOLDOWN = 30 days;

    // Operational limits
    uint256 public constant MAX_ITEMS_PER_GROUP = 20;
    uint256 public constant MAX_ITEMS_PER_ORDER = 50;

    // Force refund (ADR-023)
    uint256 public constant FORCE_REFUND_INACTIVITY_THRESHOLD = 90 days;

    // ============================================================
    // State
    // ============================================================

    IERC20 public immutable usdt;

    // Cross-contract refs (all settable per deployment-ordering pattern)
    IEtaloStake public stake;
    IEtaloDispute public dispute;
    IEtaloReputation public reputation;

    // Treasuries (ADR-024)
    address public commissionTreasury;
    address public creditsTreasury;
    address public communityFund;

    // Counters — 1-indexed; 0 means "invalid / not set"
    uint256 private _nextOrderId;
    uint256 private _nextItemId;
    uint256 private _nextGroupId;

    // Core state — note: the OrderStatus.Disputed enum value is not
    // actively set by EtaloEscrow V2 (ADR-015 makes the item-level
    // status the source of truth for dispute state; setting
    // order.globalStatus = Disputed transiently would require
    // bookkeeping for multi-dispute back-and-forth and buys nothing).
    mapping(uint256 => EtaloTypes.Order) private _orders;
    mapping(uint256 => EtaloTypes.Item) private _items;
    mapping(uint256 => EtaloTypes.ShipmentGroup) private _groups;
    mapping(uint256 => uint256[]) private _orderItems;   // orderId → itemIds
    mapping(uint256 => uint256[]) private _orderGroups;  // orderId → groupIds
    mapping(uint256 => uint256) private _itemsShippedCount; // orderId → # items assigned to a group

    // TVL and weekly volume tracking (§9)
    uint256 public totalEscrowedAmount;
    mapping(address => uint256) public sellerWeeklyVolume;
    mapping(address => uint256) public sellerWeekStartTimestamp;

    // Emergency pause (§9.5)
    uint256 public pausedUntil;
    uint256 public lastPauseEndedAt;

    // Legal hold registry (ADR-023)
    mapping(uint256 => bytes32) public legalHoldRegistry;

    // ============================================================
    // Modifiers
    // ============================================================

    modifier onlyDispute() {
        require(msg.sender == address(dispute), "Only dispute contract");
        _;
    }

    modifier whenNotPaused() {
        require(block.timestamp > pausedUntil, "Contract paused");
        _;
    }

    modifier orderExistsCheck(uint256 orderId) {
        require(orderId > 0 && orderId <= _nextOrderId, "Order does not exist");
        _;
    }

    modifier itemExistsCheck(uint256 itemId) {
        require(itemId > 0 && itemId <= _nextItemId, "Item does not exist");
        _;
    }

    modifier groupExistsCheck(uint256 groupId) {
        require(groupId > 0 && groupId <= _nextGroupId, "Group does not exist");
        _;
    }

    // ============================================================
    // Constructor
    // ============================================================

    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        usdt = IERC20(_usdt);
    }

    // ============================================================
    // Admin setters (§12.4)
    // ============================================================

    function setCommissionTreasury(address newTreasury) external onlyOwner {
        emit CommissionTreasuryUpdated(commissionTreasury, newTreasury);
        commissionTreasury = newTreasury;
    }

    function setCreditsTreasury(address newTreasury) external onlyOwner {
        emit CreditsTreasuryUpdated(creditsTreasury, newTreasury);
        creditsTreasury = newTreasury;
    }

    function setCommunityFund(address newFund) external onlyOwner {
        emit CommunityFundUpdated(communityFund, newFund);
        communityFund = newFund;
    }

    function setDisputeContract(address newContract) external onlyOwner {
        emit DisputeContractUpdated(address(dispute), newContract);
        dispute = IEtaloDispute(newContract);
    }

    function setStakeContract(address newContract) external onlyOwner {
        emit StakeContractUpdated(address(stake), newContract);
        stake = IEtaloStake(newContract);
    }

    function setReputationContract(address newContract) external onlyOwner {
        emit ReputationContractUpdated(address(reputation), newContract);
        reputation = IEtaloReputation(newContract);
    }

    // ============================================================
    // Seller / buyer lifecycle — Stage 1
    // ============================================================

    /// @inheritdoc IEtaloEscrow
    function createOrderWithItems(
        address seller,
        uint256[] calldata itemPrices,
        bool isCrossBorder
    ) external whenNotPaused returns (uint256 orderId) {
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Cannot buy from self");
        require(itemPrices.length > 0, "No items");
        require(itemPrices.length <= MAX_ITEMS_PER_ORDER, "Too many items");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < itemPrices.length; i++) {
            require(itemPrices[i] > 0, "Zero-priced item");
            totalAmount += itemPrices[i];
        }

        require(totalAmount <= MAX_ORDER_USDT, "Exceeds per-order cap");

        // ADR-020 stake gate uses totalAmount (not maxItemPrice) —
        // the stake/exposure ratio must reflect the whole order per
        // ADR-020 when combined with ADR-026 caps.
        if (isCrossBorder) {
            require(address(stake) != address(0), "Stake contract not set");
            require(
                stake.isEligibleForOrder(seller, totalAmount),
                "Seller stake ineligible"
            );
        }

        uint256 totalCommission = _calculateCommission(totalAmount, isCrossBorder, seller);

        orderId = ++_nextOrderId;

        _orders[orderId] = EtaloTypes.Order({
            orderId: orderId,
            buyer: msg.sender,
            seller: seller,
            totalAmount: totalAmount,
            totalCommission: totalCommission,
            createdAt: block.timestamp,
            fundedAt: 0,
            isCrossBorder: isCrossBorder,
            globalStatus: EtaloTypes.OrderStatus.Created,
            itemCount: itemPrices.length,
            shipmentGroupCount: 0
        });

        uint256 sumAssigned = 0;
        uint256 lastIdx = itemPrices.length - 1;
        for (uint256 i = 0; i < itemPrices.length; i++) {
            uint256 itemId = ++_nextItemId;
            uint256 itemCommission;
            if (i < lastIdx) {
                itemCommission = (itemPrices[i] * totalCommission) / totalAmount;
                sumAssigned += itemCommission;
            } else {
                // Last item absorbs the dust so per-item commissions
                // sum exactly to totalCommission.
                itemCommission = totalCommission - sumAssigned;
            }

            _items[itemId] = EtaloTypes.Item({
                itemId: itemId,
                orderId: orderId,
                itemPrice: itemPrices[i],
                itemCommission: itemCommission,
                shipmentGroupId: 0,
                releasedAmount: 0,
                status: EtaloTypes.ItemStatus.Pending
            });
            _orderItems[orderId].push(itemId);
        }

        emit OrderCreated(
            orderId,
            msg.sender,
            seller,
            totalAmount,
            isCrossBorder,
            itemPrices.length
        );
    }

    /// @inheritdoc IEtaloEscrow
    function fundOrder(uint256 orderId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
    {
        EtaloTypes.Order storage order = _orders[orderId];
        require(msg.sender == order.buyer, "Only buyer");
        require(order.globalStatus == EtaloTypes.OrderStatus.Created, "Order not Created");

        // Checks
        require(
            totalEscrowedAmount + order.totalAmount <= MAX_TVL_USDT,
            "Global TVL cap reached"
        );
        _updateSellerWeeklyVolume(order.seller, order.totalAmount);

        // Effects
        totalEscrowedAmount += order.totalAmount;
        order.globalStatus = EtaloTypes.OrderStatus.Funded;
        order.fundedAt = block.timestamp;

        // Interactions
        require(
            usdt.transferFrom(msg.sender, address(this), order.totalAmount),
            "USDT transfer failed"
        );
        if (order.isCrossBorder && address(stake) != address(0)) {
            stake.incrementActiveSales(order.seller);
        }

        emit OrderFunded(orderId, block.timestamp);
    }

    /// @inheritdoc IEtaloEscrow
    function cancelOrder(uint256 orderId)
        external
        whenNotPaused
        orderExistsCheck(orderId)
    {
        EtaloTypes.Order storage order = _orders[orderId];
        require(msg.sender == order.buyer, "Only buyer");
        require(
            order.globalStatus == EtaloTypes.OrderStatus.Created,
            "Can only cancel Created orders"
        );

        order.globalStatus = EtaloTypes.OrderStatus.Cancelled;
        emit OrderCancelled(orderId);
    }

    // ============================================================
    // Stage 2+ functions — stubs
    // ============================================================

    /// @inheritdoc IEtaloEscrow
    function shipItemsGrouped(
        uint256 /* orderId */,
        uint256[] calldata /* itemIds */,
        bytes32 /* proofHash */
    ) external pure returns (uint256) {
        revert("Not yet implemented (Stage 2)");
    }

    /// @inheritdoc IEtaloEscrow
    function markGroupArrived(
        uint256 /* orderId */,
        uint256 /* groupId */,
        bytes32 /* proofHash */
    ) external pure {
        revert("Not yet implemented (Stage 2)");
    }

    /// @inheritdoc IEtaloEscrow
    function confirmItemDelivery(uint256 /* orderId */, uint256 /* itemId */) external pure {
        revert("Not yet implemented (Stage 2)");
    }

    /// @inheritdoc IEtaloEscrow
    function confirmGroupDelivery(uint256 /* orderId */, uint256 /* groupId */) external pure {
        revert("Not yet implemented (Stage 2)");
    }

    /// @inheritdoc IEtaloEscrow
    function triggerMajorityRelease(uint256 /* orderId */, uint256 /* groupId */) external pure {
        revert("Not yet implemented (Stage 3)");
    }

    /// @inheritdoc IEtaloEscrow
    function triggerAutoReleaseForItem(uint256 /* orderId */, uint256 /* itemId */) external pure {
        revert("Not yet implemented (Stage 3)");
    }

    /// @inheritdoc IEtaloEscrow
    function triggerAutoRefundIfInactive(uint256 /* orderId */) external pure {
        revert("Not yet implemented (Stage 3)");
    }

    /// @inheritdoc IEtaloEscrow
    function forceRefund(uint256 /* orderId */, bytes32 /* reasonHash */) external pure {
        revert("Not yet implemented (Stage 4)");
    }

    /// @inheritdoc IEtaloEscrow
    function registerLegalHold(uint256 /* orderId */, bytes32 /* documentHash */) external pure {
        revert("Not yet implemented (Stage 4)");
    }

    /// @inheritdoc IEtaloEscrow
    function clearLegalHold(uint256 /* orderId */) external pure {
        revert("Not yet implemented (Stage 4)");
    }

    /// @inheritdoc IEtaloEscrow
    function emergencyPause() external pure {
        revert("Not yet implemented (Stage 4)");
    }

    /// @inheritdoc IEtaloEscrow
    function markItemDisputed(uint256 /* orderId */, uint256 /* itemId */) external pure {
        revert("Not yet implemented (Stage 4)");
    }

    /// @inheritdoc IEtaloEscrow
    function resolveItemDispute(
        uint256 /* orderId */,
        uint256 /* itemId */,
        uint256 /* refundAmount */
    ) external pure {
        revert("Not yet implemented (Stage 4)");
    }

    // ============================================================
    // Views
    // ============================================================

    /// @inheritdoc IEtaloEscrow
    function getOrder(uint256 orderId) external view returns (EtaloTypes.Order memory) {
        return _orders[orderId];
    }

    /// @inheritdoc IEtaloEscrow
    function getItem(uint256 itemId) external view returns (EtaloTypes.Item memory) {
        return _items[itemId];
    }

    /// @inheritdoc IEtaloEscrow
    function getShipmentGroup(uint256 groupId)
        external
        view
        returns (EtaloTypes.ShipmentGroup memory)
    {
        return _groups[groupId];
    }

    /// @inheritdoc IEtaloEscrow
    function totalEscrowed() external view returns (uint256) {
        return totalEscrowedAmount;
    }

    /// @notice Helper for off-chain indexing (backend J5 / subgraph).
    /// Not part of the canonical interface per SPEC §12.
    function getOrderCount() external view returns (uint256) {
        return _nextOrderId;
    }

    /// @notice Returns the list of itemIds for an order.
    function getOrderItems(uint256 orderId) external view returns (uint256[] memory) {
        return _orderItems[orderId];
    }

    /// @notice Returns the list of shipment groupIds for an order.
    function getOrderGroups(uint256 orderId) external view returns (uint256[] memory) {
        return _orderGroups[orderId];
    }

    // ============================================================
    // Internal helpers
    // ============================================================

    /// @dev Cross-border always applies COMMISSION_CROSS_BPS; intra
    /// applies COMMISSION_TOP_SELLER_BPS when the seller currently
    /// holds the Top Seller badge, else COMMISSION_INTRA_BPS.
    function _calculateCommission(
        uint256 amount,
        bool isCrossBorder,
        address seller
    ) internal view returns (uint256) {
        uint256 bps;
        if (isCrossBorder) {
            bps = COMMISSION_CROSS_BPS;
        } else if (
            address(reputation) != address(0) && reputation.isTopSeller(seller)
        ) {
            bps = COMMISSION_TOP_SELLER_BPS;
        } else {
            bps = COMMISSION_INTRA_BPS;
        }
        return (amount * bps) / BPS_DENOMINATOR;
    }

    /// @dev Resets the seller's weekly window if a full week has
    /// elapsed, then validates the incoming amount against the cap
    /// and records it. Reverts with "Seller weekly cap" on exceeding.
    function _updateSellerWeeklyVolume(address seller, uint256 amount) internal {
        if (block.timestamp > sellerWeekStartTimestamp[seller] + 1 weeks) {
            sellerWeeklyVolume[seller] = 0;
            sellerWeekStartTimestamp[seller] = block.timestamp;
        }
        require(
            sellerWeeklyVolume[seller] + amount <= MAX_SELLER_WEEKLY_VOLUME,
            "Seller weekly cap"
        );
        sellerWeeklyVolume[seller] += amount;
    }
}
