// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/range/RangeMath.sol — unchanged (bit-exact with the golden vectors); FairValue
// (A.5.4) reuses its Φ, √ and Φ⁻¹.

/// @title The range round's arithmetic, pure — mirrored line for line by `@masayume/core/range`.
/// @notice A band's odds under a normal model of the return to expiry: the width comes from the house's
///         realized-volatility parameter for the asset over the seconds left, the centre from the
///         Window's own book (P(close ≥ open) read off the resting orders is Φ of the current
///         distance from the opening print, so Φ⁻¹ of it puts the distribution where the market is).
/// @dev Fixed points: prints in cents (int256); `sigmaE8` is the per-√second volatility × 1e8;
///      `z` × 1e4; probabilities × 1e6 (`P_ONE`) inside the maths, rescaled to `one` at the seam.
///      Every rounding of money is in the reserve's favour.
library RangeMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant P_ONE = 1_000_000;
    uint256 internal constant E8 = 100_000_000;
    int256 internal constant Z_STEP_E4 = 500;
    int256 internal constant Z_MAX_E4 = 40_000;
    uint256 internal constant TABLE_LAST = 80;
    /// @dev Φ(z) × 1e6 for z = 0.00, 0.05 … 4.00 (81 entries, three bytes each); generated offline from erf.
    bytes internal constant CDF = hex"07a12007ef03083cb4088a0208d6bc0922b2096db709b79f0a003e0a476d0a8d060ad0e80b12f30b530a0b91140bccfd0c06b10c3e210c73440ca6100cd6810d04950d304e0d59b00d80c20da58e0dc8200de8840e06cb0e23070e3d490e55a50e6c310e81010e942b0ea5c50eb5e60ec4a30ed2130ede4c0ee9620ef36a0efc780f049e0f0bf10f12800f185c0f1d950f223a0f26590f29fe0f2d360f300b0f32870f34b50f369c0f38450f39b60f3af60f3c0b0f3cfa0f3dc80f3e780f3f100f3f910f3fff0f405d0f40ac0f40ef0f41280f41570f417f0f41a10f41bd0f41d40f41e80f41f80f42050f42100f42190f4220";

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /// @dev The table entry for z = i × 0.05.
    function tableAt(uint256 i) internal pure returns (uint256) {
        bytes memory t = CDF;
        uint256 at = i * 3;
        return (uint256(uint8(t[at])) << 16) | (uint256(uint8(t[at + 1])) << 8) | uint256(uint8(t[at + 2]));
    }

    /// @notice Φ(z) × 1e6, linear between table points, saturating past |z| = 4.
    function cdfE6(int256 zE4) internal pure returns (uint256) {
        if (zE4 < 0) return P_ONE - cdfE6(-zE4);
        if (zE4 >= Z_MAX_E4) return P_ONE;
        uint256 i = uint256(zE4 / Z_STEP_E4);
        uint256 frac = uint256(zE4 % Z_STEP_E4);
        uint256 lo = tableAt(i);
        uint256 hi = tableAt(i + 1);
        return lo + (hi - lo) * frac / uint256(Z_STEP_E4);
    }

    /// @notice Φ⁻¹(p) × 1e4 for p × 1e6, the table inverted, clamped to ±4.
    function probitE4(uint256 pE6) internal pure returns (int256) {
        if (pE6 < P_ONE / 2) return -probitE4(P_ONE - pE6);
        if (pE6 >= tableAt(TABLE_LAST)) return Z_MAX_E4;
        uint256 i = 0;
        while (tableAt(i + 1) <= pE6) {
            i++;
        }
        uint256 lo = tableAt(i);
        uint256 hi = tableAt(i + 1);
        return int256(i) * Z_STEP_E4 + int256((pE6 - lo) * uint256(Z_STEP_E4) / (hi - lo));
    }

    /// @notice ⌊√x⌋.
    function isqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @notice The standard deviation of the return over `tauSec`, × 1e8: σ√τ with two extra digits under the root.
    function stdE8(uint64 sigmaE8, uint256 tauSec) internal pure returns (uint256) {
        return uint256(sigmaE8) * isqrt(tauSec * 10_000) / 100;
    }

    /// @notice A print's distance from the opening print in standard deviations, × 1e4.
    function zOf(int256 print, int256 openingPrint, uint256 std) internal pure returns (int256) {
        int256 relE8 = (print - openingPrint) * int256(E8) / openingPrint;
        return relE8 * 10_000 / int256(std);
    }

    /// @notice P(low ≤ close ≤ high) × 1e6 when the market's own P(close ≥ open) is `centerQE6`.
    function bandProbE6(int256 openingPrint, int256 low, int256 high, uint256 centerQE6, uint64 sigmaE8, uint256 tauSec)
        internal
        pure
        returns (uint256)
    {
        uint256 std = stdE8(sigmaE8, tauSec);
        int256 mu = probitE4(centerQE6);
        uint256 upper = cdfE6(zOf(high, openingPrint, std) - mu);
        uint256 lower = cdfE6(zOf(low, openingPrint, std) - mu);
        return upper > lower ? upper - lower : 0;
    }

    /// @notice The least stake the reserve accepts for `maxPayout`: fair value plus the margin, both rounded up.
    function floorStake(uint256 maxPayout, uint256 probRaw, uint256 one, uint16 marginBps) internal pure returns (uint256) {
        uint256 fair = ceilDiv(maxPayout * probRaw, one);
        return ceilDiv(fair * (BPS + marginBps), BPS);
    }
}
