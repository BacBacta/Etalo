// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IEtaloDispute.sol";
import "./interfaces/IEtaloEscrow.sol";
import "./interfaces/IEtaloStake.sol";
import "./interfaces/IEtaloVoting.sol";
import "./interfaces/IEtaloReputation.sol";
import { EtaloTypes } from "./types/EtaloTypes.sol";

/// @title EtaloDispute
/// @notice V2 item-level dispute contract (ADR-015, ADR-022).
/// Disputes target a single (orderId, itemId) pair. Three levels:
/// N1 bilateral amicable (48h) → N2 assigned mediator (7d) → N3
/// community vote via EtaloVoting (14d). Opens and resolutions hook
/// EtaloEscrow (markItemDisputed / resolveItemDispute) and EtaloStake
/// (pauseWithdrawal / resumeWithdrawal / optionally slashStake).
contract EtaloDispute is IEtaloDispute, Ownable, ReentrancyGuard {
    // ===== Constants =====
    uint256 public constant N1_DURATION = 48 hours;
    uint256 public constant N2_DURATION = 7 days;
    uint256 public constant N3_VOTING_PERIOD = 14 days;

    // ===== DisputeLevel encoding =====
    // uint8 values chosen to align with IEtaloDispute.getDispute()'s
    // level return type. Keep these stable — external consumers
    // depend on the ordering.
    uint8 internal constant LEVEL_NONE = 0;
    uint8 internal constant LEVEL_N1 = 1;
    uint8 internal constant LEVEL_N2 = 2;
    uint8 internal constant LEVEL_N3 = 3;
    uint8 internal constant LEVEL_RESOLVED = 4;

    // ===== Events =====
    event EscrowUpdated(address indexed oldAddr, address indexed newAddr);
    event StakeUpdated(address indexed oldAddr, address indexed newAddr);
    event VotingUpdated(address indexed oldAddr, address indexed newAddr);
    event ReputationUpdated(address indexed oldAddr, address indexed newAddr);
    event MediatorApproved(address indexed mediator, bool approved);
    event MediatorAssigned(uint256 indexed disputeId, address indexed mediator);

    // ===== Cross-contract refs (all settable, per ADR-028 deployment ordering rationale) =====
    IEtaloEscrow public escrow;
    IEtaloStake public stake;
    IEtaloVoting public voting;
    IEtaloReputation public reputation;

    // ===== Dispute state =====
    struct Dispute {
        uint256 orderId;
        uint256 itemId;
        address buyer;
        address seller;
        address n2Mediator;     // set by assignN2Mediator; excluded from N3 voter list
        uint8 level;            // one of LEVEL_*
        uint256 openedAt;
        uint256 n1Deadline;
        uint256 n2Deadline;
        uint256 refundAmount;   // final on resolution
        uint256 slashAmount;    // final on resolution
        bool favorBuyer;        // final on resolution
        bool resolved;
        string reason;
    }

    struct N1Proposal {
        uint256 buyerAmount;
        uint256 sellerAmount;
        bool buyerProposed;
        bool sellerProposed;
    }

    uint256 private _disputeIdCounter;
    mapping(uint256 => Dispute) private _disputes;
    mapping(uint256 => N1Proposal) private _n1Proposals;
    mapping(uint256 => uint256) private _voteIdToDisputeId;
    mapping(uint256 => mapping(uint256 => uint256)) private _disputeByItem;
    mapping(address => uint256) private _activeDisputesBySeller;

    // ===== Mediator registry (iterable) =====
    address[] private _mediatorsList;
    mapping(address => bool) public isMediatorApproved;
    mapping(address => uint256) private _mediatorIndex; // 1-indexed; 0 means not in list

    // ===== Modifiers =====
    modifier onlyAssignedMediator(uint256 disputeId) {
        require(msg.sender == _disputes[disputeId].n2Mediator, "Not assigned mediator");
        _;
    }

    modifier onlyVoting() {
        require(msg.sender == address(voting), "Only voting contract");
        _;
    }

    // ===== Constructor =====
    constructor() Ownable(msg.sender) {}

    // ===== Admin setters =====
    function setEscrow(address _addr) external onlyOwner {
        emit EscrowUpdated(address(escrow), _addr);
        escrow = IEtaloEscrow(_addr);
    }

    function setStake(address _addr) external onlyOwner {
        emit StakeUpdated(address(stake), _addr);
        stake = IEtaloStake(_addr);
    }

    function setVoting(address _addr) external onlyOwner {
        emit VotingUpdated(address(voting), _addr);
        voting = IEtaloVoting(_addr);
    }

    function setReputation(address _addr) external onlyOwner {
        emit ReputationUpdated(address(reputation), _addr);
        reputation = IEtaloReputation(_addr);
    }

    function approveMediator(address med, bool approved) external onlyOwner {
        require(med != address(0), "Invalid mediator");
        if (approved && !isMediatorApproved[med]) {
            _mediatorsList.push(med);
            _mediatorIndex[med] = _mediatorsList.length;
            isMediatorApproved[med] = true;
            emit MediatorApproved(med, true);
        } else if (!approved && isMediatorApproved[med]) {
            uint256 idx = _mediatorIndex[med] - 1;
            uint256 lastIdx = _mediatorsList.length - 1;
            if (idx != lastIdx) {
                address lastMed = _mediatorsList[lastIdx];
                _mediatorsList[idx] = lastMed;
                _mediatorIndex[lastMed] = idx + 1;
            }
            _mediatorsList.pop();
            delete _mediatorIndex[med];
            isMediatorApproved[med] = false;
            emit MediatorApproved(med, false);
        }
    }

    /// @notice Admin assigns an approved mediator to handle the N2
    /// phase of a given dispute. Only this address can call
    /// resolveN2Mediation afterwards, and this address is excluded
    /// from the N3 voter list if the dispute escalates further.
    function assignN2Mediator(uint256 disputeId, address med) external onlyOwner {
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N2, "Not at N2");
        require(isMediatorApproved[med], "Mediator not approved");
        d.n2Mediator = med;
        emit MediatorAssigned(disputeId, med);
    }

    // ===== Buyer entry =====
    function openDispute(uint256 orderId, uint256 itemId, string calldata reason)
        external
        nonReentrant
        returns (uint256)
    {
        require(address(escrow) != address(0), "Escrow not set");
        require(_disputeByItem[orderId][itemId] == 0, "Item already disputed");

        EtaloTypes.Order memory order = escrow.getOrder(orderId);
        require(msg.sender == order.buyer, "Only buyer can open dispute");

        uint256 disputeId = ++_disputeIdCounter;
        uint256 n1Deadline = block.timestamp + N1_DURATION;

        _disputes[disputeId] = Dispute({
            orderId: orderId,
            itemId: itemId,
            buyer: order.buyer,
            seller: order.seller,
            n2Mediator: address(0),
            level: LEVEL_N1,
            openedAt: block.timestamp,
            n1Deadline: n1Deadline,
            n2Deadline: 0,
            refundAmount: 0,
            slashAmount: 0,
            favorBuyer: false,
            resolved: false,
            reason: reason
        });

        _disputeByItem[orderId][itemId] = disputeId;
        _activeDisputesBySeller[order.seller]++;

        escrow.markItemDisputed(orderId, itemId);
        if (address(stake) != address(0)) {
            stake.pauseWithdrawal(order.seller, disputeId);
        }

        emit DisputeOpened(disputeId, orderId, itemId, order.buyer, reason);
        return disputeId;
    }

    // ===== Escalation =====
    function escalateToMediation(uint256 disputeId) external {
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N1, "Not at N1");
        require(
            msg.sender == d.buyer || block.timestamp >= d.n1Deadline,
            "Buyer only before N1 deadline"
        );

        d.level = LEVEL_N2;
        d.n2Deadline = block.timestamp + N2_DURATION;

        emit DisputeEscalated(disputeId, LEVEL_N2);
    }

    function escalateToVoting(uint256 disputeId) external {
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N2, "Not at N2");
        require(
            msg.sender == d.buyer || block.timestamp >= d.n2Deadline,
            "Buyer only before N2 deadline"
        );
        require(address(voting) != address(0), "Voting not set");

        d.level = LEVEL_N3;

        // Build voter list excluding d.n2Mediator (if one was assigned).
        uint256 count = _mediatorsList.length;
        bool excludeN2 = d.n2Mediator != address(0);
        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < count; i++) {
            if (!excludeN2 || _mediatorsList[i] != d.n2Mediator) {
                eligibleCount++;
            }
        }
        require(eligibleCount > 0, "No voters available");

        address[] memory voters = new address[](eligibleCount);
        uint256 j = 0;
        for (uint256 i = 0; i < count; i++) {
            if (!excludeN2 || _mediatorsList[i] != d.n2Mediator) {
                voters[j++] = _mediatorsList[i];
            }
        }

        uint256 voteId = voting.createVote(disputeId, voters, N3_VOTING_PERIOD);
        _voteIdToDisputeId[voteId] = disputeId;

        emit DisputeEscalated(disputeId, LEVEL_N3);
    }

    // ===== Resolution =====

    /// @notice Bilateral amicable resolution. Either party calls with
    /// their proposed refund amount; the call stores the proposal.
    /// As soon as both parties have proposed matching amounts, the
    /// resolution fires. Latest proposal from each party wins (a
    /// party may update their proposal freely until match). No slash
    /// is applied at N1.
    function resolveN1Amicable(uint256 disputeId, uint256 refundAmount)
        external
        nonReentrant
    {
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N1, "Not at N1");
        require(msg.sender == d.buyer || msg.sender == d.seller, "Only parties");

        N1Proposal storage p = _n1Proposals[disputeId];
        if (msg.sender == d.buyer) {
            p.buyerAmount = refundAmount;
            p.buyerProposed = true;
        } else {
            p.sellerAmount = refundAmount;
            p.sellerProposed = true;
        }

        if (p.buyerProposed && p.sellerProposed && p.buyerAmount == p.sellerAmount) {
            _applyResolution(disputeId, refundAmount, 0);
        }
    }

    function resolveN2Mediation(
        uint256 disputeId,
        uint256 refundAmount,
        uint256 slashAmount
    ) external nonReentrant onlyAssignedMediator(disputeId) {
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N2, "Not at N2");

        _applyResolution(disputeId, refundAmount, slashAmount);
    }

    function resolveFromVote(uint256 voteId, bool buyerWon)
        external
        nonReentrant
        onlyVoting
    {
        uint256 disputeId = _voteIdToDisputeId[voteId];
        Dispute storage d = _disputes[disputeId];
        require(d.openedAt > 0, "Dispute does not exist");
        require(!d.resolved, "Already resolved");
        require(d.level == LEVEL_N3, "Not at N3");

        // N3 refund = full item price if buyer wins, else 0.
        // No automatic slash at N3 — see IEtaloDispute NatSpec.
        uint256 refundAmount = 0;
        if (buyerWon) {
            EtaloTypes.Item memory item = escrow.getItem(d.itemId);
            refundAmount = item.itemPrice;
        }
        _applyResolution(disputeId, refundAmount, 0);
    }

    // ===== Views =====
    function getDispute(uint256 disputeId)
        external
        view
        returns (uint256 orderId, uint256 itemId, uint8 level, bool resolved)
    {
        Dispute storage d = _disputes[disputeId];
        return (d.orderId, d.itemId, d.level, d.resolved);
    }

    function hasActiveDispute(address seller) external view returns (bool) {
        return _activeDisputesBySeller[seller] > 0;
    }

    function hasActiveDisputeForItem(uint256 orderId, uint256 itemId)
        external
        view
        returns (bool)
    {
        uint256 disputeId = _disputeByItem[orderId][itemId];
        if (disputeId == 0) return false;
        return !_disputes[disputeId].resolved;
    }

    /// @notice Introspect the current N1 proposal state for a dispute.
    /// Helper for tests and off-chain UIs; not part of the canonical
    /// interface.
    function getN1Proposal(uint256 disputeId)
        external
        view
        returns (
            uint256 buyerAmount,
            uint256 sellerAmount,
            bool buyerProposed,
            bool sellerProposed
        )
    {
        N1Proposal storage p = _n1Proposals[disputeId];
        return (p.buyerAmount, p.sellerAmount, p.buyerProposed, p.sellerProposed);
    }

    /// @notice Returns the N2 mediator assigned to a dispute (zero
    /// address if none). Helper for tests and off-chain UIs.
    function getN2Mediator(uint256 disputeId) external view returns (address) {
        return _disputes[disputeId].n2Mediator;
    }

    function mediatorsCount() external view returns (uint256) {
        return _mediatorsList.length;
    }

    // ===== Internal =====
    function _applyResolution(
        uint256 disputeId,
        uint256 refundAmount,
        uint256 slashAmount
    ) internal {
        Dispute storage d = _disputes[disputeId];

        d.refundAmount = refundAmount;
        d.slashAmount = slashAmount;
        d.favorBuyer = refundAmount > 0;
        d.resolved = true;
        d.level = LEVEL_RESOLVED;

        escrow.resolveItemDispute(d.orderId, d.itemId, refundAmount);

        if (address(stake) != address(0)) {
            stake.resumeWithdrawal(d.seller);
            if (slashAmount > 0) {
                stake.slashStake(d.seller, slashAmount, d.buyer, disputeId);
            }
        }

        if (address(reputation) != address(0)) {
            reputation.recordDispute(d.seller, d.orderId, refundAmount > 0);
            reputation.checkAndUpdateTopSeller(d.seller);
        }

        _activeDisputesBySeller[d.seller]--;

        emit DisputeResolved(disputeId, d.favorBuyer, refundAmount, slashAmount);
    }
}
