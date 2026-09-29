// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FullMath} from "v4-core/libraries/FullMath.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title GuardMath — the StockGuardHook's price and band arithmetic (plan B.3.3, D-022).
/// @notice Pools are `(pathUSD = currency0, mirror = currency1)`, both 6 decimals, so the v4 price is mirror units per
///         pathUSD unit = 1 / tokenPrice. `tokenPriceE18` is USD per whole mirror token × 1e18 = the underlying share
///         price × the mirrored `uiMultiplier` (× — never ÷: one CRWD token after the 4-for-1 split is four shares).
///         Every function is integer-exact and mirrored bit for bit by `packages/core/src/stocks/guard.ts`; the shared
///         vectors live in `packages/core/src/stocks/guard.vectors.json`.
library GuardMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant Q96 = 1 << 96;
    uint256 internal constant Q192 = 1 << 192;

    error ZeroPrice();
    error SqrtPriceOutOfRange(uint256 sqrtPriceX96);
    error BadBand(uint256 bps);

    /// @return USD per whole mirror token × 1e18 = `sharePriceE18 × uiMultiplierE18 / 1e18` (floor).
    function tokenPriceE18(uint256 sharePriceE18, uint256 uiMultiplierE18) internal pure returns (uint256) {
        return FullMath.mulDiv(sharePriceE18, uiMultiplierE18, WAD);
    }

    /// @return sqrtPriceX96 = floor(sqrt(2^192 × 1e18 / tokenPriceE18)), inside v4's `[MIN_SQRT_PRICE, MAX_SQRT_PRICE)`.
    function sqrtFromTokenPrice(uint256 tokenPrice) internal pure returns (uint160) {
        if (tokenPrice == 0) revert ZeroPrice();
        uint256 s = Math.sqrt(FullMath.mulDiv(Q192, WAD, tokenPrice));
        if (s < TickMath.MIN_SQRT_PRICE || s >= TickMath.MAX_SQRT_PRICE) revert SqrtPriceOutOfRange(s);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint160(s);
    }

    /// @return USD per whole mirror token × 1e18 at `sqrtPriceX96`: floor(1e18 × 2^192 / sqrtP²).
    function tokenPriceFromSqrt(uint160 sqrtPriceX96) internal pure returns (uint256) {
        return FullMath.mulDiv(WAD << 96, Q96, sqrtPriceX96) / sqrtPriceX96;
    }

    /// @notice The guard band around `tokenPrice` at ±`bps`, as v4 sqrt prices. A higher token price is a lower v4
    ///         price, so `lo` comes from `P·(1+b)` and `hi` from `P·(1−b)`.
    function band(uint256 tokenPrice, uint256 bps) internal pure returns (uint160 lo, uint160 hi) {
        if (bps == 0 || bps >= BPS) revert BadBand(bps);
        lo = sqrtFromTokenPrice(FullMath.mulDiv(tokenPrice, BPS + bps, BPS));
        hi = sqrtFromTokenPrice(FullMath.mulDiv(tokenPrice, BPS - bps, BPS));
    }

    /// @notice The after-swap rule: the post-swap price is inside `[lo, hi]`, or the swap started outside and moved
    ///         strictly toward the band without passing its far edge — so corrective arbitrage is never deadlocked and
    ///         nothing can push the price from one side of the band past the other.
    function allowed(uint160 pre, uint160 post, uint160 lo, uint160 hi) internal pure returns (bool) {
        if (post >= lo && post <= hi) return true;
        if (pre < lo) return post > pre && post < lo;
        if (pre > hi) return post < pre && post > hi;
        return false;
    }
}
