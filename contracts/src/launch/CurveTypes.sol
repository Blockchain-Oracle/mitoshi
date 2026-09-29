// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title CurveTypes
/// @notice Shared types of the memecoin launchpad (plan B.5.2, D-024). Mechanism design after Meteora DBC
///         (`context/tempo/06-bonding-curve-design-reference.md`), reimplemented for TIP-20 + Uniswap v4; no DBC code.
///
/// Curve frame: token0 = the coin, token1 = pathUSD, so `price = pathUSD per coin = (sqrtPriceX96 / 2^96)^2` in raw
/// units (both have 6 decimals). A buy pays pathUSD in and moves the price up; a sell pays coin in and moves it down.
/// The v4 pool frame is flipped (pathUSD `0x20c0…0000` is always currency0), so `sqrtV4 = 2^192 / sqrtCurve`.

/// @notice One constant-liquidity piece of the curve, from the previous upper bound (or `sqrtStart`) up to this one.
struct Segment {
    uint160 sqrtPriceUpperX96;
    uint128 liquidity;
}

/// @notice Anti-snipe fee schedule, in bps of the pathUSD side. Mode 0 (linear): `start − reduction·n`; mode 1
///         (exponential): `start·(1 − reduction/10⁴)ⁿ`, where `n = ⌊elapsed / period⌋`; never below `base`.
struct FeeSchedule {
    uint16 base;
    uint16 start;
    uint32 period;
    uint16 reduction;
    uint8 mode;
}

/// @notice Liquidity split after graduation, in bps; Σ = 10,000 and partnerLocked + creatorLocked ≥ 1,000 (DBC).
struct LpSplit {
    uint16 partnerUnlocked;
    uint16 partnerLocked;
    uint16 partnerVesting;
    uint16 creatorUnlocked;
    uint16 creatorLocked;
    uint16 creatorVesting;
}

/// @notice The inputs a partner publishes as a reusable launch template (the rest is derived by `createConfig`).
struct ConfigParams {
    uint16 protocolShareBps;
    uint16 partnerShareBps;
    uint16 creatorShareBps;
    FeeSchedule fees;
    uint160 sqrtStartX96;
    Segment[] segments;
    uint256 migrationQuoteThreshold;
    uint256 totalSupply;
    uint16 migrationFeeBps;
    LpSplit split;
    uint32 vestingCliff;
    uint32 vestingDuration;
    address leftoverReceiver;
    uint24[3] poolFees;
    int24[3] tickSpacings;
    uint16 maxCreatorBuyBps;
}

/// @notice A stored template. `sqrtEnd`, `curveSupply` and `migrationCoinAmount` are derived on creation.
struct Config {
    address partner;
    uint16 protocolShareBps;
    uint16 partnerShareBps;
    uint16 creatorShareBps;
    FeeSchedule fees;
    uint160 sqrtStartX96;
    uint8 segmentCount;
    uint256 migrationQuoteThreshold;
    uint160 sqrtEndX96;
    uint256 curveSupply;
    uint256 migrationCoinAmount;
    uint256 totalSupply;
    uint16 migrationFeeBps;
    LpSplit split;
    uint32 vestingCliff;
    uint32 vestingDuration;
    address leftoverReceiver;
    uint24[3] poolFees;
    int24[3] tickSpacings;
    uint16 maxCreatorBuyBps;
}

enum LaunchState {
    None,
    Trading,
    Complete,
    Graduated
}

struct Launch {
    address token;
    uint32 configId;
    LaunchState state;
    uint40 createdAt;
    uint8 segment;
    uint160 sqrtPriceX96;
    uint256 quoteReserve;
    uint256 coinSold;
    address creator;
}

/// @notice What graduation produced: the v4 pool tier used, the locker's position and the leftover owed.
struct Graduation {
    uint8 tier;
    uint40 graduatedAt;
    uint256 positionId;
    uint128 liquidity;
    uint256 leftover;
}
