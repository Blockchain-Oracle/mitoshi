// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/LeverageVectors.t.sol — unchanged but for the level type (`IBinaryPool.Level`
// → the lens's `LevelRaw`, A.2.7) and the project-root path; the golden vectors are the same file (A.6).

import {Test} from "forge-std/Test.sol";
import {LevelRaw} from "../../../src/engine/interfaces/IEngineLens.sol";
import {LeverageMath} from "../../../src/products/leverage/LeverageMath.sol";

/// @notice Every row of `packages/core/src/leverage/sizing.vectors.json`, applied to `LeverageMath`.
///         `packages/core/src/leverage/sizing.test.ts` asserts the same rows against the mirror, so the
///         browser's stake-first estimate and the chain's terms can never quietly diverge.
contract LeverageVectorsTest is Test {
    uint256 internal constant ONE = 1e6;
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/core/src/leverage/sizing.vectors.json"));
    }

    function _u(string memory path) internal view returns (uint256) {
        return vm.parseJsonUint(json, path);
    }

    function test_sizing_vectors() public view {
        uint256 count = _u(".count");
        for (uint256 i = 0; i < count; i++) {
            string memory v = string.concat(".vectors[", vm.toString(i), "]");
            string memory name = vm.parseJsonString(json, string.concat(v, ".name"));
            uint32 leverageBps = uint32(_u(string.concat(v, ".leverageBps")));
            uint16 premiumBps = uint16(_u(string.concat(v, ".premiumBps")));
            bool invert = vm.parseJsonBool(json, string.concat(v, ".invert"));
            uint256 n = 0;
            while (vm.keyExistsJson(json, string.concat(v, ".levels[", vm.toString(n), "]"))) {
                n++;
            }
            LevelRaw[] memory levels = new LevelRaw[](n);
            for (uint256 k = 0; k < n; k++) {
                string memory level = string.concat(v, ".levels[", vm.toString(k), "]");
                levels[k] = LevelRaw(_u(string.concat(level, ".price")), _u(string.concat(level, ".quantity")));
            }
            uint256 budget = LeverageMath.budgetFor(_u(string.concat(v, ".stake")), leverageBps, premiumBps);
            assertEq(budget, _u(string.concat(v, ".expect.budget")), string.concat(name, ": budget"));
            uint256 quantity = LeverageMath.walkBudget(levels, invert, ONE, budget, _u(string.concat(v, ".lot")));
            assertEq(quantity, _u(string.concat(v, ".expect.quantityRaw")), string.concat(name, ": quantity"));
            (uint256 cost, uint256 filled, uint256 limit) = LeverageMath.walkQuantity(levels, invert, ONE, quantity);
            assertEq(cost, _u(string.concat(v, ".expect.costRaw")), string.concat(name, ": cost"));
            assertEq(filled, _u(string.concat(v, ".expect.filledRaw")), string.concat(name, ": filled"));
            assertEq(limit, _u(string.concat(v, ".expect.limitYesRaw")), string.concat(name, ": limit"));
            (uint256 stake, uint256 fronted, uint256 premium) = LeverageMath.terms(cost, leverageBps, premiumBps);
            assertEq(stake, _u(string.concat(v, ".expect.stake")), string.concat(name, ": stake"));
            assertEq(fronted, _u(string.concat(v, ".expect.fronted")), string.concat(name, ": fronted"));
            assertEq(premium, _u(string.concat(v, ".expect.premium")), string.concat(name, ": premium"));
            assertEq(stake + fronted - premium, cost, string.concat(name, ": the pot is the cost"));
            assertEq(LeverageMath.winIfRight(quantity, fronted), _u(string.concat(v, ".expect.winIfRight")), string.concat(name, ": win"));
        }
    }

    function test_isKnockable_andSplit() public pure {
        assertFalse(LeverageMath.isKnockable(12 * ONE, 10 * ONE, 12_000), "at the line is not under it");
        assertTrue(LeverageMath.isKnockable(12 * ONE - 1, 10 * ONE, 12_000));
        assertFalse(LeverageMath.isKnockable(0, 0, 12_000), "no claim, nothing to protect");
        (uint256 reclaimed, uint256 returned) = LeverageMath.split(11_200_000, 10 * ONE);
        assertEq(reclaimed, 10 * ONE);
        assertEq(returned, 1_200_000);
        (reclaimed, returned) = LeverageMath.split(8 * ONE, 10 * ONE);
        assertEq(reclaimed, 8 * ONE);
        assertEq(returned, 0);
    }
}
