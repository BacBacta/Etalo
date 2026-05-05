// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { EtaloTypes } from "../types/EtaloTypes.sol";

/// @dev Minimal test harness for EtaloDispute. Exposes the 4
/// EtaloEscrow functions that EtaloDispute calls (getOrder, getItem,
/// markItemDisputed, resolveItemDispute), plus a `setOrder` helper
/// for tests to configure the mock's stub state. Does NOT implement
/// the full IEtaloEscrow surface — Solidity's interface cast does
/// not enforce full implementation at the call site.
///
/// Mocks the order shape required by EtaloDispute post-ADR-042.
/// fundedAt > 0 is enforced by EtaloDispute.openDispute and
/// EtaloEscrow.{markItemDisputed, resolveItemDispute}. Test fixtures
/// must set fundedAt for any test exercising the dispute path.
contract MockEtaloEscrow {
    address public orderBuyer;
    address public orderSeller;
    uint256 public itemPrice;
    uint256 public orderFundedAt;

    bool public markItemDisputedCalled;
    uint256 public lastMarkedOrderId;
    uint256 public lastMarkedItemId;

    bool public itemResolvedCalled;
    uint256 public lastResolvedOrderId;
    uint256 public lastResolvedItemId;
    uint256 public lastRefundAmount;

    function setOrder(
        address _buyer,
        address _seller,
        uint256 _itemPrice,
        uint256 _fundedAt
    ) external {
        orderBuyer = _buyer;
        orderSeller = _seller;
        itemPrice = _itemPrice;
        orderFundedAt = _fundedAt;
    }

    function getOrder(uint256) external view returns (EtaloTypes.Order memory o) {
        o.buyer = orderBuyer;
        o.seller = orderSeller;
        o.totalAmount = itemPrice;
        o.fundedAt = orderFundedAt;
    }

    function getItem(uint256) external view returns (EtaloTypes.Item memory i) {
        i.itemPrice = itemPrice;
    }

    function markItemDisputed(uint256 orderId, uint256 itemId) external {
        markItemDisputedCalled = true;
        lastMarkedOrderId = orderId;
        lastMarkedItemId = itemId;
    }

    function resolveItemDispute(uint256 orderId, uint256 itemId, uint256 refundAmount) external {
        itemResolvedCalled = true;
        lastResolvedOrderId = orderId;
        lastResolvedItemId = itemId;
        lastRefundAmount = refundAmount;
    }
}
