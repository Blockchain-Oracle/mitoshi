// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {GuardMath} from "../../../../src/stocks/libs/GuardMath.sol";

contract GuardMathHarness {
    function sqrtFromTokenPrice(uint256 p) external pure returns (uint160) {
        return GuardMath.sqrtFromTokenPrice(p);
    }

    function band(uint256 p, uint256 bps) external pure returns (uint160, uint160) {
        return GuardMath.band(p, bps);
    }
}

/// B.6 `GuardMath.t.sol`: the vectors shared with `packages/core/src/stocks/guard.ts` (TS ↔ Solidity bit for bit), the
/// sqrt roundtrip fuzz, band orientation, multiplier × not ÷, and the CRWD 4-for-1 vectors.
contract GuardMathTest is Test {
    string internal json;
    GuardMathHarness internal h;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/stocks/guard.vectors.json"));
        h = new GuardMathHarness();
    }

    function _u(string memory path) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, path));
    }

    function _at(string memory arr, uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".", arr, "[", vm.toString(i), "].", field);
    }

    function _len(string memory arr) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(".", arr, "[", vm.toString(n), "]"))) n++;
    }

    function test_sharedVectors_tokenPriceSqrtInverse() public view {
        uint256 n = _len("tokenPrice");
        assertEq(n, 10);
        for (uint256 i; i < n; ++i) {
            uint256 share = _u(_at("tokenPrice", i, "share"));
            uint256 mult = _u(_at("tokenPrice", i, "mult"));
            assertEq(GuardMath.tokenPriceE18(share, mult), _u(_at("tokenPrice", i, "price")), "tokenPrice");
            uint256 p = _u(_at("sqrt", i, "price"));
            assertEq(GuardMath.sqrtFromTokenPrice(p), _u(_at("sqrt", i, "sqrt")), "sqrt");
            // forge-lint: disable-next-line(unsafe-typecast)
            uint160 s = uint160(_u(_at("fromSqrt", i, "sqrt")));
            assertEq(GuardMath.tokenPriceFromSqrt(s), _u(_at("fromSqrt", i, "price")), "fromSqrt");
        }
    }

    function test_sharedVectors_bands() public view {
        uint256 n = _len("band");
        assertEq(n, 40);
        for (uint256 i; i < n; ++i) {
            (uint160 lo, uint160 hi) = GuardMath.band(_u(_at("band", i, "price")), vm.parseJsonUint(json, _at("band", i, "bps")));
            assertEq(lo, _u(_at("band", i, "lo")));
            assertEq(hi, _u(_at("band", i, "hi")));
        }
    }

    function test_sharedVectors_allowed() public view {
        uint256 n = _len("allowed");
        assertEq(n, 15);
        for (uint256 i; i < n; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            bool got = GuardMath.allowed(
                uint160(_u(_at("allowed", i, "pre"))),
                uint160(_u(_at("allowed", i, "post"))),
                uint160(_u(_at("allowed", i, "lo"))),
                uint160(_u(_at("allowed", i, "hi")))
            );
            assertEq(got, vm.parseJsonBool(json, _at("allowed", i, "ok")), vm.parseJsonString(json, _at("allowed", i, "name")));
        }
    }

    /// CRWD after its 4-for-1 split: one token is four shares, so the token (and pool) price is 4 × the share price.
    function test_multiplierMultipliesNeverDivides_crwd() public pure {
        uint256 share = 120.5125e18;
        uint256 p = GuardMath.tokenPriceE18(share, 4e18);
        assertEq(p, 482.05e18);
        assertEq(p, GuardMath.tokenPriceE18(482.05e18, 1e18), "equals the pre-split share price");
        assertTrue(p != GuardMath.tokenPriceE18(share, 0.25e18));
        // In pool terms: 4× the token price → the v4 price is a quarter → sqrt halves (±1 unit of flooring).
        uint256 s1 = GuardMath.sqrtFromTokenPrice(share);
        uint256 s4 = GuardMath.sqrtFromTokenPrice(p);
        assertApproxEqAbs(s4 * 2, s1, 2);
    }

    function testFuzz_sqrtRoundtrip(uint256 p) public pure {
        p = bound(p, 1e9, 1e30); // $1e-9 … $1e12 per token
        uint160 s = GuardMath.sqrtFromTokenPrice(p);
        uint256 back = GuardMath.tokenPriceFromSqrt(s);
        assertGe(back, p, "floor(sqrt) implies a price at or above P");
        assertLe(back - p, p / 1e9 + 1, "within rounding");
        // the tick TickMath derives brackets the same sqrt price
        int24 tick = TickMath.getTickAtSqrtPrice(s);
        assertLe(TickMath.getSqrtPriceAtTick(tick), s);
        assertGt(TickMath.getSqrtPriceAtTick(tick + 1), s);
    }

    function testFuzz_bandOrientation(uint256 p, uint256 bps) public pure {
        p = bound(p, 1e12, 1e27);
        bps = bound(bps, 1, 2000);
        (uint160 lo, uint160 hi) = GuardMath.band(p, bps);
        uint160 mid = GuardMath.sqrtFromTokenPrice(p);
        assertLe(lo, mid);
        assertGe(hi, mid);
        assertLt(lo, hi);
        // lo is where the token is dearest: P·(1+b)
        assertApproxEqRel(GuardMath.tokenPriceFromSqrt(lo), p * (10_000 + bps) / 10_000, 1e9);
        assertApproxEqRel(GuardMath.tokenPriceFromSqrt(hi), p * (10_000 - bps) / 10_000, 1e9);
    }

    function testFuzz_allowedNeverOvershoots(uint160 pre, uint160 post, uint160 lo, uint160 width) public pure {
        width = uint160(bound(width, 1, type(uint96).max));
        lo = uint160(bound(lo, 1, type(uint160).max - width));
        uint160 hi = lo + width;
        if (!GuardMath.allowed(pre, post, lo, hi)) return;
        if (pre < lo) assertTrue(post > pre && post <= hi);
        else if (pre > hi) assertTrue(post < pre && post >= lo);
        else assertTrue(post >= lo && post <= hi);
    }

    function test_refusesZeroPriceAndBadBands() public {
        vm.expectRevert(GuardMath.ZeroPrice.selector);
        h.sqrtFromTokenPrice(0);
        vm.expectRevert(abi.encodeWithSelector(GuardMath.BadBand.selector, 0));
        h.band(1e18, 0);
        vm.expectRevert(abi.encodeWithSelector(GuardMath.BadBand.selector, 10_000));
        h.band(1e18, 10_000);
        // ~$1e59 per token is below v4's MIN_SQRT_PRICE
        vm.expectRevert(abi.encodeWithSelector(GuardMath.SqrtPriceOutOfRange.selector, 0));
        h.sqrtFromTokenPrice(type(uint256).max);
    }
}
