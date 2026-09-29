// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MatchTestBase} from "./harness/MatchTestBase.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import "../../src/engine/EngineTypes.sol";

/// E-37 (Agari `public_sweep_expired`, instructions/user_reduce_order.rs:67-93): a permissionless keeper that evicts
/// expired orders, drains every order at/after `lockAt` or once terminal, never fails with nothing to do, and — on EVM —
/// visits at most `MAX_SWEEP_VISITS` nodes per call (F-S2-05). Also the per-holder `cancelAll` (E-36).
contract SweepTest is MatchTestBase {
    function _rest(uint256 n, uint16 price, uint40 expireTs) internal returns (uint128) {
        PlaceArgs memory o = order(KIND_BUY_YES, price, 10, ORDER_NORMAL);
        o.expireTs = expireTs;
        return place(n, o).restedOrderId;
    }

    function sweep(uint8 max) internal returns (uint256 removed) {
        vm.prank(who(99));
        removed = h.sweep(m, max);
        assertInvariants();
    }

    function test_sweepEvictsOnlyExpiredBeforeLock() public {
        _rest(1, 400, START + 10);
        _rest(2, 401, START + 500);
        _rest(3, 402, START + 10);
        vm.warp(START + 10);
        assertEq(sweep(32), 2);
        assertEq(h.market(m).orderCount, 1);
        assertEq(pos(1).credit, 4_000, "escrow back to the owner's credit");
        assertEq(pos(3).credit, 4_020);
        assertEq(pos(2).openOrders, 1);
    }

    function test_nothingToDoSucceeds() public {
        _rest(1, 400, START + 500);
        uint48 seqBefore = h.market(m).eventSeq;
        assertEq(sweep(32), 0);
        assertEq(h.market(m).eventSeq, seqBefore, "no event, no seq taken");
    }

    function test_drainsEverythingAtLock() public {
        for (uint16 i; i < 5; ++i) _rest(1 + i, 300 + i, START + 100_000);
        seedPair(7, 8, 50);
        PlaceArgs memory s = order(KIND_SELL_YES, 900, 50, ORDER_NORMAL);
        s.expireTs = START + 100_000;
        place(7, s);
        vm.warp(START + 100_000);
        assertEq(sweep(3), 3, "max per call");
        assertEq(sweep(32), 3);
        assertEq(h.market(m).orderCount, 0);
        assertEq(pos(7).yesFree, 50, "a sell's lots come back free");
    }

    function test_drainsEverythingOnceTerminal() public {
        _rest(1, 400, START + 500);
        _rest(2, 500, START + 500);
        h.setState(m, STATE_VOIDED, PAYOUT_VOID, PAYOUT_VOID);
        assertEq(sweep(32), 2);
    }

    function test_maxIsValidated() public {
        vm.expectRevert(E.InvalidOrderArgs.selector);
        h.sweep(m, 0);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        h.sweep(m, 33);
        vm.expectRevert(E.UnknownMarket.selector);
        h.sweep(keccak256("nope"), 1);
    }

    /// Live orders in front of expired ones cost visits; the walk stops after 256 without failing.
    function test_visitBudgetBoundsTheWalk() public {
        for (uint256 n = 1; n <= 17; ++n) {
            address a = who(n);
            for (uint16 i; i < 16; ++i) {
                PlaceArgs memory o = order(KIND_BUY_YES, 100 + i, 10, ORDER_NORMAL);
                o.expireTs = START + 90_000;
                vm.prank(a);
                h.place(o); // no per-call invariant scan here: 272 rests
            }
        }
        assertInvariants();
        // 272 live orders; one expired order behind all of them on the bid side (the lowest price).
        _rest(18, 50, START + 10);
        vm.warp(START + 10);
        assertEq(sweep(32), 0, "the expired order is beyond 256 visits");
        vm.warp(START + 100_000);
        uint256 total;
        for (uint256 i; i < 20 && h.market(m).orderCount > 0; ++i) total += sweep(32);
        assertEq(total, 273);
    }

    function test_cancelAllWalksOnlyTheCallersList() public {
        for (uint16 i; i < 5; ++i) _rest(1, 300 + i, START + 500);
        _rest(2, 310, START + 500);
        vm.prank(who(1));
        (uint256 removed, uint64 withdrawn) = h.cancelAll(m, 3, false);
        assertEq(removed, 3);
        assertEq(withdrawn, 0);
        assertEq(pos(1).openOrders, 2);
        vm.prank(who(1));
        (removed, withdrawn) = h.cancelAll(m, 32, true);
        assertEq(removed, 2);
        assertEq(withdrawn, 10 * (300 + 301 + 302 + 303 + 304));
        assertEq(pos(1).credit, 0);
        assertEq(pos(2).openOrders, 1);
        assertInvariants();
    }
}
