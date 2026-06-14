// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EtaloBoutiqueBilling
/// @notice One-time boutique creation fee for V1 (ADR-059). A seller
///         pays a single flat fee in USDT to open a boutique; the
///         payment is a pure push transfer to `commissionTreasury` and
///         the on-chain event is the source of truth. The backend
///         indexer mirrors `CreationFeePaid` and the seller-profile
///         activation gate reads that mirror.
/// @dev    Deliberately minimal — a dumb payment rail mirroring
///         EtaloCredits. There is NO recurring/subscription logic
///         (ADR-059 dropped monthly maintenance for strategic-friction
///         reasons; "no subscription" of ADR-041 stays true — this is a
///         one-shot fee). The Proof-of-Ship free window and the profile
///         gating live entirely off-chain (backend `FEES_ENFORCED_FROM`
///         + the indexer mirror), so this contract carries no date and
///         needs no upgrade around the launch promo.
///
///         Treasury: USDT lands in `commissionTreasury` per the ADR-059
///         amendment to ADR-024 (boutique fees share the commission
///         slot rather than spawning a new treasury). SafeERC20 is used
///         for the USDT transferFrom because USDT historically returns
///         no value on success / reverts on failure (ADR-007).
contract EtaloBoutiqueBilling is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /// @notice USDT token used for the creation fee. Set at construction.
    IERC20 public immutable usdt;

    /// @notice Treasury that receives the creation fee. Per the ADR-059
    ///         amendment to ADR-024 this is `commissionTreasury` — the
    ///         same slot as the 1.8% order commission.
    address public immutable commissionTreasury;

    /// @notice One-time boutique creation fee in USDT raw units
    ///         (6 decimals). 1_000_000 = 1 USDT. Immutable for V1 so the
    ///         pricing anchor cannot drift (mirrors EtaloCredits).
    uint256 public constant CREATION_FEE = 1_000_000;

    /// @notice Whether a wallet has already paid its boutique creation
    ///         fee. The fee is one-shot per wallet; a second call
    ///         reverts. The backend reads `CreationFeePaid` (via the
    ///         indexer) to activate the seller profile.
    mapping(address => bool) public creationPaid;

    /// @notice Emitted when a seller pays the one-time creation fee.
    /// @param seller    wallet that paid CREATION_FEE USDT
    /// @param timestamp block.timestamp of the payment
    event CreationFeePaid(address indexed seller, uint256 timestamp);

    /// @param _usdt               USDT token contract address
    /// @param _commissionTreasury commissionTreasury address (ADR-024 /
    ///                            ADR-059)
    /// @param _admin              initial owner (admin)
    constructor(
        address _usdt,
        address _commissionTreasury,
        address _admin
    ) Ownable(_admin) {
        require(_usdt != address(0), "Zero USDT address");
        require(_commissionTreasury != address(0), "Zero treasury address");
        usdt = IERC20(_usdt);
        commissionTreasury = _commissionTreasury;
    }

    /// @notice Pay the one-time boutique creation fee of CREATION_FEE
    ///         USDT to the commission treasury. The on-chain event is
    ///         the source of truth; the backend indexer reads it and
    ///         flips the seller profile to active.
    /// @dev    nonReentrant + whenNotPaused. CEI strict — state write
    ///         and event precede the single external call (USDT
    ///         transferFrom). One-shot per wallet via the `creationPaid`
    ///         guard, so a re-entrant second call would revert anyway.
    function payCreationFee() external nonReentrant whenNotPaused {
        require(!creationPaid[msg.sender], "Already paid");

        creationPaid[msg.sender] = true;
        emit CreationFeePaid(msg.sender, block.timestamp);

        usdt.safeTransferFrom(msg.sender, commissionTreasury, CREATION_FEE);
    }

    /// @notice Admin: pause new creation-fee payments. Existing on-chain
    ///         state is not affected. Aligned with the ADR-026
    ///         emergency-pause pattern (admin power bounded by code).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Admin: unpause and resume creation-fee payments.
    function unpause() external onlyOwner {
        _unpause();
    }
}
