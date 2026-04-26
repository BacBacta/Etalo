// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EtaloCredits
/// @notice Hybrid credits system for V1 Boutique pillar 3 (asset
///         generator). Sellers buy credits in USDT through this
///         contract; consumption (one credit per generated marketing
///         image) is tracked off-chain by the backend ledger to keep
///         the per-image UX free of wallet popups (ADR-037).
/// @dev    Pricing 0.15 USDT/credit anchored in ADR-014 +
///         docs/PRICING_MODEL_CREDITS.md. Treasury split per ADR-024
///         (USDT lands in `creditsTreasury`, separate from
///         commissionTreasury and communityFund). SafeERC20 is used
///         for the USDT transferFrom because USDT historically
///         returns no value on success / revert on failure (ADR-007).
contract EtaloCredits is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /// @notice USDT token used for credit purchases. Set at construction.
    IERC20 public immutable usdt;

    /// @notice Treasury that receives USDT from credit purchases.
    ///         Per ADR-024 this is `creditsTreasury` — distinct from
    ///         commissionTreasury and communityFund.
    address public immutable creditsTreasury;

    /// @notice Cost in USDT raw units (6 decimals) per credit.
    ///         150_000 = 0.15 USDT × 1e6. Per ADR-014, immutable for V1
    ///         (no admin override) so the pricing anchor cannot drift.
    uint256 public constant USDT_PER_CREDIT = 150_000;

    /// @notice Backend oracle address. V1 = setter only — no contract
    ///         logic consumes this. V1.5+ may add an oracle-callable
    ///         hook (e.g. recordConsumption(seller, amount)) for an
    ///         on-chain audit trail of off-chain spend.
    address public backendOracle;

    /// @notice Emitted when credits are purchased on-chain.
    /// @param buyer        wallet that paid USDT and received credit
    ///                     balance (off-chain)
    /// @param creditAmount number of credits purchased
    /// @param usdtAmount   USDT raw units transferred
    ///                     (creditAmount × USDT_PER_CREDIT)
    /// @param timestamp    block.timestamp of the purchase
    event CreditsPurchased(
        address indexed buyer,
        uint256 creditAmount,
        uint256 usdtAmount,
        uint256 timestamp
    );

    /// @notice Emitted when admin updates the backend oracle.
    /// @param oldOracle previous oracle (address(0) on first set)
    /// @param newOracle new oracle
    event BackendOracleSet(
        address indexed oldOracle,
        address indexed newOracle
    );

    /// @param _usdt            USDT token contract address
    /// @param _creditsTreasury creditsTreasury address (ADR-024)
    /// @param _admin           initial owner (admin)
    constructor(
        address _usdt,
        address _creditsTreasury,
        address _admin
    ) Ownable(_admin) {
        require(_usdt != address(0), "Zero USDT address");
        require(_creditsTreasury != address(0), "Zero treasury address");
        usdt = IERC20(_usdt);
        creditsTreasury = _creditsTreasury;
    }

    /// @notice Buy `creditAmount` credits by paying
    ///         `creditAmount * USDT_PER_CREDIT` USDT to the credits
    ///         treasury. The on-chain event is the source of truth for
    ///         purchases; the backend ledger reads it (via the indexer)
    ///         and credits the seller's off-chain balance.
    /// @dev    nonReentrant + whenNotPaused. CEI strict — the only
    ///         external call is the USDT transferFrom and it happens
    ///         after the event is emitted from the call ordering's
    ///         perspective (reentry would still be cheap-no-op since
    ///         no state mutates here, but nonReentrant + a single
    ///         external call keeps the pattern consistent with V2).
    /// @param creditAmount number of credits (must be > 0)
    function purchaseCredits(uint256 creditAmount)
        external
        nonReentrant
        whenNotPaused
    {
        require(creditAmount > 0, "Zero credits");

        uint256 usdtAmount = creditAmount * USDT_PER_CREDIT;

        emit CreditsPurchased(
            msg.sender,
            creditAmount,
            usdtAmount,
            block.timestamp
        );

        usdt.safeTransferFrom(msg.sender, creditsTreasury, usdtAmount);
    }

    /// @notice Admin: pause new purchases. Existing on-chain state is
    ///         not affected. Aligned with ADR-026 emergency-pause
    ///         pattern (admin power bounded by code).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Admin: unpause and resume purchases.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Admin: set the backend oracle address.
    /// @dev    V1 stores the address and emits an event — no contract
    ///         logic uses it. The setter is in place so V1.5+ can wire
    ///         oracle-callable functions without redeploying. Reverts
    ///         on the zero address to keep the slot meaningful.
    /// @param newOracle new oracle address (must not be zero)
    function setBackendOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero oracle");
        address oldOracle = backendOracle;
        backendOracle = newOracle;
        emit BackendOracleSet(oldOracle, newOracle);
    }
}
