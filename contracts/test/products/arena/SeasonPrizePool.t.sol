// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/SeasonPrizePool.t.sol (R4-9, D-227) — the mock collateral becomes a real
// TIP-20 from the factory precompile (EngineFixture's `usd`); every assertion is Masayume's.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SeasonPrizePool} from "../../../src/products/arena/SeasonPrizePool.sol";
import {EngineFixture} from "../../engine/harness/EngineFixture.sol";

/// @dev The prize rail's four properties, the reference's own: anyone funds, only the admin pays, once, never
///      more than the pool holds — and nothing is ever stuck.
contract SeasonPrizePoolTest is EngineFixture {
    uint256 internal constant ONE = 1e6;

    SeasonPrizePool internal pool;

    address internal poolAdmin = address(this);
    address internal funder = makeAddr("funder");
    address internal first = makeAddr("first");
    address internal second = makeAddr("second");
    address internal stranger = makeAddr("stranger");

    function setUp() public override {
        super.setUp();
        pool = new SeasonPrizePool(IERC20(address(usd)), "season-1", uint64(vm.getBlockTimestamp() + 30 days));
        usd.mint(funder, 1_000 * ONE);
        vm.prank(funder);
        usd.approve(address(pool), type(uint256).max);
    }

    function fund(uint256 amount) internal {
        vm.prank(funder);
        pool.deposit(amount);
    }

    function test_anyoneFunds_andTheBalanceIsWhatThePoolHolds() public {
        vm.expectEmit(true, false, false, true, address(pool));
        emit SeasonPrizePool.Deposited(funder, 100 * ONE, 100 * ONE);
        fund(100 * ONE);
        assertEq(pool.balance(), 100 * ONE);
        assertEq(pool.deposited(), 100 * ONE);
        assertEq(pool.admin(), poolAdmin);
        assertEq(pool.seasonId(), "season-1");
    }

    function test_distribute_paysEachWinnerOnce_andLocks() public {
        fund(100 * ONE);
        address[] memory winners = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        winners[0] = first;
        winners[1] = second;
        amounts[0] = 60 * ONE;
        amounts[1] = 30 * ONE;

        vm.expectEmit(false, false, false, true, address(pool));
        emit SeasonPrizePool.Distributed(90 * ONE, 2);
        pool.distribute(winners, amounts);

        assertEq(usd.balanceOf(first), 60 * ONE);
        assertEq(usd.balanceOf(second), 30 * ONE);
        assertEq(pool.balance(), 10 * ONE);
        assertTrue(pool.distributed());

        vm.expectRevert(SeasonPrizePool.AlreadyDistributed.selector);
        pool.distribute(winners, amounts);
    }

    function test_distribute_refusesAStranger_mismatch_empty_andOverspend() public {
        fund(50 * ONE);
        address[] memory winners = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        winners[0] = first;
        amounts[0] = 60 * ONE;

        vm.expectRevert(abi.encodeWithSelector(SeasonPrizePool.NotAdmin.selector, stranger));
        vm.prank(stranger);
        pool.distribute(winners, amounts);

        vm.expectRevert(abi.encodeWithSelector(SeasonPrizePool.InsufficientPool.selector, 60 * ONE, 50 * ONE));
        pool.distribute(winners, amounts);

        uint256[] memory two = new uint256[](2);
        vm.expectRevert(abi.encodeWithSelector(SeasonPrizePool.MismatchedLengths.selector, 1, 2));
        pool.distribute(winners, two);

        address[] memory none = new address[](0);
        uint256[] memory noneAmounts = new uint256[](0);
        vm.expectRevert(SeasonPrizePool.ZeroWinners.selector);
        pool.distribute(none, noneAmounts);

        // Nothing moved on any refusal.
        assertEq(pool.balance(), 50 * ONE);
        assertFalse(pool.distributed());
    }

    function test_withdrawRemainder_isTheHatch_beforeAndAfter() public {
        fund(100 * ONE);
        vm.expectRevert(abi.encodeWithSelector(SeasonPrizePool.NotAdmin.selector, stranger));
        vm.prank(stranger);
        pool.withdrawRemainder(stranger);

        address[] memory winners = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        winners[0] = first;
        amounts[0] = 70 * ONE;
        pool.distribute(winners, amounts);

        uint256 out = pool.withdrawRemainder(funder);
        assertEq(out, 30 * ONE);
        assertEq(usd.balanceOf(funder), 1_000 * ONE - 70 * ONE);
        assertEq(pool.balance(), 0);
    }
}
