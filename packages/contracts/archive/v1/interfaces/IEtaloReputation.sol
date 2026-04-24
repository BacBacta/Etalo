// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

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
    }

    event OrderRecorded(address indexed seller, uint256 orderId, uint256 amount);
    event DisputeRecorded(address indexed seller, uint256 orderId, bool sellerLost);
    event TopSellerGranted(address indexed seller);
    event TopSellerRevoked(address indexed seller);
    event SellerSanctioned(address indexed seller, SellerStatus newStatus);
    event ScoreUpdated(address indexed seller, uint256 newScore);

    function recordCompletedOrder(address seller, uint256 orderId, uint256 amount) external;
    function recordDispute(address seller, uint256 orderId, bool sellerLost) external;
    function checkAndUpdateTopSeller(address seller) external;
    function applySanction(address seller, SellerStatus newStatus) external;

    function getReputation(address seller) external view returns (SellerReputation memory);
    function isTopSeller(address seller) external view returns (bool);
    function getAutoReleaseDays(address seller, bool isCrossBorder) external view returns (uint256);
}
