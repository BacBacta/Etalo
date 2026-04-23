// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEtaloReputation
/// @notice Seller reputation tracker. Preserves the V1 write ABI
/// (completed orders, disputes, sanctions) and adds the isTopSeller
/// view consumed by EtaloStake for Tier 3 eligibility gating (ADR-020).
interface IEtaloReputation {
    // ===== Events =====
    event OrderCompleted(address indexed seller, uint256 totalVolume);
    event DisputeRecorded(address indexed seller, bool wonByBuyer);
    event TopSellerGranted(address indexed seller);
    event TopSellerRevoked(address indexed seller);
    event SellerSuspended(address indexed seller, string reason);

    // ===== Write (restricted) =====

    /// @notice Called by EtaloEscrow when an order reaches a terminal
    /// Released state. Credits the seller's totalVolume and may grant
    /// the Top Seller badge once thresholds are met.
    function recordCompletedOrder(address seller, uint256 orderVolume) external;

    /// @notice Called by EtaloDispute on resolution to log the outcome
    /// against the seller. Enough losses revoke the Top Seller badge.
    function recordDispute(address seller, bool wonByBuyer) external;

    /// @notice Owner-only suspension that blocks further order creation
    /// and revokes the Top Seller badge immediately.
    function sanctionSeller(address seller, string calldata reason) external;

    // ===== Views =====

    function getScore(address seller) external view returns (uint256);

    /// @notice Auto-release window in days for this seller:
    /// 3 days intra / 2 days intra Top Seller / 7 days cross-border.
    function getAutoReleaseDays(address seller, bool isCrossBorder)
        external
        view
        returns (uint256);

    /// @notice True when the seller currently holds the Top Seller
    /// badge. EtaloStake reads this to gate Tier 3 deposits.
    function isTopSeller(address seller) external view returns (bool);

    function isSuspended(address seller) external view returns (bool);

    function getOrdersCompleted(address seller) external view returns (uint256);
}
