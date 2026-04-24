// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { EtaloTypes } from "../types/EtaloTypes.sol";

/// @title IEtaloEscrow
/// @notice Central escrow orchestrator for the V2 Boutique flow
/// (ADR-015). Holds USDT funded by buyers and releases it to sellers
/// along the progressive schedule defined in ADR-018 (cross-border
/// 20/70/10) and ADR-019 (auto-refund on seller inactivity). Commission
/// routes to commissionTreasury per ADR-024. Hard-coded architectural
/// limits per ADR-026.
/// @dev Function names follow docs/SPEC_SMART_CONTRACT_V2.md §12.
/// Some names differ from docs/SPRINT_J4.md Block 7 sketch (e.g.
/// shipItemsGrouped vs createShipmentGroup); the SPEC is authoritative.
interface IEtaloEscrow {
    // ===== Events (SPEC §13) =====
    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        uint256 totalAmount,
        bool isCrossBorder,
        uint256 itemCount
    );
    event OrderFunded(uint256 indexed orderId, uint256 fundedAt);
    event ShipmentGroupCreated(
        uint256 indexed orderId,
        uint256 indexed groupId,
        uint256[] itemIds,
        bytes32 proofHash
    );
    event GroupArrived(
        uint256 indexed orderId,
        uint256 indexed groupId,
        bytes32 arrivalProofHash,
        uint256 arrivedAt
    );
    event PartialReleaseTriggered(
        uint256 indexed orderId,
        uint256 indexed groupId,
        uint8 releaseStage,
        uint256 amount
    );
    event ItemReleased(uint256 indexed orderId, uint256 indexed itemId, uint256 amount);
    event ItemCompleted(uint256 indexed orderId, uint256 indexed itemId);
    event OrderCompleted(uint256 indexed orderId);
    event OrderCancelled(uint256 indexed orderId);
    event ItemDisputed(uint256 indexed orderId, uint256 indexed itemId);
    event ItemDisputeResolved(
        uint256 indexed orderId,
        uint256 indexed itemId,
        uint256 refundAmount
    );
    event ForceRefundExecuted(
        uint256 indexed orderId,
        address indexed admin,
        uint256 refundAmount,
        uint256 timestamp,
        bytes32 reasonHash
    );
    event LegalHoldRegistered(
        uint256 indexed orderId,
        bytes32 documentHash,
        uint256 timestamp
    );
    event LegalHoldCleared(uint256 indexed orderId, uint256 timestamp);
    event EmergencyPauseActivated(address indexed admin, uint256 pausedUntil);
    event AutoRefundInactive(uint256 indexed orderId, uint256 timestamp);
    event AutoReleaseTriggered(uint256 indexed orderId, uint256 indexed itemId);
    event CommissionTreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event CreditsTreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event CommunityFundUpdated(address indexed oldFund, address indexed newFund);
    event DisputeContractUpdated(address indexed oldContract, address indexed newContract);
    event StakeContractUpdated(address indexed oldContract, address indexed newContract);
    event ReputationContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );

    // ===== Seller lifecycle (§12.1) =====

    /// @notice Creates an order with N items from msg.sender (buyer)
    /// to `seller`. Reverts on architectural-limit breaches (ADR-026)
    /// and, for cross-border, when the seller's stake tier is
    /// insufficient (ADR-020).
    function createOrderWithItems(
        address seller,
        uint256[] calldata itemPrices,
        bool isCrossBorder
    ) external returns (uint256 orderId);

    /// @notice Seller regroups one or more items in a physical
    /// shipment and attaches a proof hash. Triggers the 20% release
    /// for cross-border orders (ADR-018).
    function shipItemsGrouped(
        uint256 orderId,
        uint256[] calldata itemIds,
        bytes32 proofHash
    ) external returns (uint256 groupId);

    /// @notice Marks a shipment group as arrived in the buyer's
    /// country (cross-border only). Starts the 72h majority-release
    /// timer. Callable by seller OR buyer.
    function markGroupArrived(
        uint256 orderId,
        uint256 groupId,
        bytes32 proofHash
    ) external;

    // ===== Buyer lifecycle (§12.2) =====

    /// @notice Buyer pulls the order amount via USDT transferFrom. The
    /// buyer must have approved at least totalAmount beforehand.
    function fundOrder(uint256 orderId) external;

    /// @notice Immediately releases this item's final 10% (cross-
    /// border) or 100% (intra) to the seller.
    function confirmItemDelivery(uint256 orderId, uint256 itemId) external;

    /// @notice Shorthand — confirms every non-terminal item in the
    /// group in one transaction.
    function confirmGroupDelivery(uint256 orderId, uint256 groupId) external;

    /// @notice Buyer cancels an unfunded order. Reverts once fundOrder
    /// has run.
    function cancelOrder(uint256 orderId) external;

    // ===== Permissionless triggers (§12.3) =====

    /// @notice Anyone can trigger the 70% majority release after the
    /// 72h window following arrival, provided no item in the group is
    /// disputed (disputed items are bypassed by the release math).
    function triggerMajorityRelease(uint256 orderId, uint256 groupId) external;

    /// @notice Anyone can trigger the final 10% release for a single
    /// item after `finalReleaseAfter` of its shipment group.
    function triggerAutoReleaseForItem(uint256 orderId, uint256 itemId) external;

    /// @notice Anyone can refund a funded order if the seller never
    /// created any shipment group within the deadline (7 days intra,
    /// 14 days cross-border per ADR-019).
    function triggerAutoRefundIfInactive(uint256 orderId) external;

    // ===== Admin (§12.4) =====

    function setCommissionTreasury(address newTreasury) external;
    function setCreditsTreasury(address newTreasury) external;
    function setCommunityFund(address newFund) external;
    function setDisputeContract(address newContract) external;
    function setStakeContract(address newContract) external;
    function setReputationContract(address newContract) external;

    /// @notice Last-resort refund gated by three codified conditions
    /// per ADR-023 — ALL three must hold: dispute contract unset AND
    /// 90+ days since fundedAt AND a registered legal hold. All three
    /// are public on-chain facts.
    function forceRefund(uint256 orderId, bytes32 reasonHash) external;

    function registerLegalHold(uint256 orderId, bytes32 documentHash) external;
    function clearLegalHold(uint256 orderId) external;

    /// @notice Owner-triggered halt of mutating functions. Auto-expires
    /// after EMERGENCY_PAUSE_MAX (7d) and requires
    /// EMERGENCY_PAUSE_COOLDOWN (30d) between consecutive pauses
    /// (ADR-026).
    function emergencyPause() external;

    // ===== Dispute-only (§12.5) =====

    /// @notice Freezes an item pending dispute resolution. Called by
    /// EtaloDispute on openDispute.
    function markItemDisputed(uint256 orderId, uint256 itemId) external;

    /// @notice Applies a dispute resolution: `refundAmount` goes to
    /// the buyer (up to the item price), the remainder releases to
    /// the seller. Called by EtaloDispute on resolution.
    function resolveItemDispute(
        uint256 orderId,
        uint256 itemId,
        uint256 refundAmount
    ) external;

    // ===== Views =====

    function getOrder(uint256 orderId) external view returns (EtaloTypes.Order memory);
    function getItem(uint256 itemId) external view returns (EtaloTypes.Item memory);
    function getShipmentGroup(uint256 groupId)
        external
        view
        returns (EtaloTypes.ShipmentGroup memory);

    function totalEscrowed() external view returns (uint256);
    function sellerWeeklyVolume(address seller) external view returns (uint256);
    function legalHoldRegistry(uint256 orderId) external view returns (bytes32);
    function pausedUntil() external view returns (uint256);
}
