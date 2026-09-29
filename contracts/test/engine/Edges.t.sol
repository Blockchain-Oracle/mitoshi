// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MatchTestBase} from "./harness/MatchTestBase.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/edges.rs.
/// Order types and the edges of the match loop (E-27…E-36). Every refusal leaves the venue exactly as it was (an EVM
/// revert) and every success keeps the §8.3 invariants (checked after each call by the base).
contract EdgesTest is MatchTestBase {
    function test_iocNoFillRefusesEvenAfterEvicting() public {
        PlaceArgs memory o = order(KIND_BUY_NO, 500, 100, ORDER_NORMAL);
        o.expireTs = START + 5;
        place(1, o);
        vm.warp(START + 5);
        uint32 before = h.market(m).orderCount;
        placeRevert(2, order(KIND_BUY_YES, 600, 100, ORDER_IOC), E.ImmediateOrCancelNoFill.selector);
        assertEq(h.market(m).orderCount, before, "the eviction is undone with the refusal");
    }

    function test_fokPartialRefusedFullAccepted() public {
        place(1, order(KIND_BUY_NO, 500, 100, ORDER_NORMAL));
        placeRevert(2, order(KIND_BUY_YES, 500, 150, ORDER_FOK), E.FillOrKillNotFillable.selector);
        PlaceResult memory r = place(2, order(KIND_BUY_YES, 500, 100, ORDER_FOK));
        assertEq(r.filledLots, 100);
        assertEq(r.restedLots, 0);
    }

    function test_postOnlyRefusesAnyLiveCross() public {
        place(1, order(KIND_BUY_NO, 500, 100, ORDER_NORMAL));
        placeRevert(2, order(KIND_BUY_YES, 500, 100, ORDER_POST_ONLY), E.PostOnlyWouldCross.selector);
        placeRevert(1, order(KIND_BUY_YES, 510, 100, ORDER_POST_ONLY), E.PostOnlyWouldCross.selector);
        PlaceResult memory r = place(2, order(KIND_BUY_YES, 499, 100, ORDER_POST_ONLY));
        assertEq(r.stopReason, STOP_POST_ONLY_RESTED);
    }

    function test_selfMatch() public {
        place(1, order(KIND_BUY_NO, 550, 1_000, ORDER_NORMAL));
        place(2, order(KIND_BUY_NO, 560, 1_000, ORDER_NORMAL));
        placeRevert(1, order(KIND_BUY_YES, 600, 2_000, ORDER_IOC), E.SelfMatchCancelTaker.selector);
        PlaceArgs memory o = order(KIND_BUY_YES, 600, 2_000, ORDER_IOC);
        o.selfMatch = SELF_CANCEL_MAKER;
        PlaceResult memory r = place(1, o);
        assertEq(r.selfCancels, 1);
        assertEq(r.fills, 1);
        assertEq(r.filledLots, 1_000);
        assertEq(r.cashSpent, 560_000);
        assertEq(pos(1).credit, 1_000 * 450, "the cancelled ask's escrow came back");
    }

    function test_selfCancelSpendsFillBudget() public {
        place(1, order(KIND_BUY_NO, 550, 1_000, ORDER_NORMAL));
        place(2, order(KIND_BUY_NO, 560, 1_000, ORDER_NORMAL));
        PlaceArgs memory o = order(KIND_BUY_YES, 600, 2_000, ORDER_NORMAL);
        o.selfMatch = SELF_CANCEL_MAKER;
        o.maxFills = 1;
        PlaceResult memory r = place(1, o);
        assertEq(r.selfCancels, 1);
        assertEq(r.fills, 0);
        assertEq(r.stopReason, STOP_FILL_CAP);
        assertEq(r.restedLots, 0);
        assertEq(r.cancelledLots, 2_000);
    }

    function test_skipCapStopsAndCancels() public {
        for (uint256 owner = 10; owner < 14; ++owner) {
            for (uint256 i; i < 16; ++i) {
                PlaceArgs memory q = order(KIND_BUY_NO, 500, 1, ORDER_NORMAL);
                q.expireTs = START + 5;
                place(owner, q);
            }
        }
        place(20, order(KIND_BUY_NO, 500, 100, ORDER_NORMAL));
        vm.warp(START + 5);
        PlaceArgs memory o = order(KIND_BUY_YES, 600, 100, ORDER_NORMAL);
        o.maxEvictions = 0;
        PlaceResult memory r = place(2, o);
        assertEq(r.stopReason, STOP_SKIP_CAP);
        assertEq(r.filledLots, 0);
        assertEq(r.restedLots, 0);
        assertEq(r.cancelledLots, 100);
        PlaceArgs memory p = order(KIND_BUY_YES, 400, 100, ORDER_POST_ONLY);
        p.maxEvictions = 0;
        assertEq(place(2, p).restedLots, 100, "a non-crossing PostOnly still rests");
        PlaceArgs memory x = order(KIND_BUY_YES, 600, 100, ORDER_POST_ONLY);
        x.maxEvictions = 0;
        placeRevert(3, x, E.PostOnlyWouldCross.selector);
    }

    function test_openOrderLimit() public {
        for (uint16 i; i < 16; ++i) place(1, order(KIND_BUY_YES, 100 + i, 1, ORDER_NORMAL));
        placeRevert(1, order(KIND_BUY_YES, 200, 1, ORDER_NORMAL), E.TooManyOpenOrders.selector);
        placeRevert(1, order(KIND_BUY_YES, 200, 1, ORDER_POST_ONLY), E.TooManyOpenOrders.selector);
        assertEq(pos(1).openOrders, 16);
        // Another holder is unaffected; the cap is per (market, holder).
        place(2, order(KIND_BUY_YES, 200, 1, ORDER_NORMAL));
    }

    function test_staleHandlesSkippedAfterReuse() public {
        PlaceResult memory r = place(1, order(KIND_BUY_NO, 500, 100, ORDER_NORMAL));
        uint128 old = r.restedOrderId;
        place(2, order(KIND_BUY_YES, 500, 100, ORDER_IOC));
        PlaceResult memory again = place(1, order(KIND_BUY_NO, 500, 100, ORDER_NORMAL));
        assertEq(uint32(again.restedOrderId), uint32(old), "the freed node is reused");
        assertTrue(again.restedOrderId != old, "with a new sequence");
        uint128[] memory ids = new uint128[](1);
        ids[0] = old;
        vm.prank(who(1));
        (uint256 removed,) = h.cancel(m, ids, false);
        assertEq(removed, 0);
        ids[0] = again.restedOrderId;
        vm.prank(who(2));
        vm.expectRevert(E.NotOrderOwner.selector);
        h.cancel(m, ids, false);
        assertInvariants();
    }

    function test_reduceKeepsQueuePriority() public {
        seedPair(1, 9, 1_000);
        seedPair(2, 9, 1_000);
        PlaceResult memory a = place(1, order(KIND_SELL_YES, 500, 1_000, ORDER_NORMAL));
        place(2, order(KIND_SELL_YES, 500, 1_000, ORDER_NORMAL));
        vm.startPrank(who(1));
        vm.expectRevert(E.ReduceNotSmaller.selector);
        h.reduce(m, a.restedOrderId, 1_000);
        h.reduce(m, a.restedOrderId, 500);
        vm.stopPrank();
        assertInvariants();
        place(3, order(KIND_BUY_YES, 500, 700, ORDER_IOC));
        assertEq(pos(1).yesLocked, 0);
        assertEq(pos(1).credit, 250_000, "A's reduced order still filled first");
        assertEq(pos(2).yesLocked, 800);
        assertEq(pos(2).credit, 100_000);
    }

    function test_reduceRefusals() public {
        h.setMinLots(10);
        PlaceResult memory a = place(1, order(KIND_BUY_YES, 500, 100, ORDER_NORMAL));
        vm.prank(who(2));
        vm.expectRevert(E.NotOrderOwner.selector);
        h.reduce(m, a.restedOrderId, 50);
        vm.startPrank(who(1));
        vm.expectRevert(E.BelowMinLots.selector);
        h.reduce(m, a.restedOrderId, 9);
        vm.expectRevert(E.UnknownOrder.selector);
        h.reduce(m, a.restedOrderId + (uint128(1) << 32), 50);
        h.reduce(m, a.restedOrderId, 10);
        vm.stopPrank();
        assertEq(pos(1).lockedCash, 10 * 500);
        assertEq(pos(1).credit, 90 * 500);
        assertInvariants();
    }

    /// D-088: a Listed Window rests PostOnly quotes and refuses every taker until Trading.
    function test_listedWindowRestsPostOnlyRefusesTakers() public {
        vm.warp(START - 3_600);
        PlaceResult memory rested = place(1, order(KIND_BUY_YES, 400, 100, ORDER_POST_ONLY));
        assertEq(rested.stopReason, STOP_POST_ONLY_RESTED);
        uint8[3] memory takers = [ORDER_NORMAL, ORDER_FOK, ORDER_IOC];
        for (uint256 i; i < 3; ++i) {
            placeRevert(2, order(KIND_BUY_NO, 700, 100, takers[i]), E.PreOpenTakerRefused.selector);
        }
        vm.warp(START + 10);
        PlaceResult memory filled = place(2, order(KIND_BUY_NO, 400, 100, ORDER_IOC));
        assertEq(filled.filledLots, 100);
        assertEq(filled.restedLots, 0);
        vm.warp(START + 100_000);
        placeRevert(1, order(KIND_BUY_YES, 400, 10, ORDER_POST_ONLY), E.MarketNotTrading.selector);
    }

    /// E-27: the refusals come in Agari's order (each case also violates every later rule).
    function test_checkOrderRefusesInOrder() public {
        PlaceArgs memory bad = order(KIND_BUY_YES, 0, 0, ORDER_NORMAL);
        bad.expireTs = 0;
        bad.maxFills = 0;
        h.setMode(MODE_HALTED);
        placeRevert(1, bad, E.InvalidMode.selector);
        h.setMode(MODE_REDUCE_ONLY);
        placeRevert(1, bad, E.InvalidMode.selector);
        h.setMode(MODE_NORMAL);
        bad.marketId = keccak256("nope");
        placeRevert(1, bad, E.UnknownMarket.selector);
        bad.marketId = m;
        bad.kind = 4;
        placeRevert(1, bad, E.InvalidOrderArgs.selector);
        bad.kind = KIND_BUY_YES;
        vm.warp(START + 100_000);
        placeRevert(1, bad, E.MarketNotTrading.selector);
        vm.warp(START);
        placeRevert(1, bad, E.InvalidOrderArgs.selector); // maxFills 0
        bad.maxFills = 33;
        placeRevert(1, bad, E.InvalidOrderArgs.selector);
        bad.maxFills = 16;
        bad.maxEvictions = 17;
        placeRevert(1, bad, E.InvalidOrderArgs.selector);
        bad.maxEvictions = 16;
        bad.selfMatch = 2;
        placeRevert(1, bad, E.InvalidOrderArgs.selector);
        bad.selfMatch = 0;
        placeRevert(1, bad, E.InvalidPrice.selector);
        bad.priceTicks = 1_000;
        placeRevert(1, bad, E.InvalidPrice.selector);
        bad.priceTicks = 500;
        placeRevert(1, bad, E.InvalidQuantity.selector);
        h.setMinLots(1_000);
        bad.lots = 999;
        placeRevert(1, bad, E.BelowMinLots.selector);
        bad.lots = 1_000;
        placeRevert(1, bad, E.OrderAlreadyExpired.selector);
        bad.expireTs = START;
        placeRevert(1, bad, E.OrderAlreadyExpired.selector);
        bad.expireTs = START + 100_001;
        placeRevert(1, bad, E.ExpiryAfterLock.selector);
        bad.expireTs = START + 100_000;
        assertEq(place(1, bad).restedLots, 1_000, "expiry exactly at lockAt rests");
    }

    /// ReduceOnly admits sells (Agari `check_mode`).
    function test_reduceOnlyAdmitsSells() public {
        seedPair(1, 9, 100);
        h.setMode(MODE_REDUCE_ONLY);
        placeRevert(2, order(KIND_BUY_NO, 400, 100, ORDER_NORMAL), E.InvalidMode.selector);
        assertEq(place(1, order(KIND_SELL_YES, 600, 100, ORDER_NORMAL)).restedLots, 100);
    }

    /// E-05: the per-call caps are bounded by the Series caps.
    function test_capsValidated() public {
        h.setCaps(8, 4);
        PlaceArgs memory o = order(KIND_BUY_YES, 500, 10, ORDER_NORMAL);
        o.maxFills = 9;
        placeRevert(1, o, E.InvalidOrderArgs.selector);
        o.maxFills = 8;
        o.maxEvictions = 5;
        placeRevert(1, o, E.InvalidOrderArgs.selector);
        o.maxEvictions = 4;
        place(1, o);
    }

    /// Semantic 4: selling beyond inventory is refused (no shorts).
    function test_sellNeedsFreeBalance() public {
        seedPair(1, 9, 100);
        placeRevert(1, order(KIND_SELL_YES, 500, 101, ORDER_NORMAL), E.InsufficientOutcome.selector);
        placeRevert(1, order(KIND_SELL_NO, 500, 1, ORDER_NORMAL), E.InsufficientOutcome.selector);
        place(1, order(KIND_SELL_YES, 500, 60, ORDER_NORMAL));
        placeRevert(1, order(KIND_SELL_YES, 500, 41, ORDER_NORMAL), E.InsufficientOutcome.selector);
    }

    /// Semantic 2 (✘ by design): an IOC buy pulls exactly what it spent at the maker prices; nothing lands as credit.
    function test_iocPullsExactCostNoLazyCredit() public {
        place(1, order(KIND_BUY_NO, 600, 100, ORDER_NORMAL)); // YES ask at 600
        PlaceResult memory r = place(2, order(KIND_BUY_YES, 700, 150, ORDER_IOC));
        assertEq(r.filledLots, 100);
        assertEq(r.cashSpent, 60_000);
        assertEq(r.transferredIn, 60_000);
        assertEq(r.refunded, 150 * 700 - 60_000);
        assertEq(r.cancelledLots, 50);
        assertEq(pos(2).credit, 0);
    }

    /// T08: order expiry clamps to `lockAt`, not to settlement `expiry`.
    function test_expiryAfterLockRefused() public {
        PlaceArgs memory o = order(KIND_BUY_YES, 500, 10, ORDER_NORMAL);
        o.expireTs = START + 100_001;
        placeRevert(1, o, E.ExpiryAfterLock.selector);
    }

    /// `withdrawProceeds` sweeps the whole post-trade credit out (E-33).
    function test_withdrawProceedsSweepsCredit() public {
        seedPair(1, 9, 100);
        h.seedCredit(m, who(1), 7);
        place(2, order(KIND_BUY_YES, 400, 100, ORDER_NORMAL));
        PlaceArgs memory o = order(KIND_SELL_YES, 400, 100, ORDER_IOC);
        o.withdrawProceeds = true;
        PlaceResult memory r = place(1, o);
        assertEq(r.cashReceived, 40_000);
        assertEq(r.withdrawn, 40_007);
        assertEq(pos(1).credit, 0);
    }
}
