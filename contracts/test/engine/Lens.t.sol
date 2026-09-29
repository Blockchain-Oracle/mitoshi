// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {MarketRef, PositionView, OrderView, LevelRaw, TopOfBook} from "../../src/engine/interfaces/IEngineLens.sol";
import {Vm} from "forge-std/Vm.sol";
import {Policies} from "./harness/Policies.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/book_walk/tests.rs (the
// shared vectors) plus the DreamDEX-shaped reads of A.2.7.
/// E-59: walks traverse nodes with the filter (LIVE, not expired, rested ≥ minRestSec), best first, empty levels
/// omitted; every read the seams and the platform layer need (C.2.5) returns the stored truth.
contract LensTest is EngineFixture {
    function test_marketRefMatchesStorage() public {
        MarketRef memory r = lens.marketRef(m);
        assertEq(r.tradingStart, START);
        assertEq(r.lockAt, LOCK);
        assertEq(r.expiry, LOCK);
        assertEq(r.status, STATUS_TRADING);
        assertEq(r.lotBase, 1000);
        assertEq(r.tickBase, 1000);
        assertEq(r.minLots, 1);
        assertEq(r.minRestSec, 20);
        assertEq(r.ticker, 1);
        assertEq(r.seriesId, keccak256(abi.encode(uint16(1), uint32(300), uint8(0))));
        assertEq(r.openE8, 36_500_000_000);
        assertEq(r.closeE8, 0);
        vm.expectRevert(E.UnknownMarket.selector);
        lens.marketRef(keccak256("nope"));
    }

    function test_marketsOfBatch() public {
        bytes32 second = list(LOCK, LOCK + 300, false);
        bytes32[] memory ids = new bytes32[](2);
        (ids[0], ids[1]) = (m, second);
        MarketRef[] memory rs = lens.marketsOf(ids);
        assertEq(rs.length, 2);
        assertEq(rs[0].status, STATUS_TRADING);
        assertEq(rs[1].status, STATUS_LISTED);
        assertEq(rs[1].tradingStart, LOCK);
    }

    function test_statusFollowsClockAndState() public {
        assertEq(lens.status(m), STATUS_TRADING);
        vm.warp(LOCK);
        assertEq(lens.status(m), STATUS_LOCKED);
        assertFalse(lens.isResolved(m));
        recordClose(m, 1e8);
        engine.settle(m);
        assertEq(lens.status(m), STATUS_RESOLVED);
        assertTrue(lens.isResolved(m));
        assertFalse(lens.isVoided(m));
        bytes32 v = list(LOCK + 300, LOCK + 600, false);
        assertEq(lens.status(v), STATUS_LISTED);
        vm.warp(LOCK + 300 + 901);
        engine.voidExpired(v); // a void can land before lockAt
        assertEq(lens.status(v), STATUS_VOIDED);
        assertTrue(lens.isVoided(v));
    }

    function test_payoutNumerators() public {
        uint256[] memory p = lens.payoutNumerators(m);
        assertEq(p.length, 2);
        assertEq(p[0] + p[1], 0, "(0, 0) before terminal");
        vm.warp(LOCK);
        recordClose(m, 1e8);
        engine.settle(m);
        p = lens.payoutNumerators(m);
        assertEq(p[0], 0);
        assertEq(p[1], PAYOUT_DENOMINATOR);
    }

    function test_positionAndCredit() public {
        mint(1, 3_000);
        place(1, order(KIND_SELL_YES, 600, 1_000, ORDER_NORMAL));
        place(2, order(KIND_BUY_YES, 600, 400, ORDER_IOC));
        PositionView memory v = lens.positionOf(m, who(1));
        assertEq(v.yesFree, 2_000);
        assertEq(v.yesLocked, 600);
        assertEq(v.noFree, 3_000);
        assertEq(v.credit, 240_000);
        assertEq(v.openOrders, 1);
        assertEq(lens.creditOf(m, who(1)), 240_000);
        assertEq(lens.positionOf(m, who(2)).yesFree, 400);
    }

    function test_positionsOfBatch() public {
        bytes32 second = list(START, LOCK, true);
        mint(1, 10);
        vm.prank(who(1));
        engine.mintSet(second, 20, false);
        bytes32[] memory ids = new bytes32[](2);
        (ids[0], ids[1]) = (m, second);
        PositionView[] memory vs = lens.positionsOf(who(1), ids);
        assertEq(vs[0].yesFree, 10);
        assertEq(vs[1].noFree, 20);
    }

    function test_orderOfLiveAndStale() public {
        uint128 id = place(1, order(KIND_BUY_NO, 380, 700, ORDER_NORMAL)).restedOrderId;
        OrderView memory o = lens.orderOf(id);
        assertEq(o.orderId, id);
        assertEq(o.marketId, m);
        assertEq(o.owner, who(1));
        assertEq(o.kind, KIND_BUY_NO);
        assertFalse(o.isBid);
        assertEq(o.priceTicks, 380);
        assertEq(o.lots, 700);
        assertEq(o.expireTs, LOCK);
        assertEq(o.placedAt, START);
        place(2, order(KIND_BUY_YES, 380, 700, ORDER_IOC));
        assertEq(lens.orderOf(id).orderId, 0, "filled, now stale");
        assertEq(lens.orderOf(0).orderId, 0);
    }

    function test_openOrdersOfWalksTheHolderList() public {
        uint128 a = place(1, order(KIND_BUY_YES, 300, 10, ORDER_NORMAL)).restedOrderId;
        uint128 b = place(1, order(KIND_BUY_NO, 700, 20, ORDER_NORMAL)).restedOrderId;
        place(2, order(KIND_BUY_YES, 301, 30, ORDER_NORMAL));
        OrderView[] memory os = lens.openOrdersOf(m, who(1));
        assertEq(os.length, 2);
        assertEq(os[0].orderId, b, "newest first");
        assertEq(os[1].orderId, a);
        assertEq(lens.openOrdersOf(m, who(3)).length, 0);
    }

    function test_walkFilter() public {
        // Expired, unrested and live orders at one price; the walk traverses nodes, never trusts liveLots.
        PlaceArgs memory o = order(KIND_BUY_YES, 620, 1_000, ORDER_NORMAL);
        o.expireTs = START + 30;
        place(1, o);
        place(2, order(KIND_BUY_YES, 620, 500, ORDER_NORMAL));
        vm.warp(START + 30);
        place(3, order(KIND_BUY_YES, 620, 300, ORDER_NORMAL));
        place(4, order(KIND_BUY_YES, 610, 50, ORDER_NORMAL));
        (uint16[] memory t, uint64[] memory q) = lens.levels(m, true, 32, 0, 1_000);
        assertEq(t.length, 2);
        assertEq(t[0], 620);
        assertEq(q[0], 800, "the expired 1,000 are skipped");
        assertEq(t[1], 610);
        (t, q) = lens.levels(m, true, 32, 20, 1_000);
        assertEq(t.length, 1, "unrested levels drop out");
        assertEq(q[0], 500);
        (t, q) = lens.levels(m, true, 1, 0, 1_000);
        assertEq(t.length, 1, "n caps the levels");
        (t, q) = lens.levels(m, true, 32, 0, 2);
        assertEq(q[0], 500, "the node budget bounds the walk");
        LevelRaw[] memory raw = lens.levelsRaw(m, true, 32, 0, 1_000);
        assertEq(raw[0].price, 620_000);
        assertEq(raw[0].quantity, 800_000);
    }

    function test_levelsRawMatchesIBinaryPoolLevel() public {
        place(1, order(KIND_BUY_NO, 700, 2_000, ORDER_NORMAL)); // YES ask at 700
        place(2, order(KIND_BUY_NO, 650, 1_000, ORDER_NORMAL));
        LevelRaw[] memory asks = lens.levelsRaw(m, false, 32, 0, 1_000);
        assertEq(asks.length, 2);
        assertEq(asks[0].price, 650_000, "asks ascending, YES terms");
        assertEq(asks[0].quantity, 1_000_000);
        assertEq(asks[1].price, 700_000);
    }

    function test_topOfBookBatch() public {
        place(1, order(KIND_BUY_YES, 480, 100, ORDER_NORMAL));
        place(2, order(KIND_BUY_NO, 520, 200, ORDER_NORMAL));
        bytes32 empty = list(START, LOCK, true);
        bytes32[] memory ids = new bytes32[](2);
        (ids[0], ids[1]) = (m, empty);
        TopOfBook[] memory tops = lens.topOfBook(ids);
        assertEq(tops[0].bidTicks, 480);
        assertEq(tops[0].bidLots, 100);
        assertEq(tops[0].askTicks, 520);
        assertEq(tops[0].askLots, 200);
        assertEq(tops[1].bidTicks, 0);
        assertEq(tops[1].askTicks, 0);
    }

    function test_gridIsDreamDexShaped() public {
        (uint256 tick, uint256 minQ, uint256 lot) = lens.grid(m);
        assertEq(tick, 1_000);
        assertEq(minQ, 1_000, "minLots 1 in the fixture; launch minLots 1,000 gives 1,000,000");
        assertEq(lot, 1_000);
    }

    function test_printsReadBack() public {
        Print memory open = lens.printOf(m, WHICH_OPEN);
        assertEq(open.priceE8, 36_500_000_000);
        assertEq(open.source, SOURCE_REDSTONE);
        assertEq(open.signers, 5);
        assertEq(open.sourceTs, START);
        assertEq(lens.printOf(m, WHICH_CLOSE).source, SOURCE_NONE);
        vm.expectRevert(E.BadPrintSlot.selector);
        lens.printOf(m, 4);
    }

    /// E-61: every market-scoped call takes one seq; across calls there are no gaps.
    function test_eventSeqHasNoGaps() public {
        vm.recordLogs();
        mint(1, 1_000);
        place(1, order(KIND_SELL_YES, 600, 500, ORDER_NORMAL));
        place(2, order(KIND_BUY_YES, 600, 200, ORDER_IOC));
        vm.prank(who(1));
        engine.cancelAll(m, 16, true);
        vm.warp(LOCK);
        recordClose(m, 1e8);
        engine.settle(m);
        vm.prank(who(2));
        engine.redeem(m);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 last = 2; // WindowOpened 1, open print 2
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(engine) || logs[i].topics.length < 2 || logs[i].topics[1] != m) continue;
            uint256 seq = abi.decode(logs[i].data, (uint256));
            assertTrue(seq == last || seq == last + 1, "no gap");
            last = seq;
        }
        assertEq(last, 9); // mint 3, sell 4, buy 5, cancel-all 6, close print 7, settle 8, redeem 9
        assertEq(lens.marketOf(m).eventSeq, 9);
    }

    // ---- shared book-walk vectors (test/fixtures/book.vectors.json, regenerated in seconds) ----

    /// Each vector's live orders are rested for real on two fresh markets (bids on one, asks on another, since many
    /// random books are crossed and a real book never is), then the lens walks must equal Agari's expectations. Split
    /// in seven runs: Tempo prices every new slot at 250k gas.
    function test_bookVectors_0() public { _vectors(0, 7); }
    function test_bookVectors_1() public { _vectors(7, 14); }
    function test_bookVectors_2() public { _vectors(14, 21); }
    function test_bookVectors_3() public { _vectors(21, 28); }
    function test_bookVectors_4() public { _vectors(28, 35); }
    function test_bookVectors_5() public { _vectors(35, 42); }
    function test_bookVectors_6() public { _vectors(42, 49); }

    function _vectors(uint256 from, uint256 to) internal {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/book.vectors.json"));
        bytes32[2] memory sids;
        vm.startPrank(admin);
        for (uint256 side; side < 2; ++side) {
            sids[side] = engine.registerSeries(RegisterSeriesArgs(uint16(500 + side), BASIS_REGULAR, 300, 1000, 1000, 1, 20, 400_000, 32, 16));
            engine.addPolicyVersion(sids[side], 0, Policies.launch(address(rsVerifier), 0, OPEN_ENDED));
        }
        vm.stopPrank();
        for (uint256 c = from; c < to; ++c) _vector(json, c, sids, uint64(c - from));
    }

    function _vector(string memory json, uint256 c, bytes32[2] memory sids, uint64 index) internal {
        string memory k = string.concat(".cases[", vm.toString(c), "].sol");
        uint256 vnow = vm.parseJsonUint(json, string.concat(k, ".now"));
        uint256 n = vm.parseJsonUint(json, string.concat(k, ".n"));
        uint32 minRest = uint32(vm.parseJsonUint(json, string.concat(k, ".minRestSec")));
        // Shift the vector's clock so its now sits 150 s into a fresh 300 s Window [base, base + 300].
        uint40 base = uint40(START + 600 * (index + 1));
        int256 shift = int256(uint256(base) + 150) - int256(vnow);
        for (uint256 side; side < 2; ++side) {
            vm.warp(base);
            vm.prank(roller);
            bytes32 mk = engine.openWindow(OpenWindowArgs(sids[side], index, base, base + 300, base + 300, 0, 2));
            uint256[] memory os = vm.parseJsonUintArray(json, string.concat(k, side == 0 ? ".bids" : ".asks"));
            for (uint256 i; i < os.length; i += 4) {
                uint256 exp = uint256(int256(os[i + 2]) + shift);
                uint256 placed = uint256(int256(os[i + 3]) + shift);
                if (exp <= placed) continue; // expired before it could rest: filtered by every walk anyway
                vm.warp(placed);
                uint8 kind = side == 0 ? KIND_BUY_YES : KIND_BUY_NO; // BUY_NO rests as a YES ask
                vm.prank(who(100 + i / 4));
                engine.placeOrder(PlaceArgs(mk, kind, ORDER_POST_ONLY, 0, uint16(os[i]), uint64(os[i + 1]), uint40(exp), 16, 16, false, false, 0));
            }
            vm.warp(base + 150);
            (uint16[] memory t, uint64[] memory q) = lens.levels(mk, side == 0, n, minRest, 10_000);
            uint256[] memory want = vm.parseJsonUintArray(json, string.concat(k, side == 0 ? ".bidLevels" : ".askLevels"));
            assertEq(t.length * 2, want.length, string.concat("levels count, case ", vm.toString(c)));
            for (uint256 j; j < t.length; ++j) {
                assertEq(t[j], want[2 * j], "price");
                assertEq(q[j], want[2 * j + 1], "lots");
            }
        }
    }
}
