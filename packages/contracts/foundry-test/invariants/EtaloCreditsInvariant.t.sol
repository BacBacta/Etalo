// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { EtaloCredits } from "../../contracts/EtaloCredits.sol";
import { MockUSDT } from "../../contracts/test/MockUSDT.sol";

/// @title EtaloCreditsHandler
/// @notice Drives bounded random purchases against EtaloCredits and
///         tracks a ghost accumulator of total credits sold. Bounds:
///         creditAmount ∈ [1, 10_000] (realistic single-purchase range,
///         keeps fuzzer USDT mints reasonable). Actor address is fuzzed
///         from `actorSeed` to spread purchases across many wallets and
///         exercise per-buyer accounting paths.
contract EtaloCreditsHandler is Test {
    EtaloCredits public credits;
    MockUSDT public usdt;
    address public treasury;
    uint256 public ghostTotalCredits;

    constructor(EtaloCredits _credits, MockUSDT _usdt, address _treasury) {
        credits = _credits;
        usdt = _usdt;
        treasury = _treasury;
    }

    function purchaseCredits(uint256 creditAmount, uint256 actorSeed) public {
        creditAmount = bound(creditAmount, 1, 10_000);
        address actor = address(
            uint160(bound(actorSeed, 1, type(uint160).max))
        );

        uint256 usdtAmount = creditAmount * credits.USDT_PER_CREDIT();

        usdt.mint(actor, usdtAmount);

        vm.startPrank(actor);
        usdt.approve(address(credits), usdtAmount);
        credits.purchaseCredits(creditAmount);
        vm.stopPrank();

        ghostTotalCredits += creditAmount;
    }
}

/// @title EtaloCreditsInvariant
/// @notice Single critical invariant for V1 credits accounting: the
///         USDT balance of the credits treasury must equal the ghost
///         accumulator of all purchased credits times USDT_PER_CREDIT.
///         Any divergence means the protocol has lost USDT accounting
///         (e.g. a bug in purchaseCredits, a transfer hook, or a
///         treasury redirection). Default Foundry config: 256 runs ×
///         50 calls = ~12,800 bounded actions per CI run.
contract EtaloCreditsInvariantTest is Test {
    EtaloCredits public credits;
    MockUSDT public usdt;
    address public treasury =
        address(0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA); // ADR-024 creditsTreasury
    EtaloCreditsHandler public handler;

    function setUp() public {
        usdt = new MockUSDT();
        credits = new EtaloCredits(
            address(usdt),
            treasury,
            address(this)
        );
        handler = new EtaloCreditsHandler(credits, usdt, treasury);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = handler.purchaseCredits.selector;
        targetSelector(
            FuzzSelector({addr: address(handler), selectors: selectors})
        );
    }

    /// @notice The only state mutation in EtaloCredits is the USDT
    ///         transferFrom into the treasury. The treasury balance
    ///         must therefore equal the cumulative credits sold times
    ///         the per-credit price.
    function invariant_treasuryEqualsCreditsTotal() public view {
        uint256 expected =
            handler.ghostTotalCredits() * credits.USDT_PER_CREDIT();
        uint256 actual = usdt.balanceOf(treasury);
        assertEq(actual, expected, "Treasury USDT != credits * 150_000");
    }
}
