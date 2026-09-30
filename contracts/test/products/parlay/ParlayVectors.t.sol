// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ParlayVectors.t.sol — unchanged but for the level type (`IBinaryPool.Level`
// → the lens's `LevelRaw`, field for field, A.2.7). The golden vectors are the same file, copied unchanged (A.6).

import {Test} from "forge-std/Test.sol";
import {LevelRaw} from "../../../src/engine/interfaces/IEngineLens.sol";
import {ParlayMath} from "../../../src/products/parlay/ParlayMath.sol";

/// @notice Every row of `packages/core/src/parlay/pricing.vectors.json`, applied to `ParlayMath`.
///         `packages/core/src/parlay/pricing.test.ts` asserts the same rows against `quoteParlay`,
///         so the browser's quote and the chain's floor can never quietly diverge.
contract ParlayVectorsTest is Test {
    uint256 internal constant ONE = 1e6;
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/parlay/pricing.vectors.json"));
    }

    function test_pricing_vectors() public view {
        uint256 count = vm.parseJsonUint(json, ".count");
        for (uint256 i = 0; i < count; i++) {
            string memory v = string.concat(".vectors[", vm.toString(i), "]");
            string memory name = vm.parseJsonString(json, string.concat(v, ".name"));
            uint16 marginBps = uint16(vm.parseJsonUint(json, string.concat(v, ".marginBps")));
            uint16 correlationBps = uint16(vm.parseJsonUint(json, string.concat(v, ".correlationBps")));
            uint256 maxPayout = vm.parseJsonUint(json, string.concat(v, ".maxPayout"));
            uint256 n = 0;
            while (vm.keyExistsJson(json, string.concat(v, ".legs[", vm.toString(n), "]"))) {
                n++;
            }
            uint256[] memory prices = new uint256[](n);
            uint64[] memory expiries = new uint64[](n);
            for (uint256 k = 0; k < n; k++) {
                string memory leg = string.concat(v, ".legs[", vm.toString(k), "]");
                prices[k] = vm.parseJsonUint(json, string.concat(leg, ".priceRaw"));
                expiries[k] = uint64(vm.parseJsonUint(json, string.concat(leg, ".expirySec")));
            }
            uint256 combined = ParlayMath.combine(prices, expiries, ONE, correlationBps);
            assertEq(combined, vm.parseJsonUint(json, string.concat(v, ".expect.combinedProbRaw")), string.concat(name, ": combined"));
            uint256 floor = ParlayMath.floorStake(maxPayout, combined, ONE, marginBps);
            assertEq(floor, vm.parseJsonUint(json, string.concat(v, ".expect.floorStake")), string.concat(name, ": floor"));
        }
    }

    /// @dev The book walk the pricing seam makes: cost-weighted, rounded up, a NO price is the YES bid inverted.
    function test_vwap_walksLevelsAndInvertsForNo() public pure {
        LevelRaw[] memory asks = new LevelRaw[](2);
        asks[0] = LevelRaw(600_000, 50 * ONE);
        asks[1] = LevelRaw(620_000, 50 * ONE);
        (uint256 price, uint256 filled) = ParlayMath.vwap(asks, false, ONE, 100 * ONE);
        assertEq(price, 610_000);
        assertEq(filled, 100 * ONE);
        (price, filled) = ParlayMath.vwap(asks, false, ONE, 20 * ONE);
        assertEq(price, 600_000);
        assertEq(filled, 20 * ONE);
        (price, filled) = ParlayMath.vwap(asks, false, ONE, 150 * ONE);
        assertEq(price, 610_000, "priced over what rests");
        assertEq(filled, 100 * ONE, "and reports the shortfall");

        LevelRaw[] memory bids = new LevelRaw[](2);
        bids[0] = LevelRaw(580_000, 50 * ONE);
        bids[1] = LevelRaw(550_000, 50 * ONE);
        (price, filled) = ParlayMath.vwap(bids, true, ONE, 100 * ONE);
        assertEq(price, 435_000, "(0.42 + 0.45) over 2");

        // Rounds up: 3 contracts at 1 wei odd rounds up.
        LevelRaw[] memory odd = new LevelRaw[](2);
        odd[0] = LevelRaw(600_000, 1);
        odd[1] = LevelRaw(600_001, 2);
        (price,) = ParlayMath.vwap(odd, false, ONE, 3);
        assertEq(price, 600_001);

        (price, filled) = ParlayMath.vwap(new LevelRaw[](0), false, ONE, ONE);
        assertEq(price, 0);
        assertEq(filled, 0);
    }
}
