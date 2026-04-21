// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEtaloDispute.sol";
import "./interfaces/IEtaloEscrow.sol";
import "./interfaces/IEtaloReputation.sol";

contract EtaloDispute is IEtaloDispute, Ownable {
    // --- Constants ---
    uint256 public constant L1_DURATION = 48 hours;

    // --- State ---
    IEtaloEscrow public immutable escrow;
    IEtaloReputation public reputation;

    mapping(uint256 => Dispute) private _disputes;
    mapping(uint256 => address) private _mediators;
    mapping(address => bool) public isMediatorApproved;

    // --- Modifiers ---
    modifier onlyMediator(uint256 orderId) {
        require(_mediators[orderId] == msg.sender, "Not assigned mediator");
        _;
    }

    modifier disputeExists(uint256 orderId) {
        require(_disputes[orderId].openedAt > 0, "No dispute for this order");
        _;
    }

    modifier notResolved(uint256 orderId) {
        require(!_disputes[orderId].resolved, "Dispute already resolved");
        _;
    }

    // --- Constructor ---
    constructor(
        address _escrow,
        address _reputation
    ) Ownable(msg.sender) {
        require(_escrow != address(0), "Invalid escrow address");
        escrow = IEtaloEscrow(_escrow);
        if (_reputation != address(0)) {
            reputation = IEtaloReputation(_reputation);
        }
    }

    // --- Admin ---
    function setReputation(address _reputation) external onlyOwner {
        require(_reputation != address(0), "Invalid reputation address");
        reputation = IEtaloReputation(_reputation);
    }

    function approveMediator(address mediator, bool approved) external onlyOwner {
        require(mediator != address(0), "Invalid mediator");
        isMediatorApproved[mediator] = approved;
    }

    function assignMediator(uint256 orderId, address mediator) external onlyOwner disputeExists(orderId) notResolved(orderId) {
        require(isMediatorApproved[mediator], "Mediator not approved");
        _mediators[orderId] = mediator;
        emit MediatorAssigned(orderId, mediator);
    }

    // --- Core ---
    function openDispute(uint256 orderId, string calldata reason) external {
        IEtaloEscrow.Order memory order = escrow.getOrder(orderId);
        require(msg.sender == order.buyer, "Only buyer can open dispute");
        require(_disputes[orderId].openedAt == 0, "Dispute already exists");
        require(
            order.status == IEtaloEscrow.OrderStatus.Funded ||
            order.status == IEtaloEscrow.OrderStatus.Shipped,
            "Cannot dispute in current state"
        );

        _disputes[orderId] = Dispute({
            orderId: orderId,
            buyer: order.buyer,
            seller: order.seller,
            level: DisputeLevel.L1_Negotiation,
            outcome: DisputeOutcome.Pending,
            openedAt: block.timestamp,
            l1Deadline: block.timestamp + L1_DURATION,
            buyerRefundAmount: 0,
            reason: reason,
            resolved: false
        });

        escrow.markDisputed(orderId);
        emit DisputeOpened(orderId, msg.sender, DisputeLevel.L1_Negotiation, reason);
    }

    function resolveL1(uint256 orderId) external disputeExists(orderId) notResolved(orderId) {
        Dispute storage dispute = _disputes[orderId];
        require(dispute.level == DisputeLevel.L1_Negotiation, "Not at L1");
        require(msg.sender == dispute.seller, "Only seller can resolve L1");

        dispute.resolved = true;
        dispute.outcome = DisputeOutcome.ResolvedBySeller;

        // Full refund to buyer on L1 resolution by seller
        IEtaloEscrow.Order memory order = escrow.getOrder(orderId);
        dispute.buyerRefundAmount = order.amount;
        escrow.resolveDispute(orderId, order.amount);

        _recordDisputeReputation(dispute.seller, orderId, true);
        emit DisputeResolved(orderId, DisputeOutcome.ResolvedBySeller, order.amount);
    }

    function escalateToL2(uint256 orderId) external disputeExists(orderId) notResolved(orderId) {
        Dispute storage dispute = _disputes[orderId];
        require(dispute.level == DisputeLevel.L1_Negotiation, "Not at L1");
        require(
            msg.sender == dispute.buyer || block.timestamp >= dispute.l1Deadline,
            "L1 deadline not reached"
        );

        dispute.level = DisputeLevel.L2_Mediator;
        emit DisputeEscalated(orderId, DisputeLevel.L2_Mediator);
    }

    function resolveL2(uint256 orderId, uint256 buyerRefundAmount) external disputeExists(orderId) notResolved(orderId) onlyMediator(orderId) {
        Dispute storage dispute = _disputes[orderId];
        require(dispute.level == DisputeLevel.L2_Mediator, "Not at L2");

        dispute.resolved = true;
        dispute.outcome = DisputeOutcome.ResolvedByMediator;
        dispute.buyerRefundAmount = buyerRefundAmount;

        escrow.resolveDispute(orderId, buyerRefundAmount);

        bool sellerLost = buyerRefundAmount > 0;
        _recordDisputeReputation(dispute.seller, orderId, sellerLost);
        emit DisputeResolved(orderId, DisputeOutcome.ResolvedByMediator, buyerRefundAmount);
    }

    function resolveL3(uint256 orderId, uint256 buyerRefundAmount) external onlyOwner disputeExists(orderId) notResolved(orderId) {
        Dispute storage dispute = _disputes[orderId];
        require(
            dispute.level == DisputeLevel.L2_Mediator || dispute.level == DisputeLevel.L3_Admin,
            "Must be at L2 or L3"
        );

        dispute.level = DisputeLevel.L3_Admin;
        dispute.resolved = true;
        dispute.outcome = DisputeOutcome.ResolvedByAdmin;
        dispute.buyerRefundAmount = buyerRefundAmount;

        escrow.resolveDispute(orderId, buyerRefundAmount);

        bool sellerLost = buyerRefundAmount > 0;
        _recordDisputeReputation(dispute.seller, orderId, sellerLost);
        emit DisputeResolved(orderId, DisputeOutcome.ResolvedByAdmin, buyerRefundAmount);
    }

    // --- View ---
    function getDispute(uint256 orderId) external view returns (Dispute memory) {
        return _disputes[orderId];
    }

    function isDisputed(uint256 orderId) external view returns (bool) {
        return _disputes[orderId].openedAt > 0 && !_disputes[orderId].resolved;
    }

    // --- Internal ---
    function _recordDisputeReputation(address seller, uint256 orderId, bool sellerLost) internal {
        if (address(reputation) != address(0)) {
            reputation.recordDispute(seller, orderId, sellerLost);
            reputation.checkAndUpdateTopSeller(seller);
        }
    }
}
