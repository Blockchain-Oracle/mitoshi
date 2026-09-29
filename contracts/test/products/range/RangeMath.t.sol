// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeMath.t.sol — unchanged but for the import path.

import {Test} from "forge-std/Test.sol";
import {RangeMath} from "../../../src/products/range/RangeMath.sol";

/// @notice The table and its inverse at known points, the root, and the band probability's shape.
contract RangeMathTest is Test {
    int256 internal constant P0 = 7_673_523;

    function test_table_endpointsAndKnownPoints() public pure {
        assertEq(RangeMath.tableAt(0), 500_000);
        assertEq(RangeMath.tableAt(20), 841_345, "z = 1.00");
        assertEq(RangeMath.tableAt(80), 999_968, "z = 4.00");
        assertEq(RangeMath.cdfE6(0), 500_000);
        assertEq(RangeMath.cdfE6(10_000), 841_345);
        assertEq(RangeMath.cdfE6(-10_000), 158_655, "symmetric");
        assertEq(RangeMath.cdfE6(40_000), 1_000_000, "saturates at 4");
        assertEq(RangeMath.cdfE6(-40_000), 0);
        assertEq(RangeMath.cdfE6(250), 509_969, "halfway between the first two entries, truncated");
    }

    function test_probit_invertsTheTable() public pure {
        assertEq(RangeMath.probitE4(500_000), 0);
        assertEq(RangeMath.probitE4(841_345), 10_000);
        assertEq(RangeMath.probitE4(158_655), -10_000);
        assertEq(RangeMath.probitE4(999_999), 40_000, "clamps at 4");
        assertEq(RangeMath.probitE4(1), -40_000);
        for (int256 z = -35_000; z <= 35_000; z += 625) {
            int256 back = RangeMath.probitE4(RangeMath.cdfE6(z));
            assertLe(back > z ? back - z : z - back, 10, "round trip within 0.001 sigma");
        }
    }

    function test_root_andStandardDeviation() public pure {
        assertEq(RangeMath.isqrt(0), 0);
        assertEq(RangeMath.isqrt(1), 1);
        assertEq(RangeMath.isqrt(2_400_000), 1_549);
        assertEq(RangeMath.isqrt(1 << 200), 1 << 100);
        assertEq(RangeMath.stdE8(6_200, 240), 96_038, "BTC over four minutes: 9.6 bps");
        assertEq(RangeMath.stdE8(6_200, 300), 107_384, "BTC over five minutes: 10.7 bps, the measured figure");
    }

    function test_z_isTheRelativeMoveInStandardDeviations() public pure {
        uint256 std = RangeMath.stdE8(6_200, 240);
        assertEq(RangeMath.zOf(P0 + 3_000, P0, std), 4_070, "+$30 on 76,735 is 0.407 sigma");
        assertEq(RangeMath.zOf(P0 - 3_000, P0, std), -4_070, "truncates toward zero on both sides");
        assertEq(RangeMath.zOf(P0, P0, std), 0);
    }

    function test_bandProb_isSymmetricAtEvenOddsAndMovesWithTheCentre() public pure {
        uint256 centred = RangeMath.bandProbE6(P0, P0 - 3_000, P0 + 3_000, 500_000, 6_200, 240);
        assertEq(centred, 315_946);
        assertEq(RangeMath.bandProbE6(P0, P0 - 3_000, P0, 500_000, 6_200, 240), RangeMath.bandProbE6(P0, P0, P0 + 3_000, 500_000, 6_200, 240), "each half the same");
        uint256 above = RangeMath.bandProbE6(P0, P0, P0 + 6_000, 841_345, 6_200, 240);
        uint256 below = RangeMath.bandProbE6(P0, P0, P0 + 6_000, 158_655, 6_200, 240);
        assertGt(above, below, "a market sitting above the open makes an upper band likelier");
        assertEq(RangeMath.bandProbE6(P0, P0 - 400_000, P0 + 400_000, 500_000, 6_200, 240), 1_000_000, "a band 40 sigma wide is certain");
        assertEq(RangeMath.bandProbE6(P0, P0 + 800_000, P0 + 900_000, 500_000, 6_200, 240), 0, "a band 80 sigma away is impossible");
    }

    function test_floorStake_roundsUpTwice() public pure {
        assertEq(RangeMath.floorStake(100e6, 315_946, 1e6, 1_200), 35_385_952);
        assertEq(RangeMath.floorStake(100e6, 315_946, 1e6, 0), 31_594_600);
        assertEq(RangeMath.floorStake(1, 1, 1e6, 0), 1, "never zero for a positive payout");
    }
}
