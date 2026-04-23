// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEtaloReputation.sol";

/// @title EtaloReputation
/// @notice Seller reputation tracker. Core V1 logic (score formula,
/// sanction states, authorized-caller control) is carried over
/// unchanged; V2 tightens the Top Seller criteria per ADR-020 (50
/// orders minimum, 0 lost disputes, 90-day post-sanction cooldown)
/// and stores `lastSanctionAt` to enforce the cooldown.
contract EtaloReputation is IEtaloReputation, Ownable {
    // ===== Constants =====
    uint256 public constant TOP_SELLER_MIN_ORDERS = 50;            // was 20 in V1 (ADR-020)
    uint256 public constant TOP_SELLER_MIN_SCORE = 80;             // V1 safety, retained
    uint256 public constant TOP_SELLER_SANCTION_COOLDOWN = 90 days; // ADR-020
    uint256 public constant MAX_SCORE = 100;
    uint256 public constant SCORE_BASE = 50;
    uint256 public constant AUTO_RELEASE_INTRA_DAYS = 3;
    uint256 public constant AUTO_RELEASE_TOP_SELLER_DAYS = 2;
    uint256 public constant AUTO_RELEASE_CROSS_DAYS = 7;

    // ===== State =====
    mapping(address => SellerReputation) private _reputations;
    mapping(address => bool) public isAuthorizedCaller;

    // ===== Modifiers =====
    modifier onlyAuthorized() {
        require(isAuthorizedCaller[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    // ===== Constructor =====
    constructor() Ownable(msg.sender) {}

    // ===== Admin =====
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Invalid address");
        isAuthorizedCaller[caller] = authorized;
    }

    function applySanction(address seller, SellerStatus newStatus) external onlyOwner {
        require(seller != address(0), "Invalid seller");
        SellerReputation storage rep = _reputations[seller];
        rep.status = newStatus;

        if (newStatus != SellerStatus.Active) {
            rep.lastSanctionAt = block.timestamp;
            if (rep.isTopSeller) {
                rep.isTopSeller = false;
                emit TopSellerRevoked(seller);
            }
        }

        emit SellerSanctioned(seller, newStatus);
    }

    // ===== Core =====
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

    /// @notice Grants or revokes Top Seller based on 4 criteria:
    ///   1. ordersCompleted >= 50 (ADR-020)
    ///   2. disputesLost == 0 (ADR-020)
    ///   3. block.timestamp >= lastSanctionAt + 90 days (ADR-020)
    ///   4. score >= 80 (V1 safety threshold, retained)
    /// Status must also be Active. Top Seller unlocks 1.2% commission
    /// (ADR) and Tier 3 stake eligibility (ADR-020).
    function checkAndUpdateTopSeller(address seller) external onlyAuthorized {
        SellerReputation storage rep = _reputations[seller];
        bool wasTopSeller = rep.isTopSeller;

        bool qualifies = rep.status == SellerStatus.Active
            && rep.ordersCompleted >= TOP_SELLER_MIN_ORDERS
            && rep.disputesLost == 0
            && (rep.lastSanctionAt == 0 || block.timestamp >= rep.lastSanctionAt + TOP_SELLER_SANCTION_COOLDOWN)
            && rep.score >= TOP_SELLER_MIN_SCORE;

        if (qualifies && !wasTopSeller) {
            rep.isTopSeller = true;
            emit TopSellerGranted(seller);
        } else if (!qualifies && wasTopSeller) {
            rep.isTopSeller = false;
            emit TopSellerRevoked(seller);
        }
    }

    // ===== Views =====
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

    // ===== Internal =====
    function _recalculateScore(address seller) internal {
        SellerReputation storage rep = _reputations[seller];

        if (rep.ordersCompleted == 0) {
            rep.score = SCORE_BASE;
            emit ScoreUpdated(seller, rep.score);
            return;
        }

        // Score formula (V1 preserved):
        //   base 50 + completionBonus (up to 30) + volumeBonus (up to 10) - disputePenalty (up to 40)
        uint256 totalOrders = rep.ordersCompleted + rep.ordersDisputed;
        uint256 completionBonus = (rep.ordersCompleted * 30) / totalOrders;

        uint256 ordersCapped = rep.ordersCompleted > 100 ? 100 : rep.ordersCompleted;
        uint256 volumeBonus = (ordersCapped * 10) / 100;

        uint256 disputePenalty = rep.disputesLost * 10;
        if (disputePenalty > 40) {
            disputePenalty = 40;
        }

        uint256 rawScore = SCORE_BASE + completionBonus + volumeBonus;
        rep.score = rawScore > disputePenalty ? rawScore - disputePenalty : 0;

        if (rep.score > MAX_SCORE) {
            rep.score = MAX_SCORE;
        }

        emit ScoreUpdated(seller, rep.score);
    }
}
