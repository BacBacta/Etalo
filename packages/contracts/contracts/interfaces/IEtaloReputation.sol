// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEtaloReputation
/// @notice Seller reputation tracker. The V1 API (score formula,
/// sanction states, authorized-caller control) is preserved verbatim
/// so downstream callers keep working; V2 only tightens the Top Seller
/// criteria per ADR-020 and adds `lastSanctionAt` to support the
/// 90-day post-sanction cooldown.
interface IEtaloReputation {
    enum SellerStatus {
        Active,
        Suspended,
        Banned
    }

    struct SellerReputation {
        uint256 ordersCompleted;
        uint256 ordersDisputed;
        uint256 disputesLost;
        uint256 totalVolume;
        uint256 score;
        bool isTopSeller;
        SellerStatus status;
        uint256 lastSanctionAt;     // V2: timestamp of most recent non-Active status change (ADR-020)
        uint256 firstOrderAt;       // V2: timestamp of first recordCompletedOrder, used by EtaloStake for Tier 2 seniority (ADR-020)
    }

    // ===== Events (V1 verbatim) =====
    event OrderRecorded(address indexed seller, uint256 orderId, uint256 amount);
    event DisputeRecorded(address indexed seller, uint256 orderId, bool sellerLost);
    event TopSellerGranted(address indexed seller);
    event TopSellerRevoked(address indexed seller);
    event SellerSanctioned(address indexed seller, SellerStatus newStatus);
    event ScoreUpdated(address indexed seller, uint256 newScore);

    // ===== Write (restricted) =====

    /// @notice Called by EtaloEscrow on a released item to credit the
    /// seller's completed-order count and volume.
    function recordCompletedOrder(address seller, uint256 orderId, uint256 amount) external;

    /// @notice Called by EtaloDispute on resolution; `sellerLost`
    /// increments the disputesLost counter that blocks Top Seller.
    function recordDispute(address seller, uint256 orderId, bool sellerLost) external;

    /// @notice Re-evaluates the Top Seller status against the 4
    /// ADR-020 criteria (see implementation NatSpec). Explicit call
    /// keeps the badge transition event-driven.
    function checkAndUpdateTopSeller(address seller) external;

    /// @notice Owner-only. Changes the seller's status and stamps
    /// `lastSanctionAt` when moving to a non-Active status.
    function applySanction(address seller, SellerStatus newStatus) external;

    /// @notice Owner-only. Grants or revokes the right for a contract
    /// address (typically EtaloEscrow, EtaloDispute) to call the
    /// restricted write functions.
    function setAuthorizedCaller(address caller, bool authorized) external;

    // ===== Views =====

    function getReputation(address seller) external view returns (SellerReputation memory);

    /// @notice True when the seller currently holds the Top Seller
    /// badge. EtaloStake reads this to gate Tier 3 deposits (ADR-020).
    function isTopSeller(address seller) external view returns (bool);

    /// @notice Auto-release window in days:
    /// 3 days intra / 2 days intra Top Seller / 7 days cross-border.
    function getAutoReleaseDays(address seller, bool isCrossBorder) external view returns (uint256);
}
