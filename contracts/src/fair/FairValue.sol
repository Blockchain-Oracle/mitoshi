// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {RangeMath} from "../products/range/RangeMath.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/fair.ts — the
// house maker's strike model, in integers: Solady `lnWad` for the log-return, RangeMath's Φ table for the CDF.

/// @title The fair P(close ≥ open) of an Up/Down Window from a live spot (A.5.4, PD-2).
/// @notice `probUpE6 = Φ(ln(spot/open) / (σ√τ))`, the model the house maker quotes around (Agari `fairYesTicks`), so
///         a reserve can refuse a book price that has left it. Mirrored bit for bit by packages/core `fair/fair.ts`;
///         `fair.vectors.json` also carries Agari's float answer for every vector.
/// @dev Fixed points as RangeMath: `sigmaE8` is σ per √second × 1e8, prices × 1e8, probabilities × 1e6, z × 1e4.
///      Solady `lnWad` reverts `LnWadUndefined` on x ≤ 0, so non-positive prices refuse by name first (D-054) and the
///      ratio is taken with `fullMulDiv` (exact, no overflow).
library FairValue {
    uint256 internal constant P_ONE = 1_000_000;
    uint256 internal constant WAD = 1e18;
    /// Agari `MIN_SECONDS_LEFT`: the last seconds before the close print never divide the scale to zero.
    uint256 internal constant MIN_SECONDS_LEFT = 5;
    /// z × 1e4 = ln(r)·1e18 · 1e4 / (std·1e10), std being σ√τ × 1e8.
    int256 internal constant Z_DIVISOR_SCALE = 1e10;
    /// YES ticks per whole contract.
    uint256 internal constant TICKS = 1000;

    error NonPositivePrice(int256 spotE8, int256 openE8);

    /// @notice z × 1e4 of the spot's log-distance from the open, in standard deviations over `tauSec`
    ///         (floored at `MIN_SECONDS_LEFT`). `std == 0` (σ = 0) saturates to ±4σ, as Agari's `scale > 0` branch.
    function zE4(int256 spotE8, int256 openE8, uint64 sigmaE8, uint256 tauSec) internal pure returns (int256) {
        if (spotE8 <= 0 || openE8 <= 0) revert NonPositivePrice(spotE8, openE8);
        uint256 ratioWad = FixedPointMathLib.fullMulDiv(uint256(spotE8), WAD, uint256(openE8));
        // A spot below 1e-18 of the open is Φ(−∞); lnWad would refuse the zero ratio.
        if (ratioWad == 0) return -RangeMath.Z_MAX_E4;
        int256 lnW = FixedPointMathLib.lnWad(int256(ratioWad));
        uint256 std = RangeMath.stdE8(sigmaE8, tauSec < MIN_SECONDS_LEFT ? MIN_SECONDS_LEFT : tauSec);
        if (std == 0) return spotE8 >= openE8 ? RangeMath.Z_MAX_E4 : -RangeMath.Z_MAX_E4;
        return lnW * 10_000 / (int256(std) * Z_DIVISOR_SCALE);
    }

    /// @notice Φ(z) × 1e6: the fair probability the Window settles Up.
    function probUpE6(int256 spotE8, int256 openE8, uint64 sigmaE8, uint256 tauSec) internal pure returns (uint256) {
        return RangeMath.cdfE6(zE4(spotE8, openE8, sigmaE8, tauSec));
    }

    /// @notice The fair probability of one side (0 = Up/YES, 1 = Down/NO) × 1e6.
    function sideProbE6(uint256 upE6, uint8 outcomeIdx) internal pure returns (uint256) {
        return outcomeIdx == 0 ? upE6 : P_ONE - upE6;
    }

    /// @notice Agari `fairYesTicks`: ⌊p·1000 + ½ tick tie bias + ½⌋ clamped to `[minTick, 1000 − minTick]` (PD-3:
    ///         ties settle Up, so an unmoved price quotes 501).
    function yesTicks(uint256 upE6, uint16 minTick) internal pure returns (uint16) {
        uint256 t = (upE6 + P_ONE / TICKS) / (P_ONE / TICKS);
        if (t < minTick) t = minTick;
        if (t > TICKS - minTick) t = TICKS - minTick;
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(t);
    }
}
