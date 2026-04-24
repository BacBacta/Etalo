// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEtaloDispute {
    enum DisputeLevel {
        None,
        L1_Negotiation,
        L2_Mediator,
        L3_Admin
    }

    enum DisputeOutcome {
        Pending,
        ResolvedBySeller,
        ResolvedByMediator,
        ResolvedByAdmin,
        RefundedFull,
        RefundedPartial
    }

    struct Dispute {
        uint256 orderId;
        address buyer;
        address seller;
        DisputeLevel level;
        DisputeOutcome outcome;
        uint256 openedAt;
        uint256 l1Deadline;
        uint256 buyerRefundAmount;
        string reason;
        bool resolved;
    }

    event DisputeOpened(uint256 indexed orderId, address indexed buyer, DisputeLevel level, string reason);
    event DisputeEscalated(uint256 indexed orderId, DisputeLevel newLevel);
    event DisputeResolved(uint256 indexed orderId, DisputeOutcome outcome, uint256 buyerRefundAmount);
    event MediatorAssigned(uint256 indexed orderId, address indexed mediator);

    function openDispute(uint256 orderId, string calldata reason) external;
    function escalateToL2(uint256 orderId) external;
    function resolveL1(uint256 orderId) external;
    function resolveL2(uint256 orderId, uint256 buyerRefundAmount) external;
    function resolveL3(uint256 orderId, uint256 buyerRefundAmount) external;
    function assignMediator(uint256 orderId, address mediator) external;

    function getDispute(uint256 orderId) external view returns (Dispute memory);
    function isDisputed(uint256 orderId) external view returns (bool);
}
