// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEtaloDispute
/// @notice Item-level dispute contract (ADR-015, ADR-022). Disputes
/// target a single item within an order; while a dispute is open, only
/// that item's funds are frozen on EtaloEscrow — sibling items
/// continue their normal release flow. Three levels: N1 amicable
/// (48h), N2 mediator (7d), N3 community vote (14d).
interface IEtaloDispute {
    // ===== Events =====
    event DisputeOpened(
        uint256 indexed disputeId,
        uint256 indexed orderId,
        uint256 indexed itemId,
        address buyer,
        string reason
    );
    event DisputeEscalated(uint256 indexed disputeId, uint8 newLevel);
    event DisputeResolved(
        uint256 indexed disputeId,
        bool favorBuyer,
        uint256 refundAmount,
        uint256 slashAmount
    );

    // ===== Buyer entry =====

    /// @notice Buyer opens a dispute on a specific item. Triggers
    /// freeze on that item in EtaloEscrow and on the seller's pending
    /// stake withdrawal in EtaloStake.
    function openDispute(uint256 orderId, uint256 itemId, string calldata reason)
        external
        returns (uint256 disputeId);

    // ===== Escalation =====

    /// @notice N1 → N2. Buyer can escalate at any time; after the 48h
    /// N1 window anyone can escalate.
    function escalateToMediation(uint256 disputeId) external;

    /// @notice N2 → N3. Buyer can escalate at any time; after the 7d
    /// N2 window anyone can escalate.
    function escalateToVoting(uint256 disputeId) external;

    // ===== Resolution =====

    /// @notice N1 amicable — both parties must agree. `refundAmount`
    /// ranges from 0 (full release to seller) to the item price
    /// (full refund to buyer).
    function resolveN1Amicable(uint256 disputeId, uint256 refundAmount) external;

    /// @notice N2 mediator — called by the assigned mediator with a
    /// resolution and optional slash against the seller's stake.
    function resolveN2Mediation(
        uint256 disputeId,
        uint256 refundAmount,
        uint256 slashAmount
    ) external;

    /// @notice N3 callback from EtaloVoting.finalizeVote. Applies the
    /// community decision and unfreezes item and stake.
    function resolveFromVote(uint256 voteId, bool buyerWon) external;

    // ===== Views =====

    function getDispute(uint256 disputeId)
        external
        view
        returns (uint256 orderId, uint256 itemId, uint8 level, bool resolved);

    function hasActiveDispute(address seller) external view returns (bool);
}
