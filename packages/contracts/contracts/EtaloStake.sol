// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IEtaloStake.sol";
import "./interfaces/IEtaloReputation.sol";
import { EtaloTypes } from "./types/EtaloTypes.sol";

/// @title EtaloStake
/// @notice Three-tier cross-border seller stake. Sellers stake USDT
/// to list cross-border items; the stake is slashable by
/// EtaloDispute on proven fraud (ADR-020) and withdrawable only after
/// a 14-day cooldown with dispute-driven freeze / resume (ADR-021).
contract EtaloStake is IEtaloStake, Ownable, ReentrancyGuard {
    // ===== Tier amounts =====
    uint256 public constant TIER_1_STAKE = 10 * 10 ** 6;     // 10 USDT
    uint256 public constant TIER_2_STAKE = 25 * 10 ** 6;     // 25 USDT
    uint256 public constant TIER_3_STAKE = 50 * 10 ** 6;     // 50 USDT

    // ===== Concurrent sales caps =====
    uint256 public constant TIER_1_MAX_CONCURRENT = 3;
    uint256 public constant TIER_2_MAX_CONCURRENT = 10;
    // Tier 3 = unlimited

    // ===== Per-order price caps =====
    uint256 public constant TIER_1_MAX_PRICE = 100 * 10 ** 6;    // 100 USDT
    uint256 public constant TIER_2_MAX_PRICE = 200 * 10 ** 6;    // 200 USDT
    // Tier 3 = unlimited

    // ===== Tier 2 eligibility (ADR-020) =====
    uint256 public constant TIER_2_MIN_ORDERS = 20;
    uint256 public constant TIER_2_MIN_SENIORITY = 60 days;

    // ===== Withdrawal =====
    uint256 public constant WITHDRAWAL_COOLDOWN = 14 days;

    // ===== Token =====
    IERC20 public immutable usdt;

    // ===== External contracts =====
    IEtaloReputation public reputation;
    address public disputeContract;
    address public escrowContract;
    address public communityFund;

    // ===== State =====
    mapping(address => uint256) private _stakes;
    mapping(address => EtaloTypes.StakeTier) private _tiers;
    mapping(address => uint256) private _activeSales;
    mapping(address => uint256) private _freezeCount;

    struct WithdrawalState {
        uint256 amount;
        EtaloTypes.StakeTier targetTier;
        uint256 unlockAt;
        uint256 frozenRemaining;
        bool active;
    }
    mapping(address => WithdrawalState) private _withdrawals;

    // ===== Modifiers =====
    modifier onlyDispute() {
        require(msg.sender == disputeContract, "Only dispute contract");
        _;
    }

    modifier onlyEscrow() {
        require(msg.sender == escrowContract, "Only escrow contract");
        _;
    }

    // ===== Constructor =====
    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        usdt = IERC20(_usdt);
    }

    // ===== Admin setters =====
    function setReputationContract(address _addr) external onlyOwner {
        reputation = IEtaloReputation(_addr);
    }

    function setDisputeContract(address _addr) external onlyOwner {
        disputeContract = _addr;
    }

    function setEscrowContract(address _addr) external onlyOwner {
        escrowContract = _addr;
    }

    function setCommunityFund(address _addr) external onlyOwner {
        communityFund = _addr;
    }

    // ===== Tier amount helper =====
    function _tierAmount(EtaloTypes.StakeTier tier) internal pure returns (uint256) {
        if (tier == EtaloTypes.StakeTier.None) return 0;
        if (tier == EtaloTypes.StakeTier.Starter) return TIER_1_STAKE;
        if (tier == EtaloTypes.StakeTier.Established) return TIER_2_STAKE;
        if (tier == EtaloTypes.StakeTier.TopSeller) return TIER_3_STAKE;
        revert("Invalid tier");
    }

    // ===== Supported tier helper (ADR-028) =====
    /// @dev Returns the highest tier such that `stakeAmount` covers
    /// its threshold. Used by slashStake for auto-downgrade.
    function _supportedTier(uint256 stakeAmount) internal pure returns (EtaloTypes.StakeTier) {
        if (stakeAmount >= TIER_3_STAKE) return EtaloTypes.StakeTier.TopSeller;
        if (stakeAmount >= TIER_2_STAKE) return EtaloTypes.StakeTier.Established;
        if (stakeAmount >= TIER_1_STAKE) return EtaloTypes.StakeTier.Starter;
        return EtaloTypes.StakeTier.None;
    }

    // ===== Eligibility =====
    function _checkTier2Eligibility(address seller) internal view {
        require(address(reputation) != address(0), "Reputation not set");
        IEtaloReputation.SellerReputation memory rep = reputation.getReputation(seller);
        require(rep.ordersCompleted >= TIER_2_MIN_ORDERS, "Tier 2: 20+ orders required");
        require(rep.disputesLost == 0, "Tier 2: 0 lost disputes required");
        require(
            rep.firstOrderAt != 0 && block.timestamp >= rep.firstOrderAt + TIER_2_MIN_SENIORITY,
            "Tier 2: 60+ days seniority required"
        );
    }

    function _checkTier3Eligibility(address seller) internal view {
        require(address(reputation) != address(0), "Reputation not set");
        require(reputation.isTopSeller(seller), "Tier 3 requires Top Seller");
    }

    function _checkEligibility(address seller, EtaloTypes.StakeTier tier) internal view {
        if (tier == EtaloTypes.StakeTier.Established) {
            _checkTier2Eligibility(seller);
        } else if (tier == EtaloTypes.StakeTier.TopSeller) {
            _checkTier3Eligibility(seller);
        }
        // Tier.Starter or Tier.None: no eligibility check
    }

    // ===== Seller lifecycle =====
    function depositStake(EtaloTypes.StakeTier tier) external nonReentrant {
        // Checks
        require(tier != EtaloTypes.StakeTier.None, "Invalid tier");
        require(_tiers[msg.sender] == EtaloTypes.StakeTier.None, "Already staked");
        _checkEligibility(msg.sender, tier);

        uint256 amount = _tierAmount(tier);

        // Effects — CEI strict (ADR-032), state before external call
        _stakes[msg.sender] = amount;
        _tiers[msg.sender] = tier;
        emit StakeDeposited(msg.sender, amount, tier);

        // Interactions
        require(usdt.transferFrom(msg.sender, address(this), amount), "USDT transfer failed");
    }

    /// @notice Tier up. Delta is based on actual stake (ADR-028) —
    /// if the seller is already over-collateralized at `newTier`
    /// (from a prior `topUpStake` or auto-downgrade), the call is
    /// free (delta = 0, no transfer).
    function upgradeTier(EtaloTypes.StakeTier newTier) external nonReentrant {
        // Checks
        EtaloTypes.StakeTier currentTier = _tiers[msg.sender];
        require(currentTier != EtaloTypes.StakeTier.None, "Not staked");
        require(uint8(newTier) > uint8(currentTier), "Not an upgrade");
        require(!_withdrawals[msg.sender].active, "Withdrawal active");
        _checkEligibility(msg.sender, newTier);

        uint256 currentStake = _stakes[msg.sender];
        uint256 newAmount = _tierAmount(newTier);
        uint256 delta = newAmount > currentStake ? newAmount - currentStake : 0;

        // Effects — CEI strict (ADR-032)
        if (delta > 0) {
            _stakes[msg.sender] += delta;
        }
        _tiers[msg.sender] = newTier;
        emit StakeUpgraded(msg.sender, currentTier, newTier, delta);

        // Interactions
        if (delta > 0) {
            require(usdt.transferFrom(msg.sender, address(this), delta), "USDT transfer failed");
        }
    }

    /// @notice Start a 14-day cooldown to return stake. Refund is
    /// based on actual stake (ADR-028), handling both normal
    /// downgrades and over-collateralized stakes. When currentTier
    /// is None and _stakes[seller] > 0 (orphan residual after a slash
    /// that emptied tier eligibility), caller may pass newTier = None
    /// to drain the residual — this is the only way to recover
    /// sub-TIER_1 dust.
    function initiateWithdrawal(EtaloTypes.StakeTier newTier) external {
        EtaloTypes.StakeTier currentTier = _tiers[msg.sender];
        uint256 currentStake = _stakes[msg.sender];
        require(currentStake > 0, "No stake to withdraw");
        require(uint8(newTier) <= uint8(currentTier), "Not a downgrade");
        require(_activeSales[msg.sender] == 0, "Active cross-border sales");
        require(!_withdrawals[msg.sender].active, "Withdrawal already pending");

        uint256 newAmount = _tierAmount(newTier);
        require(currentStake > newAmount, "Nothing to withdraw at that target");
        uint256 refund = currentStake - newAmount;

        uint256 unlockAt;
        uint256 frozenRemaining;
        if (_freezeCount[msg.sender] == 0) {
            unlockAt = block.timestamp + WITHDRAWAL_COOLDOWN;
            frozenRemaining = 0;
        } else {
            // Defensive: if a freeze is already active, start the
            // withdrawal in frozen state with the full cooldown pending.
            unlockAt = 0;
            frozenRemaining = WITHDRAWAL_COOLDOWN;
        }

        _withdrawals[msg.sender] = WithdrawalState({
            amount: refund,
            targetTier: newTier,
            unlockAt: unlockAt,
            frozenRemaining: frozenRemaining,
            active: true
        });

        emit WithdrawalInitiated(msg.sender, refund, unlockAt);
    }

    function executeWithdrawal() external nonReentrant {
        WithdrawalState storage w = _withdrawals[msg.sender];
        require(w.active, "No pending withdrawal");
        require(_freezeCount[msg.sender] == 0, "Frozen by dispute");
        require(block.timestamp >= w.unlockAt, "Cooldown not expired");

        uint256 amount = w.amount;
        EtaloTypes.StakeTier newTier = w.targetTier;

        _stakes[msg.sender] -= amount;
        _tiers[msg.sender] = newTier;
        delete _withdrawals[msg.sender];

        require(usdt.transfer(msg.sender, amount), "USDT transfer failed");

        emit WithdrawalExecuted(msg.sender, amount);
    }

    function cancelWithdrawal() external {
        require(_withdrawals[msg.sender].active, "No pending withdrawal");
        delete _withdrawals[msg.sender];
        emit WithdrawalCancelled(msg.sender);
    }

    /// @notice Add USDT to an existing stake without changing tier
    /// (ADR-028). Caller must already be staked and have no pending
    /// withdrawal; resulting stake capped at TIER_3_STAKE to prevent
    /// typo-driven overfunding. Use `upgradeTier` separately to
    /// climb tiers (eligibility enforced).
    function topUpStake(uint256 amount) external nonReentrant {
        // Checks
        require(amount > 0, "Amount must be > 0");
        require(_tiers[msg.sender] != EtaloTypes.StakeTier.None, "Not staked");
        require(!_withdrawals[msg.sender].active, "Withdrawal active");
        require(_stakes[msg.sender] + amount <= TIER_3_STAKE, "Would exceed max tier stake");

        // Effects — CEI strict (ADR-032)
        _stakes[msg.sender] += amount;
        emit StakeToppedUp(msg.sender, amount, _stakes[msg.sender]);

        // Interactions
        require(usdt.transferFrom(msg.sender, address(this), amount), "USDT transfer failed");
    }

    // ===== Dispute hooks =====
    function pauseWithdrawal(address seller, uint256 disputeId) external onlyDispute {
        WithdrawalState storage w = _withdrawals[seller];
        if (w.active && _freezeCount[seller] == 0) {
            // Transition 0 → 1: capture remaining cooldown
            w.frozenRemaining = w.unlockAt > block.timestamp
                ? w.unlockAt - block.timestamp
                : 0;
            w.unlockAt = 0;
        }
        _freezeCount[seller]++;
        emit WithdrawalPaused(seller, disputeId);
    }

    function resumeWithdrawal(address seller) external onlyDispute {
        require(_freezeCount[seller] > 0, "No freeze to resume");
        _freezeCount[seller]--;

        WithdrawalState storage w = _withdrawals[seller];
        if (_freezeCount[seller] == 0 && w.active) {
            // Transition N → 0: recompute unlockAt from remaining
            uint256 newUnlockAt = block.timestamp + w.frozenRemaining;
            w.unlockAt = newUnlockAt;
            w.frozenRemaining = 0;
            emit WithdrawalResumed(seller, newUnlockAt);
        }
    }

    /// @notice Deducts `amount` from the seller's stake and transfers
    /// it to `recipient`. Per ADR-028, if the remaining stake falls
    /// below the current tier's threshold, the seller is auto-
    /// downgraded to the highest tier the remaining stake supports
    /// (possibly None). Eligibility checks are skipped on this
    /// forced transition — the slash is driven by dispute, not by
    /// the seller. Sub-TIER_1 residuals are recoverable via
    /// `initiateWithdrawal(None)`.
    function slashStake(
        address seller,
        uint256 amount,
        address recipient,
        uint256 disputeId
    ) external onlyDispute nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(_stakes[seller] >= amount, "Slash exceeds stake");

        _stakes[seller] -= amount;

        EtaloTypes.StakeTier oldTier = _tiers[seller];
        EtaloTypes.StakeTier newTier = _supportedTier(_stakes[seller]);
        if (newTier != oldTier) {
            _tiers[seller] = newTier;
            emit TierAutoDowngraded(seller, oldTier, newTier, _stakes[seller]);
        }

        require(usdt.transfer(recipient, amount), "USDT transfer failed");

        emit StakeSlashed(seller, amount, recipient, disputeId);
    }

    // ===== Escrow hooks =====
    function incrementActiveSales(address seller) external onlyEscrow {
        _activeSales[seller]++;
    }

    function decrementActiveSales(address seller) external onlyEscrow {
        require(_activeSales[seller] > 0, "Active sales already zero");
        _activeSales[seller]--;
    }

    // ===== Views =====
    function getStake(address seller) external view returns (uint256) {
        return _stakes[seller];
    }

    function getTier(address seller) external view returns (EtaloTypes.StakeTier) {
        return _tiers[seller];
    }

    function getActiveSales(address seller) external view returns (uint256) {
        return _activeSales[seller];
    }

    function canWithdraw(address seller) external view returns (bool) {
        WithdrawalState storage w = _withdrawals[seller];
        return w.active && _freezeCount[seller] == 0 && block.timestamp >= w.unlockAt;
    }

    function isEligibleForOrder(address seller, uint256 orderPrice)
        external
        view
        returns (bool)
    {
        EtaloTypes.StakeTier tier = _tiers[seller];
        if (tier == EtaloTypes.StakeTier.None) return false;
        if (_withdrawals[seller].active) return false;

        uint256 maxConcurrent;
        uint256 maxPrice;
        if (tier == EtaloTypes.StakeTier.Starter) {
            maxConcurrent = TIER_1_MAX_CONCURRENT;
            maxPrice = TIER_1_MAX_PRICE;
        } else if (tier == EtaloTypes.StakeTier.Established) {
            maxConcurrent = TIER_2_MAX_CONCURRENT;
            maxPrice = TIER_2_MAX_PRICE;
        } else {
            // TopSeller — unlimited
            maxConcurrent = type(uint256).max;
            maxPrice = type(uint256).max;
        }

        return _activeSales[seller] < maxConcurrent && orderPrice <= maxPrice;
    }

    /// @notice Helper tuple view for tests and off-chain indexers;
    /// not part of the canonical interface.
    function getWithdrawal(address seller)
        external
        view
        returns (
            uint256 amount,
            EtaloTypes.StakeTier targetTier,
            uint256 unlockAt,
            uint256 frozenRemaining,
            bool active,
            uint256 freezeCount
        )
    {
        WithdrawalState storage w = _withdrawals[seller];
        return (
            w.amount,
            w.targetTier,
            w.unlockAt,
            w.frozenRemaining,
            w.active,
            _freezeCount[seller]
        );
    }
}
