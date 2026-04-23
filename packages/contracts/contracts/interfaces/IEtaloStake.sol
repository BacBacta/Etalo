// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { EtaloTypes } from "../types/EtaloTypes.sol";

/// @title IEtaloStake
/// @notice Three-tier cross-border seller stake contract (ADR-020,
/// ADR-021). Sellers deposit a tiered stake to list cross-border
/// items; the stake is slashable by EtaloDispute on proven fraud and
/// withdrawable only after a 14-day cooldown with no active dispute.
interface IEtaloStake {
    // ===== Events (SPEC §13.3) =====
    event StakeDeposited(address indexed seller, uint256 amount, EtaloTypes.StakeTier tier);
    event StakeUpgraded(
        address indexed seller,
        EtaloTypes.StakeTier oldTier,
        EtaloTypes.StakeTier newTier,
        uint256 addedAmount
    );
    event WithdrawalInitiated(address indexed seller, uint256 amount, uint256 unlockAt);
    event WithdrawalExecuted(address indexed seller, uint256 amount);
    event WithdrawalPaused(address indexed seller, uint256 disputeId);
    event WithdrawalResumed(address indexed seller, uint256 newUnlockAt);
    event WithdrawalCancelled(address indexed seller);
    event StakeSlashed(
        address indexed seller,
        uint256 amount,
        address indexed recipient,
        uint256 disputeId
    );

    // ===== Seller lifecycle =====

    /// @notice Initial stake deposit. Seller must approve the contract
    /// for the tier amount in USDT beforehand.
    function depositStake(EtaloTypes.StakeTier tier) external;

    /// @notice Top up the stake from currentTier to newTier; seller
    /// sends the delta (e.g. Starter→Established = 15 USDT).
    function upgradeTier(EtaloTypes.StakeTier newTier) external;

    /// @notice Start the 14-day cooldown. newTier=None means full
    /// exit, newTier<currentTier is a partial downgrade returning the
    /// excess. Reverts when the seller has any active cross-border
    /// sale.
    function initiateWithdrawal(EtaloTypes.StakeTier newTier) external;

    /// @notice Transfer the pending withdrawal after the cooldown
    /// expires and no dispute freezes it.
    function executeWithdrawal() external;

    /// @notice Abort a pending withdrawal; the stake becomes fully
    /// available again immediately.
    function cancelWithdrawal() external;

    // ===== Dispute hooks (onlyDisputeContract) =====

    /// @notice Freezes any pending cooldown while a dispute is open.
    function pauseWithdrawal(address seller, uint256 disputeId) external;

    /// @notice Resumes the cooldown from the remaining duration.
    function resumeWithdrawal(address seller) external;

    /// @notice Deducts `amount` from the seller's stake and transfers
    /// it to `recipient`. Reverts when `amount > getStake(seller)`.
    /// For ADR-020 §6.5 two-way splits (victim buyer first, community
    /// fund for surplus), EtaloDispute calls this twice sequentially
    /// — once per recipient — rather than passing both to EtaloStake.
    function slashStake(
        address seller,
        uint256 amount,
        address recipient,
        uint256 disputeId
    ) external;

    // ===== Escrow hooks (onlyEscrow) =====

    /// @notice Increment the seller's active-sales counter. Called by
    /// EtaloEscrow on every cross-border createOrderWithItems. Pairs
    /// with decrementActiveSales on order terminal states.
    /// @dev Block 9 invariant (see memory note): sum over all sellers
    /// of getActiveSales(seller) equals the count of orders in active
    /// states in EtaloEscrow. Any forgotten decrement path causes the
    /// two sides to diverge and will trigger the Foundry fuzzer.
    function incrementActiveSales(address seller) external;

    /// @notice Decrement the seller's active-sales counter when an
    /// order reaches Completed or Refunded.
    function decrementActiveSales(address seller) external;

    // ===== Views =====

    function getStake(address seller) external view returns (uint256);

    function getTier(address seller) external view returns (EtaloTypes.StakeTier);

    function getActiveSales(address seller) external view returns (uint256);

    /// @notice True once the cooldown expired and no dispute is
    /// freezing this seller's stake.
    function canWithdraw(address seller) external view returns (bool);

    /// @notice True when the seller meets the active tier's
    /// concurrent-sales cap AND per-order price cap for a cross-border
    /// sale of `orderPrice`, AND has no pending withdrawal. Returns
    /// false for the entire 14-day cooldown window — the seller must
    /// cancelWithdrawal to resume listing. Consumed by
    /// EtaloEscrow.createOrderWithItems.
    function isEligibleForOrder(address seller, uint256 orderPrice)
        external
        view
        returns (bool);
}
