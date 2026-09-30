// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/parlay/ParlayMath.sol — unchanged but for the level type: the lens's
// `LevelRaw` is `IBinaryPool.Level` field for field (A.2.7), so the arithmetic and the golden vectors are bit-exact.

import {LevelRaw} from "../../engine/interfaces/IEngineLens.sol";

/// @title The parlay's arithmetic, pure — mirrored line for line by `@masayume/core/parlay`.
/// @dev Probabilities are prices: collateral per whole contract, scaled by `one` (10^decimals).
///      Every rounding is in the reserve's favour, so it is never short a base unit.
library ParlayMath {
    uint256 internal constant BPS = 10_000;

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /// @notice The cost-weighted price of the first `quantityRaw` contracts resting on `levels`.
    /// @param invert true when the levels are the YES bids a NO buyer takes: the NO price is `one − bid`.
    /// @return priceRaw collateral per whole contract, rounded up; 0 when nothing rests
    /// @return filledRaw how much of `quantityRaw` the levels could actually supply
    function vwap(LevelRaw[] memory levels, bool invert, uint256 one, uint256 quantityRaw)
        internal
        pure
        returns (uint256 priceRaw, uint256 filledRaw)
    {
        uint256 cost;
        for (uint256 i = 0; i < levels.length && filledRaw < quantityRaw; i++) {
            uint256 price = invert ? one - levels[i].price : levels[i].price;
            uint256 take = quantityRaw - filledRaw;
            if (levels[i].quantity < take) take = levels[i].quantity;
            cost += take * price;
            filledRaw += take;
        }
        if (filledRaw == 0) return (0, 0);
        priceRaw = ceilDiv(cost, filledRaw);
    }

    /// @notice Π leg probabilities, floored at λ · min when two legs settle at the same instant: legs
    ///         decided by the same closing print are correlated, so the product understates the joint odds.
    function combine(uint256[] memory prices, uint64[] memory expiries, uint256 one, uint16 correlationBps)
        internal
        pure
        returns (uint256 combined)
    {
        combined = one;
        uint256 minPrice = one;
        for (uint256 i = 0; i < prices.length; i++) {
            combined = combined * prices[i] / one;
            if (prices[i] < minPrice) minPrice = prices[i];
        }
        if (hasDuplicate(expiries)) {
            uint256 floor = minPrice * correlationBps / BPS;
            if (floor > combined) combined = floor;
        }
    }

    /// @notice The least stake the reserve accepts for `maxPayout`: fair value plus the margin, both rounded up.
    function floorStake(uint256 maxPayout, uint256 combinedProbRaw, uint256 one, uint16 marginBps) internal pure returns (uint256) {
        uint256 fair = ceilDiv(maxPayout * combinedProbRaw, one);
        return ceilDiv(fair * (BPS + marginBps), BPS);
    }

    /// @dev True iff `xs[idx]` equals an earlier element — so each distinct expiry is counted exactly once.
    function seenBefore(uint64[] memory xs, uint256 idx) internal pure returns (bool) {
        for (uint256 i = 0; i < idx; i++) {
            if (xs[i] == xs[idx]) return true;
        }
        return false;
    }

    function hasDuplicate(uint64[] memory xs) internal pure returns (bool) {
        for (uint256 i = 1; i < xs.length; i++) {
            if (seenBefore(xs, i)) return true;
        }
        return false;
    }
}
