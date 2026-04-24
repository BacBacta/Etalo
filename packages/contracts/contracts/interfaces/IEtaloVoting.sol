// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEtaloVoting
/// @notice Simplified level-3 community voting contract. EtaloDispute
/// escalates unresolvable N2 cases to N3 by calling createVote; after
/// the voting period expires, finalizeVote is permissionless and calls
/// back into EtaloDispute.resolveFromVote.
/// @dev V1 simplifications (ADR-022): eligible voters are an admin-
/// managed fixed set, one-person-one-vote, ties default to the buyer.
interface IEtaloVoting {
    // ===== Events =====
    event VoteCreated(uint256 indexed voteId, uint256 indexed disputeId, uint256 deadline);
    event VoteSubmitted(uint256 indexed voteId, address indexed voter, bool favorBuyer);
    event VoteFinalized(
        uint256 indexed voteId,
        bool buyerWon,
        uint256 forBuyer,
        uint256 forSeller
    );

    /// @notice Opens a new vote on behalf of EtaloDispute. The
    /// `eligibleVoters` list is passed per-vote by the dispute
    /// contract — EtaloVoting itself holds no global mediator
    /// registry. This keeps voter scoping flexible (e.g. excluding a
    /// mediator who is a party to the dispute) and EtaloVoting's
    /// storage lean.
    /// @param disputeId source dispute id
    /// @param eligibleVoters snapshot of addresses allowed to vote
    /// @param votingPeriod duration in seconds (14 days per V1 spec)
    function createVote(
        uint256 disputeId,
        address[] calldata eligibleVoters,
        uint256 votingPeriod
    ) external returns (uint256 voteId);

    /// @notice Casts the caller's vote. Reverts when non-eligible,
    /// already voted, or past the deadline.
    function submitVote(uint256 voteId, bool favorBuyer) external;

    /// @notice Permissionless after the deadline. Tallies votes, emits
    /// VoteFinalized, and calls EtaloDispute.resolveFromVote.
    function finalizeVote(uint256 voteId) external;

    // ===== Views =====

    function getVote(uint256 voteId)
        external
        view
        returns (uint256 disputeId, uint256 deadline, bool finalized, bool buyerWon);

    function hasVoted(uint256 voteId, address voter) external view returns (bool);

    function getResult(uint256 voteId)
        external
        view
        returns (bool buyerWon, bool isFinalized);
}
