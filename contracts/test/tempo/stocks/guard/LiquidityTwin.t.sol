// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";

/// The TS ports in `packages/core/src/stocks/liquidity.ts` (TickMath, SqrtPriceMath deltas, LiquidityAmounts — the
/// house plan's maths, B.3.4) agree bit for bit with the Solidity libraries on `liquidity.vectors.json`.
contract LiquidityTwinTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/stocks/liquidity.vectors.json"));
    }

    function _p(string memory arr, uint256 i, string memory f) internal pure returns (string memory) {
        return string.concat(".", arr, "[", vm.toString(i), "].", f);
    }

    function _u(string memory path) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, path));
    }

    function _i(string memory path) internal view returns (int24) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return int24(vm.parseJsonInt(json, path));
    }

    function _len(string memory arr) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(".", arr, "[", vm.toString(n), "]"))) n++;
    }

    function test_tickMathTwin() public view {
        uint256 n = _len("tick");
        assertEq(n, 14);
        for (uint256 i; i < n; ++i) assertEq(TickMath.getSqrtPriceAtTick(_i(_p("tick", i, "tick"))), _u(_p("tick", i, "sqrt")));
        n = _len("atSqrt");
        for (uint256 i; i < n; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            assertEq(TickMath.getTickAtSqrtPrice(uint160(_u(_p("atSqrt", i, "sqrt")))), _i(_p("atSqrt", i, "tick")));
        }
    }

    function test_liquidityAmountsTwin() public view {
        uint256 n = _len("liquidity");
        assertGt(n, 40);
        for (uint256 i; i < n; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint160 s = uint160(_u(_p("liquidity", i, "sqrt")));
            uint160 sa = TickMath.getSqrtPriceAtTick(_i(_p("liquidity", i, "tickLower")));
            uint160 sb = TickMath.getSqrtPriceAtTick(_i(_p("liquidity", i, "tickUpper")));
            uint128 l = LiquidityAmounts.getLiquidityForAmounts(s, sa, sb, _u(_p("liquidity", i, "amount0")), _u(_p("liquidity", i, "amount1")));
            assertEq(l, _u(_p("liquidity", i, "liquidity")), vm.parseJsonString(json, _p("liquidity", i, "label")));
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128 pl = uint128(_u(_p("liquidity", i, "planLiquidity")));
            assertEq(SqrtPriceMath.getAmount0Delta(sa, sb, pl, true), _u(_p("liquidity", i, "d0up")));
            assertEq(SqrtPriceMath.getAmount0Delta(sa, sb, pl, false), _u(_p("liquidity", i, "d0down")));
            assertEq(SqrtPriceMath.getAmount1Delta(sa, sb, pl, true), _u(_p("liquidity", i, "d1up")));
            assertEq(SqrtPriceMath.getAmount1Delta(sa, sb, pl, false), _u(_p("liquidity", i, "d1down")));
        }
    }
}
