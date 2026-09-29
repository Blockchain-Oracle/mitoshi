// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/median.rs.

/// @title The RedStone SDK's median: the middle value for an odd count, `⌊(a + b) / 2⌋` without overflow for an even
///        count (A.5.1 "even = floored average").
library Median {
    function avgFloor(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a >> 1) + (b >> 1) + (((a & 1) + (b & 1)) >> 1);
    }

    /// @notice Sorts `values` in place (insertion sort; N ≤ 5) and returns the median. Reverts on an empty array.
    function median(uint256[] memory values) internal pure returns (uint256) {
        uint256 n = values.length;
        for (uint256 i = 1; i < n; ++i) {
            uint256 x = values[i];
            uint256 j = i;
            while (j > 0 && values[j - 1] > x) {
                values[j] = values[j - 1];
                --j;
            }
            values[j] = x;
        }
        uint256 mid = n / 2;
        return n % 2 == 1 ? values[mid] : avgFloor(values[mid - 1], values[mid]);
    }
}
