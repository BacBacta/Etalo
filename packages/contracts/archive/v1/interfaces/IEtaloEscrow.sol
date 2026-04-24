// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEtaloEscrow {
    enum OrderStatus {
        Created,
        Funded,
        Shipped,
        Delivered,
        Completed,
        Disputed,
        Refunded,
        Cancelled
    }

    struct Order {
        uint256 orderId;
        address buyer;
        address seller;
        uint256 amount;
        uint256 commission;
        uint256 milestoneCount;
        uint256 milestonesReleased;
        uint256 createdAt;
        uint256 shippedAt;
        uint256 autoReleaseAfter;
        OrderStatus status;
        bool isCrossBorder;
    }

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        bool isCrossBorder
    );
    event OrderFunded(uint256 indexed orderId, uint256 amount);
    event OrderShipped(uint256 indexed orderId);
    event OrderDelivered(uint256 indexed orderId);
    event MilestoneReleased(uint256 indexed orderId, uint256 milestoneIndex, uint256 amount);
    event OrderCompleted(uint256 indexed orderId, uint256 sellerAmount, uint256 commissionAmount);
    event OrderDisputed(uint256 indexed orderId);
    event OrderRefunded(uint256 indexed orderId, uint256 amount);
    event OrderCancelled(uint256 indexed orderId);
    event AutoReleaseTriggered(uint256 indexed orderId);
    event TreasuryUpdated(address indexed newTreasury);

    function createOrder(
        address seller,
        uint256 amount,
        bool isCrossBorder
    ) external returns (uint256 orderId);

    function fundOrder(uint256 orderId) external;
    function markShipped(uint256 orderId) external;
    function confirmDelivery(uint256 orderId) external;
    function releaseMilestone(uint256 orderId) external;
    function triggerAutoRelease(uint256 orderId) external;
    function forceRefund(uint256 orderId) external;
    function cancelOrder(uint256 orderId) external;
    function markDisputed(uint256 orderId) external;
    function resolveDispute(uint256 orderId, uint256 buyerRefundAmount) external;

    function getOrder(uint256 orderId) external view returns (Order memory);
    function getOrderCount() external view returns (uint256);
}
