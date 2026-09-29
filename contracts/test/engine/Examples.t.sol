// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MatchTestBase} from "./harness/MatchTestBase.sol";
import "../../src/engine/EngineTypes.sol";
import {IEventsEngineEvents as IEventsEngineEventsShim} from "../../src/engine/interfaces/IEventsEngineEvents.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/examples.rs.
/// events-engine.md §2.2, the worked examples 1–7, reproduced exactly (launch grid, cu = 1). Example 8 (settle and
/// redeem from state 3) runs against the real engine in `Redeem.t.sol`. A = 1, B = 2, C = 3, D = 4; seed counterparty 9.
contract ExamplesTest is MatchTestBase {
    uint256 internal constant A = 1;
    uint256 internal constant B = 2;
    uint256 internal constant C = 3;
    uint256 internal constant D = 4;
    uint256 internal constant SEED = 9;

    function test_example1DirectYes() public {
        seedPair(A, SEED, 5_000);
        place(A, order(KIND_SELL_YES, 540, 5_000, ORDER_NORMAL));
        assertEq(pos(A).yesFree, 0);
        assertEq(pos(A).yesLocked, 5_000);
        PlaceResult memory r = place(B, order(KIND_BUY_YES, 560, 3_000, ORDER_IOC));
        assertEq(r.filledLots, 3_000);
        assertEq(r.cashSpent, 1_620_000);
        assertEq(r.refunded, 60_000);
        assertEq(r.transferredIn, 1_620_000);
        assertEq(r.fills, 1);
        assertEq(r.pathMask, mask(PATH_DIRECT_YES));
        assertEq(pos(B).yesFree, 3_000);
        assertEq(pos(A).yesLocked, 2_000);
        assertEq(pos(A).credit, 1_620_000);
        assertEq(h.market(m).backingLots, 5_000);
    }

    function test_example2DirectNo() public {
        seedPair(SEED, A, 2_000);
        place(A, order(KIND_SELL_NO, 450, 2_000, ORDER_NORMAL));
        PlaceResult memory r = place(C, order(KIND_BUY_NO, 430, 2_000, ORDER_IOC));
        assertEq(r.cashSpent, 1_100_000);
        assertEq(r.refunded, 40_000);
        assertEq(r.pathMask, mask(PATH_DIRECT_NO));
        assertEq(pos(C).noFree, 2_000);
        assertEq(pos(A).noLocked, 0);
        assertEq(pos(A).credit, 1_100_000);
    }

    /// Example 3's state (A rests BUY_YES 10,000 at 620; D takes 4,000 with BUY_NO at 600 → MINT_PAIR).
    function _mintPairState() internal {
        PlaceResult memory rest = place(A, order(KIND_BUY_YES, 620, 10_000, ORDER_NORMAL));
        assertEq(rest.transferredIn, 6_200_000);
        assertEq(rest.restedLots, 10_000);
        assertEq(pos(A).lockedCash, 6_200_000);
        assertEq(h.mvault(), 6_200_000);
        PlaceResult memory r = place(D, order(KIND_BUY_NO, 600, 4_000, ORDER_IOC));
        assertEq(r.cashSpent, 1_520_000);
        assertEq(r.refunded, 80_000);
        assertEq(r.pathMask, mask(PATH_MINT_PAIR));
    }

    function test_example3MintPair() public {
        _mintPairState();
        assertEq(pos(D).noFree, 4_000);
        assertEq(pos(A).lockedCash, 3_720_000);
        assertEq(pos(A).yesFree, 4_000);
        assertEq(h.market(m).backingLots, 4_000);
        assertEq(h.mvault(), 7_720_000);
        assertEq(h.mvault(), pos(A).lockedCash + h.market(m).backingLots * 1_000);
    }

    function test_example4BurnPair() public {
        seedPair(A, D, 4_000);
        place(A, order(KIND_SELL_YES, 700, 4_000, ORDER_NORMAL));
        PlaceResult memory r = place(D, order(KIND_SELL_NO, 720, 4_000, ORDER_IOC));
        assertEq(r.cashReceived, 1_200_000);
        assertEq(r.pathMask, mask(PATH_BURN_PAIR));
        assertEq(pos(D).credit, 1_200_000);
        assertEq(pos(A).credit, 2_800_000);
        assertEq(h.market(m).backingLots, 0);
        assertEq(h.mvault(), 4_000_000);
    }

    function test_example5CreditFirstFunding() public {
        h.seedCredit(m, who(A), 3_720_000);
        PlaceArgs memory o = order(KIND_BUY_NO, 300, 5_000, ORDER_NORMAL);
        o.useCredit = true;
        PlaceResult memory r = place(A, o);
        assertEq(r.restedLots, 5_000);
        assertEq(r.creditUsed, 3_500_000);
        assertEq(r.transferredIn, 0);
        assertEq(pos(A).credit, 220_000);
        assertEq(pos(A).lockedCash, 3_500_000);
    }

    function test_example6FillCapCancelsRemainder() public {
        place(11, order(KIND_BUY_NO, 550, 1_000, ORDER_NORMAL));
        place(12, order(KIND_BUY_NO, 560, 1_000, ORDER_NORMAL));
        place(13, order(KIND_BUY_NO, 580, 5_000, ORDER_NORMAL));
        PlaceArgs memory o = order(KIND_BUY_YES, 600, 10_000, ORDER_NORMAL);
        o.maxFills = 2;
        PlaceResult memory r = place(B, o);
        assertEq(r.fills, 2);
        assertEq(r.filledLots, 2_000);
        assertEq(r.cashSpent, 1_110_000);
        assertEq(r.stopReason, STOP_FILL_CAP);
        assertEq(r.cancelledLots, 8_000);
        assertEq(r.restedLots, 0);
        assertEq(r.refunded, 4_890_000);
        assertEq(h.market(m).orderCount, 1, "Z still rests; nothing rested crossed");
        assertEq(pos(B).openOrders, 0);
    }

    function test_example7PostOnlyOverOwnExpiredQuote() public {
        PlaceArgs memory quote = order(KIND_BUY_NO, 610, 2_000, ORDER_NORMAL);
        quote.expireTs = START + 10;
        place(A, quote);
        vm.warp(START + 10);
        PlaceResult memory r = place(A, order(KIND_BUY_YES, 612, 2_000, ORDER_POST_ONLY));
        assertEq(r.evictions, 1);
        assertEq(r.restedLots, 2_000);
        assertEq(r.stopReason, STOP_POST_ONLY_RESTED);
        assertEq(r.filledLots, 0);
        assertEq(pos(A).credit, 2_000 * 390);
    }

    /// E-60 / semantic 1: a contract caller gets the full `PlaceResult` back from the call (and the event carries it).
    function test_contractTakerGetsItsResult() public {
        seedPair(A, SEED, 5_000);
        place(A, order(KIND_SELL_YES, 540, 5_000, ORDER_NORMAL));
        vm.expectEmit(true, true, false, false, address(h));
        emit IEventsEngineEventsShim.OrderExecuted(
            m, 0, who(B), 0, 0, 0, 0, 0, 0, 0, PlaceResult(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), 0
        );
        PlaceResult memory r = place(B, order(KIND_BUY_YES, 560, 3_000, ORDER_IOC));
        assertEq(r.filledLots, 3_000);
        assertEq(r.transferredIn, 1_620_000);
    }
}
