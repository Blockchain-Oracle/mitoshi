// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {Segment, FeeSchedule} from "./CurveTypes.sol";

/// @title CurveMath
/// @notice The piecewise-constant-liquidity bonding curve (plan B.5.2): each segment behaves like a concentrated
///         liquidity range, so the amounts between two prices come from v4-core's MIT `SqrtPriceMath`. Every rounding
///         favours the reserve: a buyer pays at least the integral and receives at most it; a seller receives at most
///         it. `packages/core/src/launch/curve.ts` mirrors every function here bit-for-bit (shared vectors in
///         `packages/core/src/launch/curve.vectors.json`, checked by `test/tempo/launch/CurveMath.t.sol`).
library CurveMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_SEGMENTS = 16;
    /// @dev Anti-snipe fees never exceed 50 % and the resting fee never exceeds 10 %.
    uint16 internal constant MAX_FEE_BPS = 5_000;
    uint16 internal constant MAX_BASE_FEE_BPS = 1_000;
    /// @dev An exponential schedule stops decaying after this many periods and rests at its base.
    uint256 internal constant MAX_FEE_PERIODS = 256;

    error BadSegments();
    error ThresholdBeyondCurve();
    error TrailingSegments();
    error BadFeeSchedule();
    error BeyondCurveStart();

    // ── config derivation ─────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Validates 1–16 strictly increasing segments and finds where the reserve reaches `threshold`.
    /// @return sqrtEnd the price at which the curve completes
    /// @return curveSupply coin minted if the whole curve is bought (Σ amount0, rounded up: an upper bound)
    /// @return quoteToEnd pathUSD the whole curve takes (Σ amount1, rounded up)
    function derive(uint160 sqrtStart, Segment[] memory segs, uint256 threshold)
        internal
        pure
        returns (uint160 sqrtEnd, uint256 curveSupply, uint256 quoteToEnd)
    {
        uint256 n = segs.length;
        if (n == 0 || n > MAX_SEGMENTS || sqrtStart == 0 || threshold == 0) revert BadSegments();
        uint160 lower = sqrtStart;
        for (uint256 i; i < n; i++) {
            Segment memory s = segs[i];
            if (s.sqrtPriceUpperX96 <= lower || s.liquidity == 0) revert BadSegments();
            uint256 segQuote = SqrtPriceMath.getAmount1Delta(lower, s.sqrtPriceUpperX96, s.liquidity, true);
            if (quoteToEnd + segQuote >= threshold) {
                sqrtEnd = quoteToEnd + segQuote == threshold
                    ? s.sqrtPriceUpperX96
                    : SqrtPriceMath.getNextSqrtPriceFromInput(lower, s.liquidity, threshold - quoteToEnd, false);
                if (sqrtEnd == lower) revert BadSegments();
                if (i != n - 1) revert TrailingSegments();
                curveSupply += SqrtPriceMath.getAmount0Delta(lower, sqrtEnd, s.liquidity, true);
                quoteToEnd += SqrtPriceMath.getAmount1Delta(lower, sqrtEnd, s.liquidity, true);
                return (sqrtEnd, curveSupply, quoteToEnd);
            }
            quoteToEnd += segQuote;
            curveSupply += SqrtPriceMath.getAmount0Delta(lower, s.sqrtPriceUpperX96, s.liquidity, true);
            lower = s.sqrtPriceUpperX96;
        }
        revert ThresholdBeyondCurve();
    }

    // ── trading ───────────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Spends up to `quoteIn` (net of fees) buying coin from `sqrtP` towards `sqrtEnd`, crossing segments.
    ///         Stops at `sqrtEnd` (the buy is clipped and `quoteUsed < quoteIn`).
    function buy(Segment[] memory segs, uint160 sqrtEnd, uint160 sqrtP, uint256 seg, uint256 quoteIn)
        internal
        pure
        returns (uint256 coinOut, uint256 quoteUsed, uint160 sqrtNext, uint256 segNext)
    {
        uint256 remaining = quoteIn;
        while (remaining != 0 && sqrtP < sqrtEnd) {
            if (sqrtP == segs[seg].sqrtPriceUpperX96) seg++;
            Segment memory s = segs[seg];
            uint160 upper = s.sqrtPriceUpperX96 < sqrtEnd ? s.sqrtPriceUpperX96 : sqrtEnd;
            uint256 need = SqrtPriceMath.getAmount1Delta(sqrtP, upper, s.liquidity, true);
            if (remaining >= need) {
                coinOut += SqrtPriceMath.getAmount0Delta(sqrtP, upper, s.liquidity, false);
                quoteUsed += need;
                remaining -= need;
                sqrtP = upper;
            } else {
                uint160 next = SqrtPriceMath.getNextSqrtPriceFromInput(sqrtP, s.liquidity, remaining, false);
                coinOut += SqrtPriceMath.getAmount0Delta(sqrtP, next, s.liquidity, false);
                quoteUsed += remaining;
                remaining = 0;
                sqrtP = next;
            }
        }
        return (coinOut, quoteUsed, sqrtP, seg);
    }

    /// @notice Sells `coinIn` from `sqrtP` towards `sqrtStart`, crossing segments downwards.
    function sell(Segment[] memory segs, uint160 sqrtStart, uint160 sqrtP, uint256 seg, uint256 coinIn)
        internal
        pure
        returns (uint256 quoteOut, uint160 sqrtNext, uint256 segNext)
    {
        uint256 remaining = coinIn;
        while (remaining != 0) {
            uint160 lower = seg == 0 ? sqrtStart : segs[seg - 1].sqrtPriceUpperX96;
            uint128 liq = segs[seg].liquidity;
            uint256 need = SqrtPriceMath.getAmount0Delta(lower, sqrtP, liq, true);
            if (remaining >= need) {
                quoteOut += SqrtPriceMath.getAmount1Delta(lower, sqrtP, liq, false);
                remaining -= need;
                sqrtP = lower;
                if (seg == 0) {
                    if (remaining != 0) revert BeyondCurveStart();
                } else {
                    seg--;
                }
            } else {
                uint160 next = SqrtPriceMath.getNextSqrtPriceFromInput(sqrtP, liq, remaining, true);
                quoteOut += SqrtPriceMath.getAmount1Delta(next, sqrtP, liq, false);
                remaining = 0;
                sqrtP = next;
            }
        }
        return (quoteOut, sqrtP, seg);
    }

    // ── fees ──────────────────────────────────────────────────────────────────────────────────────────────────────

    function checkSchedule(FeeSchedule memory f) internal pure {
        if (f.base > MAX_BASE_FEE_BPS || f.start > MAX_FEE_BPS || f.start < f.base || f.mode > 1) revert BadFeeSchedule();
        if (f.start != f.base && (f.period == 0 || f.reduction == 0)) revert BadFeeSchedule();
        if (f.mode == 1 && f.reduction >= BPS) revert BadFeeSchedule();
    }

    /// @notice The fee in bps `elapsed` seconds after the launch was created.
    function feeBps(FeeSchedule memory f, uint256 elapsed) internal pure returns (uint256 fee) {
        if (f.start == f.base) return f.base;
        uint256 n = elapsed / f.period;
        if (f.mode == 0) {
            uint256 cut = n * f.reduction;
            return cut >= f.start - f.base ? f.base : f.start - cut;
        }
        if (n > MAX_FEE_PERIODS) return f.base;
        fee = f.start;
        for (uint256 i; i < n && fee > f.base; i++) fee = fee * (BPS - f.reduction) / BPS;
        return fee < f.base ? f.base : fee;
    }

    /// @notice The fee taken from a gross pathUSD input (rounded up).
    function feeOn(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return (amount * bps + BPS - 1) / BPS;
    }

    /// @notice The gross input whose net after `feeOn` is at least `net` (the clipped-buy charge).
    function grossFor(uint256 net, uint256 bps) internal pure returns (uint256 gross) {
        gross = (net * BPS + (BPS - bps) - 1) / (BPS - bps);
        while (gross - feeOn(gross, bps) < net) gross++;
    }
}
