// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PAIR_TICKS, MIN_PRICE_TICKS, MAX_PRICE_TICKS, PAYOUT_DENOMINATOR, KIND_BUY_YES, KIND_SELL_YES} from "../EngineTypes.sol";
import {IEngineErrors} from "../EngineErrors.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/grid.rs and
// anchor/programs/agari-events/src/matching/paths.rs (`own_ticks`, `cash_of`).

/// @title The exact grid (E-01). Prices are YES ticks 1..999; a YES and a NO at complementary prices cost exactly one
///        pair. No rounding anywhere except the redeem floor, which is exact on valid grids. Overflow of a uint64 amount
///        refuses `MathOverflow` (Agari's checked math).
library Grid {
    uint256 private constant U64_MAX = type(uint64).max;

    function isValidPrice(uint16 p) internal pure returns (bool) {
        return p >= MIN_PRICE_TICKS && p <= MAX_PRICE_TICKS;
    }

    /// @notice `cu = lotBase × tickBase / 10^dec` after the registration rules: `tickBase × 1000 == 10^dec` and
    ///         `lotBase × tickBase` a whole number of base units. So `1000 × cu == lotBase`.
    function cashUnit(uint64 lotBase, uint64 tickBase, uint8 decimals) internal pure returns (uint64) {
        if (decimals > 19) revert IEngineErrors.BadGrid(); // 10^dec must fit a uint64
        uint256 pow = 10 ** uint256(decimals);
        if (lotBase == 0 || tickBase == 0) revert IEngineErrors.BadGrid();
        if (uint256(tickBase) * PAIR_TICKS != pow) revert IEngineErrors.BadGrid();
        uint256 product = uint256(lotBase) * uint256(tickBase);
        if (product % pow != 0) revert IEngineErrors.BadGrid();
        uint256 cu = product / pow;
        if (cu == 0 || cu > U64_MAX) revert IEngineErrors.BadGrid();
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(cu);
    }

    /// @notice Ticks one lot of `kind` trades at, for YES price `p`: `p` for YES kinds, `1000 − p` for NO kinds.
    function ownTicks(uint8 kind, uint16 price) internal pure returns (uint256) {
        return (kind == KIND_BUY_YES || kind == KIND_SELL_YES) ? uint256(price) : PAIR_TICKS - uint256(price);
    }

    /// @notice `lots × ownTicks × cu`, as a uint64 amount.
    function cashOf(uint8 kind, uint16 price, uint64 lots, uint64 cu) internal pure returns (uint64) {
        return toU64(uint256(lots) * ownTicks(kind, price) * uint256(cu));
    }

    /// @notice `lots × p × cu`: what a YES side pays or receives at YES price `p`.
    function yesCash(uint64 lots, uint16 price, uint64 cu) internal pure returns (uint64) {
        return toU64(uint256(lots) * uint256(price) * uint256(cu));
    }

    /// @notice `lots × (1000 − p) × cu`: what a NO side pays or receives at YES price `p`.
    function noCash(uint64 lots, uint16 price, uint64 cu) internal pure returns (uint64) {
        if (price > PAIR_TICKS) revert IEngineErrors.MathOverflow();
        return toU64(uint256(lots) * (PAIR_TICKS - uint256(price)) * uint256(cu));
    }

    /// @notice `lots × 1000 × cu`: the backing of `lots` complete pairs.
    function pairCash(uint64 lots, uint64 cu) internal pure returns (uint64) {
        return toU64(uint256(lots) * PAIR_TICKS * uint256(cu));
    }

    /// @notice Full redeem `⌊(yes·1000·cu·yN + no·1000·cu·nN) / 10⁷⌋` (E-53).
    function redeemPayout(uint64 yesLots, uint64 noLots, uint64 cu, uint32 payoutYes, uint32 payoutNo)
        internal
        pure
        returns (uint64)
    {
        uint256 unit = PAIR_TICKS * uint256(cu);
        uint256 total = (uint256(yesLots) * unit * payoutYes + uint256(noLots) * unit * payoutNo) / PAYOUT_DENOMINATOR;
        return toU64(total);
    }

    /// @notice Partial redeem of one outcome `⌊lots·1000·cu·num / 10⁷⌋` (E-54).
    function partialPayout(uint64 lots, uint64 cu, uint32 numerator) internal pure returns (uint64) {
        return redeemPayout(lots, 0, cu, numerator, 0);
    }

    function toU64(uint256 x) internal pure returns (uint64) {
        if (x > U64_MAX) revert IEngineErrors.MathOverflow();
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(x);
    }
}
