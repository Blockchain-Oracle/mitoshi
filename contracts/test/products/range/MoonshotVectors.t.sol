// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/MoonshotVectors.t.sol — unchanged but for the project-root path (the golden
// vectors are the same file, copied unchanged, A.6).

import {Test} from "forge-std/Test.sol";
import {RangeMath} from "../../../src/products/range/RangeMath.sol";

/// @notice Every row of `packages/core/src/range/moonshot.vectors.json`, applied to `RangeMath`: a Moonshot is a
///         band whose far edge saturates on the live `RangeReserve`, so the contract prices it with the arithmetic
///         it already has. The rows came from an independent Python mirror (`moonshot.vectors.py`), and
///         `moonshot.test.ts` asserts the same rows — and the strike solve itself — against the browser's mirror.
contract MoonshotVectorsTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/range/moonshot.vectors.json"));
    }

    function test_moonshot_vectors() public view {
        uint256 count = vm.parseJsonUint(json, ".count");
        for (uint256 i = 0; i < count; i++) {
            string memory v = string.concat(".vectors[", vm.toString(i), "]");
            string memory name = vm.parseJsonString(json, string.concat(v, ".name"));
            int256 openingPrint = vm.parseJsonInt(json, string.concat(v, ".openingPrint"));
            uint256 centerQE6 = vm.parseJsonUint(json, string.concat(v, ".centerQE6"));
            uint64 sigmaE8 = uint64(vm.parseJsonUint(json, string.concat(v, ".sigmaE8")));
            uint256 tauSec = vm.parseJsonUint(json, string.concat(v, ".tauSec"));
            uint16 marginBps = uint16(vm.parseJsonUint(json, string.concat(v, ".marginBps")));
            uint256 one = vm.parseJsonUint(json, string.concat(v, ".one"));
            uint256 maxPayout = vm.parseJsonUint(json, string.concat(v, ".maxPayout"));
            uint256 multiple = vm.parseJsonUint(json, string.concat(v, ".multiple"));
            int256 low = vm.parseJsonInt(json, string.concat(v, ".expect.lowPrint"));
            int256 high = vm.parseJsonInt(json, string.concat(v, ".expect.highPrint"));

            // The band passes `_price`'s guard and is the saturated shape the app recognises a Moonshot by.
            assertGt(low, 0, string.concat(name, ": low > 0"));
            assertGt(high, low, string.concat(name, ": high > low"));
            bool isLong = keccak256(bytes(vm.parseJsonString(json, string.concat(v, ".direction")))) == keccak256("long");
            if (isLong) assertEq(high, openingPrint * 4, string.concat(name, ": far edge"));
            else assertEq(low, 1, string.concat(name, ": floor edge"));

            uint256 pInside = RangeMath.bandProbE6(openingPrint, low, high, centerQE6, sigmaE8, tauSec);
            assertEq(pInside, vm.parseJsonUint(json, string.concat(v, ".expect.insideProbE6")), string.concat(name, ": inside"));
            uint256 probRaw = pInside * one / RangeMath.P_ONE;
            assertEq(probRaw, vm.parseJsonUint(json, string.concat(v, ".expect.probRaw")), string.concat(name, ": prob"));
            uint256 stake = RangeMath.floorStake(maxPayout, probRaw, one, marginBps);
            assertEq(stake, vm.parseJsonUint(json, string.concat(v, ".expect.floorStake")), string.concat(name, ": floor"));
            // The contract's own multiple is never below the rung the player chose.
            assertLe(stake * multiple, maxPayout, string.concat(name, ": multiple >= rung"));
            assertEq(maxPayout * 1000 / stake, vm.parseJsonUint(json, string.concat(v, ".expect.multiplierMilli")), string.concat(name, ": milli"));
        }
    }

    /// @dev The far edges saturate on every horizon the reserve accepts: a LONG band's upper cdf is `P_ONE` and a
    ///      SHORT band's lower cdf is 0, so each is one-sided exactly as the solve assumes.
    function test_edges_saturateAcrossTheHorizon() public pure {
        int256[2] memory opens = [int256(7_673_523), int256(243_512)];
        uint64[2] memory sigmas = [uint64(6_200), uint64(7_800)];
        uint256[4] memory taus = [uint256(60), 300, 3_600, 2 days];
        uint256[2] memory centres = [uint256(30_000), 970_000];
        for (uint256 a = 0; a < 2; a++) {
            for (uint256 t = 0; t < 4; t++) {
                for (uint256 c = 0; c < 2; c++) {
                    uint256 std = RangeMath.stdE8(sigmas[a], taus[t]);
                    int256 mu = RangeMath.probitE4(centres[c]);
                    assertEq(RangeMath.cdfE6(RangeMath.zOf(opens[a] * 4, opens[a], std) - mu), RangeMath.P_ONE, "far edge saturates");
                    assertEq(RangeMath.cdfE6(RangeMath.zOf(1, opens[a], std) - mu), 0, "floor edge saturates");
                }
            }
        }
    }
}
