// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeVectors.t.sol — unchanged but for the project-root path (the golden
// vectors are the same file, copied unchanged, A.6).

import {Test} from "forge-std/Test.sol";
import {RangeMath} from "../../../src/products/range/RangeMath.sol";

/// @notice Every row of `packages/core/src/range/pricing.vectors.json`, applied to `RangeMath`.
///         `packages/core/src/range/pricing.test.ts` asserts the same rows against the browser's mirror,
///         and the rows themselves came from a third, independent implementation (context/43 session).
contract RangeVectorsTest is Test {
    uint256 internal constant ONE = 1e6;
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/range/pricing.vectors.json"));
    }

    function test_pricing_vectors() public view {
        uint256 count = vm.parseJsonUint(json, ".count");
        for (uint256 i = 0; i < count; i++) {
            string memory v = string.concat(".vectors[", vm.toString(i), "]");
            string memory name = vm.parseJsonString(json, string.concat(v, ".name"));
            int256 openingPrint = vm.parseJsonInt(json, string.concat(v, ".openingPrint"));
            int256 low = vm.parseJsonInt(json, string.concat(v, ".lowPrint"));
            int256 high = vm.parseJsonInt(json, string.concat(v, ".highPrint"));
            uint256 centerQE6 = vm.parseJsonUint(json, string.concat(v, ".centerQE6"));
            uint64 sigmaE8 = uint64(vm.parseJsonUint(json, string.concat(v, ".sigmaE8")));
            uint256 tauSec = vm.parseJsonUint(json, string.concat(v, ".tauSec"));
            bool inside = keccak256(bytes(vm.parseJsonString(json, string.concat(v, ".side")))) == keccak256("inside");
            uint16 marginBps = uint16(vm.parseJsonUint(json, string.concat(v, ".marginBps")));
            uint256 maxPayout = vm.parseJsonUint(json, string.concat(v, ".maxPayout"));

            uint256 pInside = RangeMath.bandProbE6(openingPrint, low, high, centerQE6, sigmaE8, tauSec);
            assertEq(pInside, vm.parseJsonUint(json, string.concat(v, ".expect.insideProbE6")), string.concat(name, ": inside"));
            uint256 pE6 = inside ? pInside : RangeMath.P_ONE - pInside;
            uint256 probRaw = pE6 * ONE / RangeMath.P_ONE;
            assertEq(probRaw, vm.parseJsonUint(json, string.concat(v, ".expect.probRaw")), string.concat(name, ": prob"));
            assertEq(RangeMath.floorStake(maxPayout, probRaw, ONE, marginBps), vm.parseJsonUint(json, string.concat(v, ".expect.floorStake")), string.concat(name, ": floor"));
        }
    }
}
