// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title EtaloTypes
/// @notice Shared enums and structs used across the Etalo V2 contract
/// suite (Escrow, Stake, Voting, Dispute, Reputation). Wrapping them
/// in a library gives each type a namespace (EtaloTypes.X) so
/// independent files can import without symbol collisions.
/// @dev See docs/SPEC_SMART_CONTRACT_V2.md §3 for the canonical
/// structure definitions and rationale.
library EtaloTypes {
    /// @notice Global lifecycle state of an order.
    enum OrderStatus {
        Created,              // 0 — order metadata exists, no USDT yet
        Funded,               // 1 — USDT escrowed, awaiting shipment
        PartiallyShipped,     // 2 — at least one shipment group created
        AllShipped,           // 3 — every item is assigned to a group
        PartiallyDelivered,   // 4 — some items released or refunded
        Completed,            // 5 — all items in terminal state
        Disputed,             // 6 — at least one item currently disputed
        Refunded,             // 7 — all items refunded
        Cancelled             // 8 — order cancelled before funding
    }

    /// @notice Per-item state. Items are the unit of buyer-initiated
    /// disputes and granular release accounting.
    enum ItemStatus {
        Pending,    // 0 — funded, not yet assigned to a shipment group
        Shipped,    // 1 — included in a shipped group
        Arrived,    // 2 — group arrived in destination country (cross-border)
        Delivered,  // 3 — buyer confirmed receipt
        Released,   // 4 — seller paid for this item
        Disputed,   // 5 — frozen pending dispute resolution
        Refunded    // 6 — buyer refunded for this item
    }

    /// @notice Per-shipment-group state. Groups model the physical
    /// parcel dimension; an item belongs to exactly one group.
    enum ShipmentStatus {
        Pending,    // 0 — created, awaiting proof
        Shipped,    // 1 — in transit
        Arrived,    // 2 — arrived in buyer's country (cross-border)
        Delivered   // 3 — all member items reached a terminal state
    }

    /// @notice Cross-border seller stake tiers (ADR-020).
    enum StakeTier {
        None,         // 0 — no stake; cannot sell cross-border
        Starter,      // 1 — 10 USDT, max 3 concurrent sales, max 100 USDT/order
        Established,  // 2 — 25 USDT, max 10 concurrent sales, max 200 USDT/order
        TopSeller     // 3 — 50 USDT, unlimited concurrent sales and price
    }

    /// @notice Top-level checkout operation between one buyer and one
    /// seller, bundling one or more items.
    /// @dev See SPEC §3.1.
    struct Order {
        uint256 orderId;
        address buyer;
        address seller;
        uint256 totalAmount;            // sum of item prices, USDT (6 decimals)
        uint256 totalCommission;        // commission pre-computed at creation
        uint256 createdAt;              // block.timestamp at creation
        uint256 fundedAt;               // block.timestamp at fundOrder (0 if unfunded)
        bool isCrossBorder;             // drives commission and release schedule
        OrderStatus globalStatus;
        uint256 itemCount;
        uint256 shipmentGroupCount;
    }

    /// @notice A single disputable unit within an order.
    /// @dev See SPEC §3.2.
    struct Item {
        uint256 itemId;
        uint256 orderId;
        uint256 itemPrice;              // pre-commission, USDT (6 decimals)
        uint256 itemCommission;         // pro-rata share of order commission
        uint256 shipmentGroupId;        // 0 until assigned to a group
        uint256 releasedAmount;         // cumulative amount released to seller
        ItemStatus status;
    }

    /// @notice A physical parcel regrouping one or more items under a
    /// single shipping proof and release timer.
    /// @dev See SPEC §3.3.
    struct ShipmentGroup {
        uint256 groupId;
        uint256 orderId;
        uint256[] itemIds;
        bytes32 shipmentProofHash;      // set at shipItemsGrouped
        bytes32 arrivalProofHash;       // set at markGroupArrived (cross-border)
        uint256 shippedAt;
        uint256 arrivedAt;
        uint256 majorityReleaseAt;      // arrivedAt + 72h (cross-border)
        uint256 finalReleaseAfter;      // arrivedAt + 5d (cross-border) or shippedAt + 3d/2d (intra)
        ShipmentStatus status;
        uint8 releaseStage;             // 0=pending, 1=20%, 2=90%, 3=100%
    }
}
