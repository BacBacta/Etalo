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
        uint256 orderId,
        uint256[] calldata itemIds,
        bytes32 proofHash
    )
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
        returns (uint256 groupId)
    {
        EtaloTypes.Order storage order = _orders[orderId];
        require(msg.sender == order.seller, "Only seller");
        require(
            order.globalStatus == EtaloTypes.OrderStatus.Funded ||
                order.globalStatus == EtaloTypes.OrderStatus.PartiallyShipped,
            "Not in shippable state"
        );
        require(
            itemIds.length > 0 && itemIds.length <= MAX_ITEMS_PER_GROUP,
            "Invalid group size"
        );
        require(proofHash != bytes32(0), "Missing proof hash");

        // Validate all items before mutating state.
        for (uint256 i = 0; i < itemIds.length; i++) {
            EtaloTypes.Item storage item = _items[itemIds[i]];
            require(item.orderId == orderId, "Item not in order");
            require(item.status == EtaloTypes.ItemStatus.Pending, "Item not Pending");
        }

        groupId = ++_nextGroupId;

        EtaloTypes.ShipmentGroup storage group = _groups[groupId];
        group.groupId = groupId;
        group.orderId = orderId;
        group.shipmentProofHash = proofHash;
        group.shippedAt = block.timestamp;
        group.status = EtaloTypes.ShipmentStatus.Shipped;

        // Intra orders get finalReleaseAfter set immediately; cross-
        // border will set majorityReleaseAt + finalReleaseAfter at
        // markGroupArrived when the parcel reaches the destination.
        if (!order.isCrossBorder) {
            group.finalReleaseAfter =
                block.timestamp + _intraAutoReleaseDuration(order.seller);
        }

        for (uint256 i = 0; i < itemIds.length; i++) {
            group.itemIds.push(itemIds[i]);
            EtaloTypes.Item storage item = _items[itemIds[i]];
            item.shipmentGroupId = groupId;
            item.status = EtaloTypes.ItemStatus.Shipped;
        }

        _orderGroups[orderId].push(groupId);
        order.shipmentGroupCount++;

        uint256 shippedSoFar = _itemsShippedCount[orderId] + itemIds.length;
        _itemsShippedCount[orderId] = shippedSoFar;
        if (shippedSoFar == order.itemCount) {
            order.globalStatus = EtaloTypes.OrderStatus.AllShipped;
        } else {
            order.globalStatus = EtaloTypes.OrderStatus.PartiallyShipped;
        }

        emit ShipmentGroupCreated(orderId, groupId, itemIds, proofHash);

        // Cross-border shipping proof triggers the 20% net release
        // for every item in the group (commission stays in escrow
        // until final release — Q2 arbitrage).
        if (order.isCrossBorder) {
            uint256 totalRelease = 0;
            for (uint256 i = 0; i < itemIds.length; i++) {
                totalRelease += _accrueItemPartialRelease(itemIds[i], SHIPPING_RELEASE_PCT);
            }
            group.releaseStage = 1;
            if (totalRelease > 0) {
                totalEscrowedAmount -= totalRelease;
                require(
                    usdt.transfer(order.seller, totalRelease),
                    "USDT transfer failed"
                );
            }
            emit PartialReleaseTriggered(orderId, groupId, 1, totalRelease);
        }
    }

    /// @inheritdoc IEtaloEscrow
    function markGroupArrived(
        uint256 orderId,
        uint256 groupId,
        bytes32 proofHash
    ) external whenNotPaused orderExistsCheck(orderId) groupExistsCheck(groupId) {
        EtaloTypes.ShipmentGroup storage group = _groups[groupId];
        require(group.orderId == orderId, "Group not in order");
        EtaloTypes.Order storage order = _orders[orderId];
        require(order.isCrossBorder, "Intra order has no arrival step");
        require(
            msg.sender == order.buyer || msg.sender == order.seller,
            "Not buyer or seller"
        );
        require(
            group.status == EtaloTypes.ShipmentStatus.Shipped,
            "Group not Shipped"
        );
        require(proofHash != bytes32(0), "Missing proof hash");

        group.arrivedAt = block.timestamp;
        group.arrivalProofHash = proofHash;
        group.majorityReleaseAt = block.timestamp + MAJORITY_RELEASE_DELAY;
        group.finalReleaseAfter = block.timestamp + AUTO_RELEASE_CROSS_FINAL;
        group.status = EtaloTypes.ShipmentStatus.Arrived;

        for (uint256 i = 0; i < group.itemIds.length; i++) {
            EtaloTypes.Item storage item = _items[group.itemIds[i]];
            if (item.status == EtaloTypes.ItemStatus.Shipped) {
                item.status = EtaloTypes.ItemStatus.Arrived;
            }
        }

        emit GroupArrived(orderId, groupId, proofHash, block.timestamp);
    }

    /// @inheritdoc IEtaloEscrow
    function confirmItemDelivery(uint256 orderId, uint256 itemId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
        itemExistsCheck(itemId)
    {
        EtaloTypes.Order storage order = _orders[orderId];
        EtaloTypes.Item storage item = _items[itemId];
        require(item.orderId == orderId, "Item not in order");
        require(msg.sender == order.buyer, "Only buyer");
        require(
            item.status == EtaloTypes.ItemStatus.Shipped ||
                item.status == EtaloTypes.ItemStatus.Arrived ||
                item.status == EtaloTypes.ItemStatus.Delivered,
            "Item not in confirmable state"
        );

        _releaseItemFully(orderId, itemId);
    }

    /// @inheritdoc IEtaloEscrow
    function confirmGroupDelivery(uint256 orderId, uint256 groupId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
        groupExistsCheck(groupId)
    {
        EtaloTypes.ShipmentGroup storage group = _groups[groupId];
        require(group.orderId == orderId, "Group not in order");
        EtaloTypes.Order storage order = _orders[orderId];
        require(msg.sender == order.buyer, "Only buyer");

        for (uint256 i = 0; i < group.itemIds.length; i++) {
            uint256 itemId = group.itemIds[i];
            EtaloTypes.ItemStatus status = _items[itemId].status;
            if (
                status == EtaloTypes.ItemStatus.Shipped ||
                status == EtaloTypes.ItemStatus.Arrived ||
                status == EtaloTypes.ItemStatus.Delivered
            ) {
                _releaseItemFully(orderId, itemId);
            }
        }
    }

    /// @inheritdoc IEtaloEscrow
    /// @notice Permissionless — anyone may call after the 72h post-
    /// arrival window. Releases 70% of each non-Disputed item's net
    /// to the seller (commission stays in escrow). Items already in
    /// Disputed state are skipped so sibling-item release continues
    /// while the dispute runs (ADR-015 item-level isolation).
    function triggerMajorityRelease(uint256 orderId, uint256 groupId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
        groupExistsCheck(groupId)
    {
        EtaloTypes.ShipmentGroup storage group = _groups[groupId];
        require(group.orderId == orderId, "Group not in order");
        EtaloTypes.Order storage order = _orders[orderId];
        require(order.isCrossBorder, "Intra order has no majority stage");
        require(
            group.status == EtaloTypes.ShipmentStatus.Arrived,
            "Group not Arrived"
        );
        require(group.releaseStage == 1, "Majority already triggered or invalid stage");
        require(
            block.timestamp >= group.majorityReleaseAt,
            "72h window not elapsed"
        );

        uint256 totalRelease = 0;
        for (uint256 i = 0; i < group.itemIds.length; i++) {
            uint256 itemId = group.itemIds[i];
            if (_items[itemId].status == EtaloTypes.ItemStatus.Disputed) {
                continue;
            }
            totalRelease += _accrueItemPartialRelease(itemId, MAJORITY_RELEASE_PCT);
        }

        group.releaseStage = 2;

        if (totalRelease > 0) {
            totalEscrowedAmount -= totalRelease;
            require(
                usdt.transfer(order.seller, totalRelease),
                "USDT transfer failed"
            );
        }
        emit PartialReleaseTriggered(orderId, groupId, 2, totalRelease);
    }

    /// @inheritdoc IEtaloEscrow
    /// @notice Permissionless — anyone may call once the item's
    /// group-level finalReleaseAfter has elapsed. Releases the
    /// item's remaining net to the seller plus the full itemCommission
    /// to commissionTreasury and closes the item. For cross-border
    /// orders the group must have reached Arrived state first.
    function triggerAutoReleaseForItem(uint256 orderId, uint256 itemId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
        itemExistsCheck(itemId)
    {
        EtaloTypes.Item storage item = _items[itemId];
        EtaloTypes.Order storage order = _orders[orderId];
        require(item.orderId == orderId, "Item not in order");
        require(
            item.status != EtaloTypes.ItemStatus.Released &&
                item.status != EtaloTypes.ItemStatus.Refunded &&
                item.status != EtaloTypes.ItemStatus.Disputed,
            "Item not releasable"
        );
        require(item.shipmentGroupId != 0, "Item not shipped");

        EtaloTypes.ShipmentGroup storage group = _groups[item.shipmentGroupId];
        if (order.isCrossBorder) {
            require(
                group.status == EtaloTypes.ShipmentStatus.Arrived,
                "Group not Arrived"
            );
        }
        require(
            group.finalReleaseAfter > 0 &&
                block.timestamp >= group.finalReleaseAfter,
            "Final release not yet"
        );

        _releaseItemFully(orderId, itemId);
        emit AutoReleaseTriggered(orderId, itemId);
    }

    /// @inheritdoc IEtaloEscrow
    /// @notice Permissionless — anyone (buyer, keeper, helper bot)
    /// may call once the seller-inactivity deadline has elapsed
    /// without a single shipment group having been created. The
    /// order's whole totalAmount refunds to the buyer, every item
    /// flips to Refunded, the order flips to Refunded, and the
    /// seller's cross-border active-sales counter is decremented.
    /// ADR-019 deadlines: 7 days intra, 14 days cross-border.
    function triggerAutoRefundIfInactive(uint256 orderId)
        external
        nonReentrant
        whenNotPaused
        orderExistsCheck(orderId)
    {
        EtaloTypes.Order storage order = _orders[orderId];
        // A Funded status means no shipment group has been created
        // yet — shipItemsGrouped promotes the order to PartiallyShipped
        // or AllShipped, so this predicate also guards against refund
        // once the seller has started fulfilment.
        require(
            order.globalStatus == EtaloTypes.OrderStatus.Funded,
            "Not in Funded state"
        );

        uint256 deadline = order.isCrossBorder
            ? order.fundedAt + AUTO_REFUND_INACTIVE_CROSS
            : order.fundedAt + AUTO_REFUND_INACTIVE_INTRA;
        require(block.timestamp > deadline, "Deadline not reached");

        uint256[] storage itemIds = _orderItems[orderId];
        for (uint256 i = 0; i < itemIds.length; i++) {
            _items[itemIds[i]].status = EtaloTypes.ItemStatus.Refunded;
        }
        order.globalStatus = EtaloTypes.OrderStatus.Refunded;

        uint256 refundAmount = order.totalAmount;
        totalEscrowedAmount -= refundAmount;

        require(
            usdt.transfer(order.buyer, refundAmount),
            "USDT transfer failed"
        );
        if (order.isCrossBorder && address(stake) != address(0)) {
            stake.decrementActiveSales(order.seller);
        }

        emit AutoRefundInactive(orderId, block.timestamp);
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
    /// @notice Called by EtaloDispute when a buyer opens a dispute.
    /// Flips the item's status to Disputed which blocks further
    /// release (triggerMajorityRelease skips, triggerAutoReleaseForItem
    /// reverts) until resolveItemDispute closes the case.
    function markItemDisputed(uint256 orderId, uint256 itemId)
        external
        onlyDispute
        orderExistsCheck(orderId)
        itemExistsCheck(itemId)
    {
        EtaloTypes.Item storage item = _items[itemId];
        require(item.orderId == orderId, "Item not in order");
        require(
            item.status != EtaloTypes.ItemStatus.Released &&
                item.status != EtaloTypes.ItemStatus.Refunded &&
                item.status != EtaloTypes.ItemStatus.Disputed,
            "Item not disputable"
        );
        item.status = EtaloTypes.ItemStatus.Disputed;
        emit ItemDisputed(orderId, itemId);
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

    /// @dev Auto-release duration for intra orders — 2 days for a
    /// current Top Seller, else 3 days. Evaluated at ship time (not
    /// create time) so a seller who earns Top Seller between create
    /// and ship enjoys the faster release window.
    function _intraAutoReleaseDuration(address seller) internal view returns (uint256) {
        if (
            address(reputation) != address(0) && reputation.isTopSeller(seller)
        ) {
            return AUTO_RELEASE_TOP_SELLER;
        }
        return AUTO_RELEASE_INTRA;
    }

    /// @dev Credits a partial net release (e.g. 20% at ship or 70%
    /// at majority) to an item's releasedAmount and returns the
    /// amount so the caller can batch the USDT transfer. Commission
    /// stays in escrow until final release (Q2).
    function _accrueItemPartialRelease(uint256 itemId, uint256 bps)
        internal
        returns (uint256 portion)
    {
        EtaloTypes.Item storage item = _items[itemId];
        uint256 itemNet = item.itemPrice - item.itemCommission;
        portion = (itemNet * bps) / BPS_DENOMINATOR;
        item.releasedAmount += portion;
    }

    /// @dev Closes out an item: releases any remaining net to the
    /// seller, sends the full itemCommission to commissionTreasury,
    /// flips status to Released, records the sale in Reputation,
    /// and finally checks whether the order is now complete.
    function _releaseItemFully(uint256 orderId, uint256 itemId) internal {
        EtaloTypes.Order storage order = _orders[orderId];
        EtaloTypes.Item storage item = _items[itemId];

        uint256 itemNet = item.itemPrice - item.itemCommission;
        uint256 remainingNet = itemNet - item.releasedAmount;

        item.releasedAmount = itemNet;
        item.status = EtaloTypes.ItemStatus.Released;

        uint256 payout = remainingNet + item.itemCommission;
        totalEscrowedAmount -= payout;

        if (remainingNet > 0) {
            require(
                usdt.transfer(order.seller, remainingNet),
                "USDT seller transfer failed"
            );
        }
        if (item.itemCommission > 0) {
            require(
                commissionTreasury != address(0),
                "Commission treasury not set"
            );
            require(
                usdt.transfer(commissionTreasury, item.itemCommission),
                "USDT commission transfer failed"
            );
        }

        emit ItemReleased(orderId, itemId, payout);
        emit ItemCompleted(orderId, itemId);

        if (address(reputation) != address(0)) {
            reputation.recordCompletedOrder(order.seller, orderId, item.itemPrice);
            reputation.checkAndUpdateTopSeller(order.seller);
        }

        _checkOrderCompletion(orderId);
    }

    /// @dev Walks the order's items; when every item has reached a
    /// terminal state (Released or Refunded) promotes the order to
    /// Completed (at least one Released) or Refunded (all Refunded),
    /// and decrements the seller's cross-border active-sales count.
    /// Not emitting OrderCompleted for the all-refunded case — that
    /// path is announced by the refund trigger (auto/force/dispute).
    function _checkOrderCompletion(uint256 orderId) internal {
        EtaloTypes.Order storage order = _orders[orderId];
        if (
            order.globalStatus == EtaloTypes.OrderStatus.Completed ||
            order.globalStatus == EtaloTypes.OrderStatus.Refunded ||
            order.globalStatus == EtaloTypes.OrderStatus.Cancelled
        ) {
            return;
        }

        uint256[] storage itemIds = _orderItems[orderId];
        uint256 terminal = 0;
        uint256 refunded = 0;
        for (uint256 i = 0; i < itemIds.length; i++) {
            EtaloTypes.ItemStatus s = _items[itemIds[i]].status;
            if (
                s == EtaloTypes.ItemStatus.Released ||
                s == EtaloTypes.ItemStatus.Refunded
            ) {
                terminal++;
                if (s == EtaloTypes.ItemStatus.Refunded) refunded++;
            }
        }

        if (terminal == itemIds.length) {
            if (refunded == itemIds.length) {
                order.globalStatus = EtaloTypes.OrderStatus.Refunded;
            } else {
                order.globalStatus = EtaloTypes.OrderStatus.Completed;
                emit OrderCompleted(orderId);
            }
            if (
                order.isCrossBorder && address(stake) != address(0)
            ) {
                stake.decrementActiveSales(order.seller);
            }
        } else if (terminal > 0) {
            order.globalStatus = EtaloTypes.OrderStatus.PartiallyDelivered;
        }
    }
}
