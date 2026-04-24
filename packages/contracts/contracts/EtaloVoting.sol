// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEtaloVoting.sol";
import "./interfaces/IEtaloDispute.sol";

/// @title EtaloVoting
/// @notice Simplified level-3 community voting contract (ADR-022).
/// EtaloDispute creates a vote with a per-vote list of eligible
/// voters; votes are tallied after the voting period and the result
/// is pushed back via EtaloDispute.resolveFromVote.
/// @dev V1 simplifications:
/// - One-person-one-vote (no token weighting).
/// - Ties default to the buyer (conservative).
/// - Eligible voter sets are managed per-vote by EtaloDispute, not
///   stored globally here.
contract EtaloVoting is IEtaloVoting, Ownable {
    address public disputeContract;

    uint256 private _voteIdCounter;

    struct Vote {
        uint256 disputeId;
        uint256 deadline;
        uint256 forBuyer;
        uint256 forSeller;
        bool finalized;
        bool buyerWon;
    }

    mapping(uint256 => Vote) private _votes;
    mapping(uint256 => mapping(address => bool)) private _eligibility;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    modifier onlyDispute() {
        require(msg.sender == disputeContract, "Only dispute contract");
        _;
    }

    event DisputeContractUpdated(address indexed oldAddr, address indexed newAddr);

    constructor() Ownable(msg.sender) {}

    function setDisputeContract(address _addr) external onlyOwner {
        require(_addr != address(0), "Invalid dispute contract");
        emit DisputeContractUpdated(disputeContract, _addr);
        disputeContract = _addr;
    }

    function createVote(
        uint256 disputeId,
        address[] calldata eligibleVoters,
        uint256 votingPeriod
    ) external onlyDispute returns (uint256) {
        require(eligibleVoters.length > 0, "No voters");
        require(votingPeriod > 0, "Invalid period");

        uint256 voteId = ++_voteIdCounter;
        uint256 deadline = block.timestamp + votingPeriod;

        _votes[voteId] = Vote({
            disputeId: disputeId,
            deadline: deadline,
            forBuyer: 0,
            forSeller: 0,
            finalized: false,
            buyerWon: false
        });

        for (uint256 i = 0; i < eligibleVoters.length; i++) {
            _eligibility[voteId][eligibleVoters[i]] = true;
        }

        emit VoteCreated(voteId, disputeId, deadline);
        return voteId;
    }

    function submitVote(uint256 voteId, bool favorBuyer) external {
        Vote storage v = _votes[voteId];
        require(v.deadline > 0, "Vote does not exist");
        require(block.timestamp < v.deadline, "Voting closed");
        require(!v.finalized, "Already finalized");
        require(_eligibility[voteId][msg.sender], "Not eligible");
        require(!_hasVoted[voteId][msg.sender], "Already voted");

        _hasVoted[voteId][msg.sender] = true;
        if (favorBuyer) {
            v.forBuyer++;
        } else {
            v.forSeller++;
        }

        emit VoteSubmitted(voteId, msg.sender, favorBuyer);
    }

    function finalizeVote(uint256 voteId) external {
        Vote storage v = _votes[voteId];
        require(v.deadline > 0, "Vote does not exist");
        require(block.timestamp >= v.deadline, "Voting still open");
        require(!v.finalized, "Already finalized");

        // Tie → buyer wins (conservative default per ADR-022).
        bool buyerWon = v.forBuyer >= v.forSeller;
        v.buyerWon = buyerWon;
        v.finalized = true;

        emit VoteFinalized(voteId, buyerWon, v.forBuyer, v.forSeller);

        if (disputeContract != address(0)) {
            IEtaloDispute(disputeContract).resolveFromVote(voteId, buyerWon);
        }
    }

    function getVote(uint256 voteId)
        external
        view
        returns (uint256 disputeId, uint256 deadline, bool finalized, bool buyerWon)
    {
        Vote storage v = _votes[voteId];
        return (v.disputeId, v.deadline, v.finalized, v.buyerWon);
    }

    function hasVoted(uint256 voteId, address voter) external view returns (bool) {
        return _hasVoted[voteId][voter];
    }

    function getResult(uint256 voteId)
        external
        view
        returns (bool buyerWon, bool isFinalized)
    {
        Vote storage v = _votes[voteId];
        return (v.buyerWon, v.finalized);
    }
}
