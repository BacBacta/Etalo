// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IEtaloEscrow.sol";
import "./interfaces/IEtaloReputation.sol";

contract EtaloEscrow is IEtaloEscrow, ReentrancyGuard, Ownable {
    // --- Constants ---
    uint256 public constant COMMISSION_INTRA_BPS = 180; // 1.8%
    uint256 public constant COMMISSION_CROSS_BPS = 270; // 2.7%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant AUTO_RELEASE_INTRA = 3 days;
    uint256 public constant AUTO_RELEASE_TOP_SELLER = 2 days;
    uint256 public constant AUTO_RELEASE_CROSS = 7 days;
    uint256 public constant CROSS_BORDER_MILESTONES = 4;

    // --- State ---
    IERC20 public immutable usdt;
    IEtaloReputation public reputation;
    address public treasury;
    address public disputeContract;

    uint256 private _nextOrderId;
    mapping(uint256 => Order) private _orders;

    // --- Modifiers ---
    modifier onlyBuyer(uint256 orderId) {
        require(msg.sender == _orders[orderId].buyer, "Not buyer");
        _;
    }

    modifier onlySeller(uint256 orderId) {
        require(msg.sender == _orders[orderId].seller, "Not seller");
        _;
    }

    modifier onlyDisputeContract() {
        require(msg.sender == disputeContract, "Not dispute contract");
        _;
    }

    modifier orderExists(uint256 orderId) {
        require(orderId < _nextOrderId, "Order does not exist");
        _;
    }

    // --- Constructor ---
    constructor(
        address _usdt,
        address _treasury,
        address _reputation
    ) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury address");
        usdt = IERC20(_usdt);
        treasury = _treasury;
        if (_reputation != address(0)) {
            reputation = IEtaloReputation(_reputation);
        }
    }

    // --- Admin ---
    function setDisputeContract(address _dispute) external onlyOwner {
        require(_dispute != address(0), "Invalid dispute address");
        disputeContract = _dispute;
    }

    function setReputation(address _reputation) external onlyOwner {
        require(_reputation != address(0), "Invalid reputation address");
        reputation = IEtaloReputation(_reputation);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // --- Core Functions ---
    function createOrder(
        address seller,
        uint256 amount,
        bool isCrossBorder
    ) external returns (uint256 orderId) {
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Cannot buy from self");
        require(amount > 0, "Amount must be > 0");

        orderId = _nextOrderId++;

        uint256 commissionBps = isCrossBorder ? COMMISSION_CROSS_BPS : COMMISSION_INTRA_BPS;
        uint256 commission = (amount * commissionBps) / BPS_DENOMINATOR;
        uint256 milestoneCount = isCrossBorder ? CROSS_BORDER_MILESTONES : 1;

        _orders[orderId] = Order({
            orderId: orderId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            commission: commission,
            milestoneCount: milestoneCount,
            milestonesReleased: 0,
            createdAt: block.timestamp,
            shippedAt: 0,
            autoReleaseAfter: 0,
            status: OrderStatus.Created,
            isCrossBorder: isCrossBorder
        });

        emit OrderCreated(orderId, msg.sender, seller, amount, isCrossBorder);
    }

    function fundOrder(uint256 orderId) external nonReentrant orderExists(orderId) onlyBuyer(orderId) {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.Created, "Order not in Created state");

        bool success = usdt.transferFrom(msg.sender, address(this), order.amount);
        require(success, "USDT transfer failed");

        order.status = OrderStatus.Funded;
        emit OrderFunded(orderId, order.amount);
    }

    function markShipped(uint256 orderId) external orderExists(orderId) onlySeller(orderId) {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.Funded, "Order not funded");

        order.status = OrderStatus.Shipped;
        order.shippedAt = block.timestamp;
        order.autoReleaseAfter = block.timestamp + _getAutoReleaseDuration(order.seller, order.isCrossBorder);

        emit OrderShipped(orderId);
    }

    function confirmDelivery(uint256 orderId) external nonReentrant orderExists(orderId) onlyBuyer(orderId) {
        Order storage order = _orders[orderId];
        require(
            order.status == OrderStatus.Shipped || order.status == OrderStatus.Delivered,
            "Order not shipped/delivered"
        );

        order.status = OrderStatus.Delivered;
        emit OrderDelivered(orderId);

        _releaseAll(orderId);
    }

    function releaseMilestone(uint256 orderId) external nonReentrant orderExists(orderId) onlyBuyer(orderId) {
        Order storage order = _orders[orderId];
        require(order.isCrossBorder, "Not a cross-border order");
        require(
            order.status == OrderStatus.Shipped || order.status == OrderStatus.Delivered,
            "Order not shipped/delivered"
        );
        require(order.milestonesReleased < order.milestoneCount, "All milestones released");

        order.milestonesReleased++;
        uint256 milestoneAmount = (order.amount - order.commission) / order.milestoneCount;

        bool success = usdt.transfer(order.seller, milestoneAmount);
        require(success, "Milestone transfer failed");

        emit MilestoneReleased(orderId, order.milestonesReleased, milestoneAmount);

        if (order.milestonesReleased == order.milestoneCount) {
            _finalizeOrder(orderId);
        }
    }

    function triggerAutoRelease(uint256 orderId) external nonReentrant orderExists(orderId) {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.Shipped, "Order not shipped");
        require(order.autoReleaseAfter > 0, "Auto-release not set");
        require(block.timestamp >= order.autoReleaseAfter, "Auto-release not yet available");

        emit AutoReleaseTriggered(orderId);
        _releaseAll(orderId);
    }

    function cancelOrder(uint256 orderId) external nonReentrant orderExists(orderId) {
        Order storage order = _orders[orderId];
        require(msg.sender == order.buyer || msg.sender == owner(), "Not authorized");
        require(order.status == OrderStatus.Created, "Can only cancel unfunded orders");

        order.status = OrderStatus.Cancelled;
        emit OrderCancelled(orderId);
    }

    function forceRefund(uint256 orderId) external nonReentrant onlyOwner orderExists(orderId) {
        Order storage order = _orders[orderId];
        require(
            order.status == OrderStatus.Funded ||
            order.status == OrderStatus.Shipped ||
            order.status == OrderStatus.Disputed,
            "Cannot refund in current state"
        );

        uint256 refundAmount = order.amount - _alreadyReleasedAmount(order);
        order.status = OrderStatus.Refunded;

        if (refundAmount > 0) {
            bool success = usdt.transfer(order.buyer, refundAmount);
            require(success, "Refund transfer failed");
        }

        emit OrderRefunded(orderId, refundAmount);
    }

    // --- Dispute Contract Interface ---
    function markDisputed(uint256 orderId) external orderExists(orderId) onlyDisputeContract {
        Order storage order = _orders[orderId];
        require(
            order.status == OrderStatus.Funded ||
            order.status == OrderStatus.Shipped,
            "Cannot dispute in current state"
        );

        order.status = OrderStatus.Disputed;
        order.autoReleaseAfter = 0; // freeze auto-release
        emit OrderDisputed(orderId);
    }

    function resolveDispute(uint256 orderId, uint256 buyerRefundAmount) external nonReentrant orderExists(orderId) onlyDisputeContract {
        Order storage order = _orders[orderId];
        require(order.status == OrderStatus.Disputed, "Order not disputed");

        uint256 remaining = order.amount - _alreadyReleasedAmount(order);
        require(buyerRefundAmount <= remaining, "Refund exceeds remaining");

        if (buyerRefundAmount > 0) {
            bool success = usdt.transfer(order.buyer, buyerRefundAmount);
            require(success, "Buyer refund failed");
        }

        uint256 sellerAmount = remaining - buyerRefundAmount;
        if (sellerAmount > 0) {
            // Deduct commission from seller's portion
            uint256 commissionOnSeller = (sellerAmount * order.commission) / order.amount;
            uint256 sellerPayout = sellerAmount - commissionOnSeller;

            if (commissionOnSeller > 0) {
                bool successTreasury = usdt.transfer(treasury, commissionOnSeller);
                require(successTreasury, "Commission transfer failed");
            }
            if (sellerPayout > 0) {
                bool successSeller = usdt.transfer(order.seller, sellerPayout);
                require(successSeller, "Seller transfer failed");
            }
        }

        order.status = buyerRefundAmount == remaining ? OrderStatus.Refunded : OrderStatus.Completed;

        if (buyerRefundAmount < remaining) {
            emit OrderCompleted(orderId, remaining - buyerRefundAmount, 0);
        } else {
            emit OrderRefunded(orderId, buyerRefundAmount);
        }
    }

    // --- View Functions ---
    function getOrder(uint256 orderId) external view orderExists(orderId) returns (Order memory) {
        return _orders[orderId];
    }

    function getOrderCount() external view returns (uint256) {
        return _nextOrderId;
    }

    // --- Internal ---
    function _releaseAll(uint256 orderId) internal {
        Order storage order = _orders[orderId];
        uint256 alreadyReleased = _alreadyReleasedAmount(order);
        uint256 remaining = order.amount - alreadyReleased;

        uint256 remainingCommission = order.commission - _alreadyReleasedCommission(order);
        uint256 sellerPayout = remaining - remainingCommission;

        if (remainingCommission > 0) {
            bool successTreasury = usdt.transfer(treasury, remainingCommission);
            require(successTreasury, "Commission transfer failed");
        }

        if (sellerPayout > 0) {
            bool successSeller = usdt.transfer(order.seller, sellerPayout);
            require(successSeller, "Seller transfer failed");
        }

        order.milestonesReleased = order.milestoneCount;
        _finalizeOrder(orderId);

        emit OrderCompleted(orderId, sellerPayout, remainingCommission);
    }

    function _finalizeOrder(uint256 orderId) internal {
        Order storage order = _orders[orderId];
        order.status = OrderStatus.Completed;

        if (address(reputation) != address(0)) {
            reputation.recordCompletedOrder(order.seller, orderId, order.amount);
            reputation.checkAndUpdateTopSeller(order.seller);
        }
    }

    function _getAutoReleaseDuration(address seller, bool isCrossBorder) internal view returns (uint256) {
        if (isCrossBorder) {
            return AUTO_RELEASE_CROSS;
        }
        if (address(reputation) != address(0) && reputation.isTopSeller(seller)) {
            return AUTO_RELEASE_TOP_SELLER;
        }
        return AUTO_RELEASE_INTRA;
    }

    function _alreadyReleasedAmount(Order storage order) internal view returns (uint256) {
        if (order.milestoneCount == 0) return 0;
        uint256 perMilestone = (order.amount - order.commission) / order.milestoneCount;
        return perMilestone * order.milestonesReleased;
    }

    function _alreadyReleasedCommission(Order storage order) internal view returns (uint256) {
        // Commission is taken once at full release for intra, proportionally for cross-border
        if (!order.isCrossBorder || order.milestoneCount == 0) return 0;
        return (order.commission * order.milestonesReleased) / order.milestoneCount;
    }
}
