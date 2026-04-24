// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEtaloReputation.sol";

contract EtaloReputation is IEtaloReputation, Ownable {
    // --- Constants ---
    uint256 public constant TOP_SELLER_MIN_ORDERS = 20;
    uint256 public constant TOP_SELLER_MIN_SCORE = 80;
    uint256 public constant MAX_SCORE = 100;
    uint256 public constant SCORE_BASE = 50;
    uint256 public constant AUTO_RELEASE_INTRA_DAYS = 3;
    uint256 public constant AUTO_RELEASE_TOP_SELLER_DAYS = 2;
    uint256 public constant AUTO_RELEASE_CROSS_DAYS = 7;

    // --- State ---
    mapping(address => SellerReputation) private _reputations;
    mapping(address => bool) public isAuthorizedCaller;

    // --- Modifiers ---
    modifier onlyAuthorized() {
        require(isAuthorizedCaller[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    // --- Constructor ---
    constructor() Ownable(msg.sender) {}

    // --- Admin ---
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Invalid address");
        isAuthorizedCaller[caller] = authorized;
    }

    function applySanction(address seller, SellerStatus newStatus) external onlyOwner {
        require(seller != address(0), "Invalid seller");
        SellerReputation storage rep = _reputations[seller];
        rep.status = newStatus;

        if (newStatus != SellerStatus.Active && rep.isTopSeller) {
            rep.isTopSeller = false;
            emit TopSellerRevoked(seller);
        }

        emit SellerSanctioned(seller, newStatus);
    }

    // --- Core ---
    function recordCompletedOrder(address seller, uint256 orderId, uint256 amount) external onlyAuthorized {
        SellerReputation storage rep = _reputations[seller];
        require(rep.status == SellerStatus.Active, "Seller not active");

        rep.ordersCompleted++;
        rep.totalVolume += amount;
        _recalculateScore(seller);

        emit OrderRecorded(seller, orderId, amount);
    }

    function recordDispute(address seller, uint256 orderId, bool sellerLost) external onlyAuthorized {
        SellerReputation storage rep = _reputations[seller];
        rep.ordersDisputed++;

        if (sellerLost) {
            rep.disputesLost++;
        }

        _recalculateScore(seller);
        emit DisputeRecorded(seller, orderId, sellerLost);
    }

    function checkAndUpdateTopSeller(address seller) external onlyAuthorized {
        SellerReputation storage rep = _reputations[seller];
        bool wasTopSeller = rep.isTopSeller;

        bool qualifies = rep.status == SellerStatus.Active &&
            rep.ordersCompleted >= TOP_SELLER_MIN_ORDERS &&
            rep.score >= TOP_SELLER_MIN_SCORE;

        if (qualifies && !wasTopSeller) {
            rep.isTopSeller = true;
            emit TopSellerGranted(seller);
        } else if (!qualifies && wasTopSeller) {
            rep.isTopSeller = false;
            emit TopSellerRevoked(seller);
        }
    }

    // --- View ---
    function getReputation(address seller) external view returns (SellerReputation memory) {
        return _reputations[seller];
    }

    function isTopSeller(address seller) external view returns (bool) {
        return _reputations[seller].isTopSeller;
    }

    function getAutoReleaseDays(address seller, bool isCrossBorder) external view returns (uint256) {
        if (isCrossBorder) {
            return AUTO_RELEASE_CROSS_DAYS;
        }
        if (_reputations[seller].isTopSeller) {
            return AUTO_RELEASE_TOP_SELLER_DAYS;
        }
        return AUTO_RELEASE_INTRA_DAYS;
    }

    // --- Internal ---
    function _recalculateScore(address seller) internal {
        SellerReputation storage rep = _reputations[seller];

        if (rep.ordersCompleted == 0) {
            rep.score = SCORE_BASE;
            emit ScoreUpdated(seller, rep.score);
            return;
        }

        // Score formula:
        // base 50 + up to 50 based on completion ratio minus dispute penalty
        // completionBonus = (ordersCompleted / (ordersCompleted + ordersDisputed)) * 30
        // volumeBonus = min(ordersCompleted, 100) / 100 * 10
        // disputePenalty = (disputesLost * 10) capped at 40

        uint256 totalOrders = rep.ordersCompleted + rep.ordersDisputed;
        uint256 completionBonus = (rep.ordersCompleted * 30) / totalOrders;

        uint256 ordersCapped = rep.ordersCompleted > 100 ? 100 : rep.ordersCompleted;
        uint256 volumeBonus = (ordersCapped * 10) / 100;

        uint256 disputePenalty = rep.disputesLost * 10;
        if (disputePenalty > 40) {
            disputePenalty = 40;
        }

        uint256 rawScore = SCORE_BASE + completionBonus + volumeBonus;
        if (rawScore > disputePenalty) {
            rep.score = rawScore - disputePenalty;
        } else {
            rep.score = 0;
        }

        if (rep.score > MAX_SCORE) {
            rep.score = MAX_SCORE;
        }

        emit ScoreUpdated(seller, rep.score);
    }
}
