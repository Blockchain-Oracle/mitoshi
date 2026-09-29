// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FullMath} from "v4-core/libraries/FullMath.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Segment, Config, ConfigParams, LpSplit} from "./CurveTypes.sol";
import {CurveMath} from "./CurveMath.sol";

/// @title CurveConfigLib
/// @notice Validates and stores a launch template (plan B.5.2 `createConfig`), deriving the end price, the curve's
///         supply and the coin reserved for the v4 position. Linked (delegatecall) to keep `CurveLaunchpad` small.
///         The DBC constraints are product decisions (Q-018 defaults): liquidity split Σ 10,000 with ≥ 10 % locked,
///         vesting ≤ 2 years, a fixed 0.2 % protocol migration fee plus a configurable one.
library CurveConfigLib {
    uint256 internal constant BPS = 10_000;
    /// @notice The fixed protocol cut of the migration quote (DBC's 0.2 %).
    uint256 internal constant PROTOCOL_MIGRATION_BPS = 20;
    uint16 internal constant MAX_MIGRATION_FEE_BPS = 5_000;
    uint16 internal constant MIN_LOCKED_BPS = 1_000;
    uint32 internal constant MAX_VESTING = 63_072_000;
    uint24 internal constant MAX_LP_FEE = 1_000_000;
    /// @notice Coin the graduation may spend correcting a pre-initialised pool: 10 % of the migration coin.
    uint256 internal constant CORRECTION_DIVISOR = 10;

    error BadShares();
    error BadSplit();
    error BadVesting();
    error BadMigrationFee();
    error BadTiers();
    error BadSupply(uint256 totalSupply, uint256 needed);
    error EndPriceOutOfRange();
    error ZeroLeftoverReceiver();
    error BadCreatorBuy();

    function store(Config storage c, Segment[] storage segs, ConfigParams calldata p, address partner, uint16 minProtocolShare)
        external
    {
        if (uint256(p.protocolShareBps) + p.partnerShareBps + p.creatorShareBps != BPS || p.protocolShareBps < minProtocolShare) {
            revert BadShares();
        }
        CurveMath.checkSchedule(p.fees);
        (uint160 sqrtEnd, uint256 curveSupply, uint256 quoteToEnd) =
            CurveMath.derive(p.sqrtStartX96, p.segments, p.migrationQuoteThreshold);
        if (p.migrationFeeBps > MAX_MIGRATION_FEE_BPS) revert BadMigrationFee();
        _checkSplit(p.split, p.vestingCliff, p.vestingDuration);
        if (p.leftoverReceiver == address(0)) revert ZeroLeftoverReceiver();
        if (p.maxCreatorBuyBps > BPS) revert BadCreatorBuy();
        uint160 sqrtV4 = v4SqrtPrice(sqrtEnd);
        _checkTiers(p.poolFees, p.tickSpacings, sqrtV4);

        uint256 migrationCoin = migrationCoinFor(quoteToEnd, p.migrationFeeBps, sqrtEnd);
        uint256 needed = curveSupply + migrationCoin + migrationCoin / CORRECTION_DIVISOR;
        if (p.totalSupply < needed || p.totalSupply > type(uint128).max) revert BadSupply(p.totalSupply, needed);

        c.partner = partner;
        c.protocolShareBps = p.protocolShareBps;
        c.partnerShareBps = p.partnerShareBps;
        c.creatorShareBps = p.creatorShareBps;
        c.fees = p.fees;
        c.sqrtStartX96 = p.sqrtStartX96;
        c.segmentCount = uint8(p.segments.length);
        c.migrationQuoteThreshold = quoteToEnd;
        c.sqrtEndX96 = sqrtEnd;
        c.curveSupply = curveSupply;
        c.migrationCoinAmount = migrationCoin;
        c.totalSupply = p.totalSupply;
        c.migrationFeeBps = p.migrationFeeBps;
        c.split = p.split;
        c.vestingCliff = p.vestingCliff;
        c.vestingDuration = p.vestingDuration;
        c.leftoverReceiver = p.leftoverReceiver;
        c.poolFees = p.poolFees;
        c.tickSpacings = p.tickSpacings;
        c.maxCreatorBuyBps = p.maxCreatorBuyBps;
        for (uint256 i; i < p.segments.length; i++) segs.push(p.segments[i]);
    }

    /// @notice The v4 frame flip: pathUSD is currency0 there, so the price inverts (`2^192 / sqrtCurve`).
    function v4SqrtPrice(uint160 sqrtCurveX96) internal pure returns (uint160) {
        uint256 v = (uint256(1) << 192) / sqrtCurveX96;
        if (v > type(uint160).max) revert EndPriceOutOfRange();
        return uint160(v);
    }

    /// @notice Coin that pairs with the migration quote at the end price: `quoteNet · 2^192 / sqrtEnd²`, rounded up.
    function migrationCoinFor(uint256 quote, uint16 migrationFeeBps, uint160 sqrtEnd) internal pure returns (uint256) {
        uint256 quoteNet = quote - quote * PROTOCOL_MIGRATION_BPS / BPS - quote * migrationFeeBps / BPS;
        return FullMath.mulDivRoundingUp(FullMath.mulDivRoundingUp(quoteNet, 1 << 96, sqrtEnd), 1 << 96, sqrtEnd);
    }

    function _checkSplit(LpSplit calldata s, uint32 cliff, uint32 duration) private pure {
        uint256 sum = uint256(s.partnerUnlocked) + s.partnerLocked + s.partnerVesting + s.creatorUnlocked + s.creatorLocked
            + s.creatorVesting;
        if (sum != BPS || uint256(s.partnerLocked) + s.creatorLocked < MIN_LOCKED_BPS) revert BadSplit();
        bool vests = s.partnerVesting != 0 || s.creatorVesting != 0;
        if (duration > MAX_VESTING || cliff > duration || (vests && duration == 0)) revert BadVesting();
    }

    /// @dev Three distinct (fee, tickSpacing) tiers whose full range strictly contains the graduation price.
    function _checkTiers(uint24[3] calldata fees, int24[3] calldata spacings, uint160 sqrtV4) private pure {
        for (uint256 i; i < 3; i++) {
            int24 ts = spacings[i];
            if (fees[i] > MAX_LP_FEE || ts < TickMath.MIN_TICK_SPACING || ts > TickMath.MAX_TICK_SPACING) revert BadTiers();
            for (uint256 j; j < i; j++) if (fees[j] == fees[i] && spacings[j] == ts) revert BadTiers();
            if (
                sqrtV4 <= TickMath.getSqrtPriceAtTick(TickMath.minUsableTick(ts))
                    || sqrtV4 >= TickMath.getSqrtPriceAtTick(TickMath.maxUsableTick(ts))
            ) revert EndPriceOutOfRange();
        }
    }
}
