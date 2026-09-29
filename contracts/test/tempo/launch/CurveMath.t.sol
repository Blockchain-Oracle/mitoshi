// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {Segment, FeeSchedule} from "../../../src/launch/CurveTypes.sol";
import {CurveMath} from "../../../src/launch/CurveMath.sol";
import {CurveConfigLib} from "../../../src/launch/CurveConfigLib.sol";

/// Exposes the internal library so reverts surface as call reverts.
contract CurveMathHarness {
    function derive(uint160 s, Segment[] memory segs, uint256 t) external pure returns (uint160, uint256, uint256) {
        return CurveMath.derive(s, segs, t);
    }

    function buy(Segment[] memory segs, uint160 e, uint160 p, uint256 seg, uint256 q)
        external
        pure
        returns (uint256, uint256, uint160, uint256)
    {
        return CurveMath.buy(segs, e, p, seg, q);
    }

    function sell(Segment[] memory segs, uint160 s, uint160 p, uint256 seg, uint256 c) external pure returns (uint256, uint160, uint256) {
        return CurveMath.sell(segs, s, p, seg, c);
    }
}

/// Plan B.6 `CurveMath.t.sol`: the shared vectors (TS `curve.ts` ↔ this library, bit for bit), buy→sell never
/// profits, segment crossing, the threshold clip, and the reserve-favouring rounding.
contract CurveMathTest is Test {
    string constant VECTORS = "../packages/core/src/launch/curve.vectors.json";
    CurveMathHarness h;
    string json;

    function setUp() public {
        h = new CurveMathHarness();
        json = vm.readFile(VECTORS);
    }

    function _u(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function _segments(string memory c) internal view returns (Segment[] memory segs) {
        uint256 n = _count(string.concat(c, ".segments"));
        segs = new Segment[](n);
        for (uint256 i; i < n; i++) {
            string memory k = string.concat(c, ".segments[", vm.toString(i), "]");
            segs[i] = Segment(uint160(_u(string.concat(k, ".upper"))), uint128(_u(string.concat(k, ".liquidity"))));
        }
    }

    function _count(string memory arrayKey) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(arrayKey, "[", vm.toString(n), "]"))) n++;
    }

    // ── shared vectors ────────────────────────────────────────────────────────────────────────────────────────────

    function test_vectors_curves() public view {
        uint256 curves = _count(".curves");
        assertEq(curves, 4, "four curves");
        uint256 stepsSeen;
        for (uint256 ci; ci < curves; ci++) {
            string memory c = string.concat(".curves[", vm.toString(ci), "]");
            Segment[] memory segs = _segments(c);
            uint160 start = uint160(_u(string.concat(c, ".sqrtStart")));
            (uint160 end, uint256 supply, uint256 quoteToEnd) = h.derive(start, segs, _u(string.concat(c, ".threshold")));
            assertEq(end, _u(string.concat(c, ".sqrtEnd")), "sqrtEnd");
            assertEq(supply, _u(string.concat(c, ".curveSupply")), "curveSupply");
            assertEq(quoteToEnd, _u(string.concat(c, ".quoteToEnd")), "quoteToEnd");
            uint16 migFee = uint16(vm.parseJsonUint(json, string.concat(c, ".migrationFeeBps")));
            assertEq(CurveConfigLib.migrationCoinFor(quoteToEnd, migFee, end), _u(string.concat(c, ".migrationCoin")), "migrationCoin");

            uint256 steps = _count(string.concat(c, ".steps"));
            for (uint256 si; si < steps; si++) {
                string memory s = string.concat(c, ".steps[", vm.toString(si), "]");
                uint160 before = uint160(_u(string.concat(s, ".sqrtBefore")));
                uint256 segBefore = vm.parseJsonUint(json, string.concat(s, ".segBefore"));
                uint256 amount = _u(string.concat(s, ".amount"));
                bool isBuy = keccak256(bytes(vm.parseJsonString(json, string.concat(s, ".kind")))) == keccak256("buy");
                if (isBuy) {
                    (uint256 out, uint256 used, uint160 after_, uint256 segAfter) = h.buy(segs, end, before, segBefore, amount);
                    assertEq(out, _u(string.concat(s, ".out")), "buy out");
                    assertEq(used, _u(string.concat(s, ".used")), "buy used");
                    assertEq(after_, _u(string.concat(s, ".sqrtAfter")), "buy sqrtAfter");
                    assertEq(segAfter, vm.parseJsonUint(json, string.concat(s, ".segAfter")), "buy segAfter");
                } else {
                    (uint256 out, uint160 after_, uint256 segAfter) = h.sell(segs, start, before, segBefore, amount);
                    assertEq(out, _u(string.concat(s, ".out")), "sell out");
                    assertEq(after_, _u(string.concat(s, ".sqrtAfter")), "sell sqrtAfter");
                    assertEq(segAfter, vm.parseJsonUint(json, string.concat(s, ".segAfter")), "sell segAfter");
                }
                stepsSeen++;
            }
            // The last step of every walk reaches the end price (clipped).
            string memory last = string.concat(c, ".steps[", vm.toString(steps - 1), "]");
            assertEq(_u(string.concat(last, ".sqrtAfter")), end, "walk completes");
        }
        assertGt(stepsSeen, 80);
    }

    function test_vectors_fees() public view {
        uint256 n = _count(".fees");
        for (uint256 i; i < n; i++) {
            string memory k = string.concat(".fees[", vm.toString(i), "]");
            FeeSchedule memory f = FeeSchedule(
                uint16(vm.parseJsonUint(json, string.concat(k, ".base"))),
                uint16(vm.parseJsonUint(json, string.concat(k, ".start"))),
                uint32(vm.parseJsonUint(json, string.concat(k, ".period"))),
                uint16(vm.parseJsonUint(json, string.concat(k, ".reduction"))),
                uint8(vm.parseJsonUint(json, string.concat(k, ".mode")))
            );
            assertEq(CurveMath.feeBps(f, _u(string.concat(k, ".elapsed"))), _u(string.concat(k, ".bps")), k);
        }
        n = _count(".gross");
        for (uint256 i; i < n; i++) {
            string memory k = string.concat(".gross[", vm.toString(i), "]");
            assertEq(CurveMath.grossFor(_u(string.concat(k, ".net")), _u(string.concat(k, ".bps"))), _u(string.concat(k, ".gross")), k);
        }
    }

    // ── properties ────────────────────────────────────────────────────────────────────────────────────────────────

    uint160 constant START = 79228162514264337593543950; // √(1e-6)·2^96
    uint160 constant MID = 158456325028528675187087900; // ×2 in sqrt (price ×4)
    uint160 constant TOP = 396140812571321687967719751; // ×5 in sqrt (price ×25)

    function _two() internal pure returns (Segment[] memory segs) {
        segs = new Segment[](2);
        segs[0] = Segment(MID, 1e15);
        segs[1] = Segment(TOP, 3e14);
    }

    /// The whole two-segment curve's quote, so `derive` ends exactly at TOP.
    function _full() internal pure returns (uint256) {
        return SqrtPriceMath.getAmount1Delta(START, MID, 1e15, true) + SqrtPriceMath.getAmount1Delta(MID, TOP, 3e14, true);
    }

    /// Buying then selling everything bought never returns more pathUSD than was paid, from any starting point.
    function testFuzz_buyThenSell_noProfit(uint256 pre, uint256 quoteIn) public view {
        Segment[] memory segs = _two();
        (uint160 end,, uint256 quoteToEnd) = h.derive(START, segs, _full());
        pre = bound(pre, 0, quoteToEnd - 2);
        (,, uint160 p0, uint256 s0) = h.buy(segs, end, START, 0, pre);
        quoteIn = bound(quoteIn, 1, quoteToEnd);
        (uint256 coin, uint256 used, uint160 p1, uint256 s1) = h.buy(segs, end, p0, s0, quoteIn);
        vm.assume(coin > 0);
        (uint256 back, uint160 p2,) = h.sell(segs, START, p1, s1, coin);
        assertLe(back, used, "no profit");
        assertGe(p2, p0, "selling what was bought never goes below where the buy started");
    }

    /// Splitting a buy never yields more coin than one buy of the total (rounding favours the reserve).
    function testFuzz_splitBuy_neverBeatsOneBuy(uint256 a, uint256 b) public view {
        Segment[] memory segs = _two();
        (uint160 end,, uint256 quoteToEnd) = h.derive(START, segs, _full());
        a = bound(a, 1, quoteToEnd / 2);
        b = bound(b, 1, quoteToEnd / 2);
        (uint256 c1,, uint160 p1, uint256 s1) = h.buy(segs, end, START, 0, a);
        (uint256 c2,,,) = h.buy(segs, end, p1, s1, b);
        (uint256 whole,,,) = h.buy(segs, end, START, 0, a + b);
        assertLe(c1 + c2, whole + 1, "split <= whole (+1 unit of floor slack)");
    }

    /// The reserve after any buy covers the curve integral from the start to the new price.
    function testFuzz_reserveCoversIntegral(uint256 q) public view {
        Segment[] memory segs = _two();
        (uint160 end,, uint256 quoteToEnd) = h.derive(START, segs, _full());
        q = bound(q, 1, quoteToEnd * 2);
        (uint256 coin, uint256 used, uint160 p, uint256 seg) = h.buy(segs, end, START, 0, q);
        uint256 integral = seg == 0
            ? SqrtPriceMath.getAmount1Delta(START, p, 1e15, false)
            : SqrtPriceMath.getAmount1Delta(START, MID, 1e15, false) + SqrtPriceMath.getAmount1Delta(MID, p, 3e14, false);
        assertGe(used, integral, "reserve >= integral");
        uint256 coinIntegral = seg == 0
            ? SqrtPriceMath.getAmount0Delta(START, p, 1e15, true)
            : SqrtPriceMath.getAmount0Delta(START, MID, 1e15, true) + SqrtPriceMath.getAmount0Delta(MID, p, 3e14, true);
        assertLe(coin, coinIntegral, "coin <= integral");
    }

    function test_segmentCrossing_andClip() public view {
        Segment[] memory segs = _two();
        (uint160 end,, uint256 quoteToEnd) = h.derive(START, segs, _full());
        uint256 toMid = SqrtPriceMath.getAmount1Delta(START, MID, 1e15, true);
        (,, uint160 p, uint256 seg) = h.buy(segs, end, START, 0, toMid);
        assertEq(p, MID);
        assertEq(seg, 0, "exactly at the boundary stays in segment 0");
        (,, p, seg) = h.buy(segs, end, p, seg, 1e6);
        assertEq(seg, 1, "the next buy crosses");
        (uint256 coin, uint256 used, uint160 p2,) = h.buy(segs, end, START, 0, quoteToEnd * 10);
        assertEq(p2, end, "clipped at the end");
        assertLe(used, quoteToEnd, "charged only what the curve takes");
        assertGt(coin, 0);
        (uint256 again,,,) = h.buy(segs, end, end, 1, 1e9);
        assertEq(again, 0, "nothing after the end");
    }

    function test_derive_thresholdInsideSegment() public view {
        Segment[] memory segs = _two();
        uint256 toMid = SqrtPriceMath.getAmount1Delta(START, MID, 1e15, true);
        (uint160 end,, uint256 q) = h.derive(START, segs, toMid + 1e9);
        assertGt(end, MID);
        assertLt(end, TOP);
        assertGe(q, toMid + 1e9);
    }

    function test_derive_refusals() public {
        Segment[] memory segs = _two();
        uint256 toMid = SqrtPriceMath.getAmount1Delta(START, MID, 1e15, true);
        vm.expectRevert(CurveMath.TrailingSegments.selector);
        h.derive(START, segs, toMid / 2);
        vm.expectRevert(CurveMath.ThresholdBeyondCurve.selector);
        h.derive(START, segs, 1e30);
        segs[1].sqrtPriceUpperX96 = MID;
        vm.expectRevert(CurveMath.BadSegments.selector);
        h.derive(START, segs, _full());
        vm.expectRevert(CurveMath.BadSegments.selector);
        h.derive(START, new Segment[](0), 1);
        Segment[] memory many = new Segment[](17);
        for (uint256 i; i < 17; i++) many[i] = Segment(uint160(START + (i + 1) * 1e20), 1e12);
        vm.expectRevert(CurveMath.BadSegments.selector);
        h.derive(START, many, 1e30);
    }

    function test_sell_beyondStart_reverts() public {
        Segment[] memory segs = _two();
        (uint160 end,,) = h.derive(START, segs, _full());
        (uint256 coin,, uint160 p, uint256 seg) = h.buy(segs, end, START, 0, 1e9);
        vm.expectRevert(CurveMath.BeyondCurveStart.selector);
        h.sell(segs, START, p, seg, coin * 2);
        (uint256 back, uint160 p2,) = h.sell(segs, START, p, seg, coin);
        assertLe(back, 1e9);
        assertGe(p2, START);
    }

    function test_fee_schedules() public pure {
        FeeSchedule memory lin = FeeSchedule(100, 5_000, 10, 250, 0);
        assertEq(CurveMath.feeBps(lin, 0), 5_000);
        assertEq(CurveMath.feeBps(lin, 19), 4_750);
        assertEq(CurveMath.feeBps(lin, 10_000), 100);
        FeeSchedule memory exp_ = FeeSchedule(50, 4_000, 5, 1_500, 1);
        assertEq(CurveMath.feeBps(exp_, 5), 3_400);
        assertEq(CurveMath.feeBps(exp_, 1e9), 50);
        assertEq(CurveMath.feeOn(10_001, 100), 101, "fee rounds up");
        assertEq(CurveMath.grossFor(99, 100), 100);
    }
}
