// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/IEtaloVoting.sol";

/// @dev Minimal test harness for EtaloVoting. Records the callback
/// params from resolveFromVote so tests can assert they were
/// forwarded, and exposes a forwarder that lets tests trigger
/// EtaloVoting.createVote with `msg.sender == this mock` so the
/// `onlyDispute` gate passes.
contract MockEtaloDispute {
    bool public wasCalled;
    uint256 public lastVoteId;
    bool public lastBuyerWon;

    function resolveFromVote(uint256 voteId, bool buyerWon) external {
        wasCalled = true;
        lastVoteId = voteId;
        lastBuyerWon = buyerWon;
    }

    function createVoteOn(
        address voting,
        uint256 disputeId,
        address[] calldata voters,
        uint256 votingPeriod
    ) external returns (uint256) {
        return IEtaloVoting(voting).createVote(disputeId, voters, votingPeriod);
    }
}
