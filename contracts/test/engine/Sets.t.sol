// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/sets.rs and
// instructions/user_sets.rs.
/// Complete sets and credit (E-39…E-41): a pair costs exactly `lots·1000·cu`, so mint and merge move `backingLots`
/// with no rounding; `withdrawCredit` pays `msg.sender` only.
contract SetsTest is EngineFixture {
    function test_mintSetPullsThePairCost() public {
        uint256 before = usd.balanceOf(who(1));
        vm.expectEmit(true, true, false, true, address(engine));
        emit Ev.CompleteSet(m, 1, who(1), true, 2_500, 2_500_000, 0, 2_500_000, 0, 2_500);
        assertEq(mint(1, 2_500), 2_500_000);
        assertEq(before - usd.balanceOf(who(1)), 2_500_000);
        assertEq(pos(1).yesFree, 2_500);
        assertEq(pos(1).noFree, 2_500);
        assertEq(backingOf(m), 2_500);
    }

    function test_mintSetCreditFirst() public {
        mint(1, 1_000);
        place(2, order(KIND_BUY_YES, 700, 1_000, ORDER_NORMAL));
        place(1, order(KIND_SELL_YES, 700, 1_000, ORDER_IOC)); // 700,000 credit
        assertEq(pos(1).credit, 700_000);
        vm.prank(who(1));
        uint64 t = engine.mintSet(m, 1_000, true);
        assertEq(t, 300_000, "credit first, then one pull");
        assertEq(pos(1).credit, 0);
        assertConserved();
    }

    function test_mergeCreditsAndWithdraws() public {
        mint(1, 3_000);
        vm.prank(who(1));
        (uint64 cash, uint64 withdrawn) = engine.mergeSet(m, 1_000, false);
        assertEq(cash, 1_000_000);
        assertEq(withdrawn, 0);
        assertEq(pos(1).credit, 1_000_000);
        uint256 before = usd.balanceOf(who(1));
        vm.prank(who(1));
        (cash, withdrawn) = engine.mergeSet(m, 2_000, true);
        assertEq(withdrawn, 3_000_000, "the whole credit leaves");
        assertEq(usd.balanceOf(who(1)) - before, 3_000_000);
        assertEq(backingOf(m), 0);
        assertConserved();
        vm.prank(who(1));
        vm.expectRevert(E.InsufficientOutcome.selector);
        engine.mergeSet(m, 1, false);
        vm.prank(who(1));
        vm.expectRevert(E.InvalidQuantity.selector);
        engine.mergeSet(m, 0, false);
    }

    /// Sets are Trading-only (E-39/E-40): a maker must merge before `lockAt` (C08:163); not before the open either.
    function test_mergeOnlyWhileTrading() public {
        mint(1, 10);
        vm.warp(LOCK);
        vm.startPrank(who(1));
        vm.expectRevert(E.MarketNotTrading.selector);
        engine.mergeSet(m, 10, false);
        vm.expectRevert(E.MarketNotTrading.selector);
        engine.mintSet(m, 10, false);
        vm.stopPrank();
        bytes32 later = list(LOCK + 300, LOCK + 600, true);
        vm.warp(LOCK + 10);
        vm.prank(who(1));
        vm.expectRevert(E.MarketNotTrading.selector);
        engine.mintSet(later, 10, false);
        vm.prank(who(1));
        vm.expectRevert(E.UnknownMarket.selector);
        engine.mintSet(keccak256("nope"), 10, false);
    }

    function test_mintRefusedOutsideNormalMode() public {
        vm.prank(admin);
        engine.setMode(MODE_REDUCE_ONLY);
        vm.prank(who(1));
        vm.expectRevert(E.InvalidMode.selector);
        engine.mintSet(m, 10, false);
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        vm.prank(who(1));
        vm.expectRevert(E.InvalidMode.selector);
        engine.mintSet(m, 10, false);
    }

    function test_withdrawCreditPaysCallerOnly() public {
        mint(1, 1_000);
        vm.prank(who(1));
        engine.mergeSet(m, 400, false);
        uint256 before = usd.balanceOf(who(1));
        uint256 otherBefore = usd.balanceOf(who(2));
        vm.prank(who(1));
        vm.expectEmit(true, true, false, true, address(engine));
        emit Ev.CreditWithdrawn(m, 3, who(1), 150_000);
        engine.withdrawCredit(m, 150_000);
        assertEq(usd.balanceOf(who(1)) - before, 150_000);
        assertEq(usd.balanceOf(who(2)), otherBefore);
        assertEq(pos(1).credit, 250_000);
        vm.prank(who(2));
        vm.expectRevert(E.InsufficientCredit.selector);
        engine.withdrawCredit(m, 1);
        vm.startPrank(who(1));
        vm.expectRevert(E.InsufficientCredit.selector);
        engine.withdrawCredit(m, 250_001);
        vm.expectRevert(E.InsufficientCredit.selector);
        engine.withdrawCredit(m, 0);
        vm.stopPrank();
        assertConserved();
    }

    /// Credit stays withdrawable in every status and mode (E-17/E-18).
    function test_withdrawAfterLockAndInHalted() public {
        mint(1, 1_000);
        vm.prank(who(1));
        engine.mergeSet(m, 1_000, false);
        vm.warp(LOCK + 1);
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        vm.prank(who(1));
        engine.withdrawCredit(m, 1_000_000);
        assertConserved();
    }
}
