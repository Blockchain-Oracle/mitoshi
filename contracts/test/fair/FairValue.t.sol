// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {FairValue} from "../../src/fair/FairValue.sol";

/// External entry points, so refusals surface as reverts of a call.
contract FairValueHarness {
    function zE4(int256 spot, int256 open, uint64 sigma, uint256 tau) external pure returns (int256) {
        return FairValue.zE4(spot, open, sigma, tau);
    }

    function probUpE6(int256 spot, int256 open, uint64 sigma, uint256 tau) external pure returns (uint256) {
        return FairValue.probUpE6(spot, open, sigma, tau);
    }

    function yesTicks(uint256 upE6, uint16 minTick) external pure returns (uint16) {
        return FairValue.yesTicks(upE6, minTick);
    }
}

/// A.5.4: `FairValue` against `packages/core/src/fair/fair.vectors.json` — bit for bit with the TS mirror, which the
/// vitest suite bounds against Agari's float `seat/fair.ts` (≤ 1 tick) — plus the D-054 refusals.
contract FairValueTest is Test {
    string internal constant VECTORS = "../packages/core/src/fair/fair.vectors.json";
    FairValueHarness internal h = new FairValueHarness();

    function test_vectors_bitExactWithTheTsMirror() public view {
        string memory json = vm.readFile(VECTORS);
        uint256[] memory spot = vm.parseJsonUintArray(json, ".spotE8");
        uint256[] memory open = vm.parseJsonUintArray(json, ".openE8");
        uint256[] memory tau = vm.parseJsonUintArray(json, ".tauSec");
        uint256[] memory sigma = vm.parseJsonUintArray(json, ".sigmaE8");
        uint256[] memory minTick = vm.parseJsonUintArray(json, ".minTick");
        int256[] memory z = vm.parseJsonIntArray(json, ".zE4");
        uint256[] memory up = vm.parseJsonUintArray(json, ".upE6");
        uint256[] memory ticks = vm.parseJsonUintArray(json, ".yesTicks");
        uint256[] memory agariTicks = vm.parseJsonUintArray(json, ".agariTicks");
        assertGt(spot.length, 900, "the whole grid");
        for (uint256 i; i < spot.length; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            (int256 s, int256 o, uint64 sg) = (int256(spot[i]), int256(open[i]), uint64(sigma[i]));
            assertEq(h.zE4(s, o, sg, tau[i]), z[i], "zE4");
            uint256 p = h.probUpE6(s, o, sg, tau[i]);
            assertEq(p, up[i], "upE6");
            // forge-lint: disable-next-line(unsafe-typecast)
            uint16 t = h.yesTicks(p, uint16(minTick[i]));
            assertEq(t, ticks[i], "yesTicks");
            assertLe(t > agariTicks[i] ? t - agariTicks[i] : agariTicks[i] - t, 1, "within a tick of Agari");
        }
    }

    function test_agariWorkedCases() public view {
        uint64 sigma = 18_531; // 4,500 bp over a trading year: floor(sqrt(4500^2 * 1e8 / 5,896,800))
        assertEq(uint256(sigma), FixedPointMathLib.sqrt(uint256(4_500) ** 2 * 1e8 / 5_896_800));
        assertEq(h.yesTicks(h.probUpE6(400e8, 400e8, sigma, 150), 20), 501, "ties go Up");
        assertEq(h.yesTicks(h.probUpE6(440e8, 400e8, sigma, 150), 20), 980, "clamped high");
        assertEq(h.yesTicks(h.probUpE6(360e8, 400e8, sigma, 150), 20), 20, "clamped low");
        uint256 soon = h.probUpE6(401e8, 400e8, sigma, 30);
        uint256 later = h.probUpE6(401e8, 400e8, sigma, 3_000);
        assertGt(soon, later, "less certain with more time left");
        assertEq(h.probUpE6(401e8, 400e8, sigma, 0), h.probUpE6(401e8, 400e8, sigma, 5), "tau floored at 5 s");
    }

    /// D-054: Solady `lnWad` reverts `LnWadUndefined` on x <= 0; FairValue refuses by its own name before it.
    function test_nonPositivePrice_refusedByNameBeforeLnWad() public {
        vm.expectRevert(abi.encodeWithSelector(FairValue.NonPositivePrice.selector, int256(0), int256(400e8)));
        h.probUpE6(0, 400e8, 18_531, 150);
        vm.expectRevert(abi.encodeWithSelector(FairValue.NonPositivePrice.selector, int256(400e8), int256(-1)));
        h.probUpE6(400e8, -1, 18_531, 150);
    }

    function test_zeroSigma_isACertaintyEitherWay() public view {
        assertEq(h.probUpE6(401e8, 400e8, 0, 150), 1_000_000);
        assertEq(h.probUpE6(400e8, 400e8, 0, 150), 1_000_000, "a tie settles Up");
        assertEq(h.probUpE6(399e8, 400e8, 0, 150), 0);
    }

    function test_ratioBelowWadResolution_isPhiOfMinusInfinity() public view {
        assertEq(h.probUpE6(1, type(int64).max, 18_531, 150), 0);
    }

    function testFuzz_monotoneInSpot(uint64 a, uint64 b, uint32 tau) public view {
        a = uint64(bound(a, 1e6, 1e15));
        b = uint64(bound(b, a, 1e15));
        assertLe(h.probUpE6(int256(uint256(a)), 400e8, 18_531, tau), h.probUpE6(int256(uint256(b)), 400e8, 18_531, tau));
    }
}
