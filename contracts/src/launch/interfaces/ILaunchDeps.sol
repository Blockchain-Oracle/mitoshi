// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LpSplit} from "../CurveTypes.sol";

/// @notice The two LaunchRegistry calls the launchpad makes (S17a, `src/launch/LaunchRegistry.sol`).
interface ILaunchRegistryForCurve {
    function recordMemecoin(address token, address creator, string calldata metadataURI) external returns (uint256);
    function isReservedCode(string memory code) external view returns (bool);
}

/// @notice The subset of the pinned v4 PositionManager `0x3fc7…ce11` the graduation uses (v4-periphery MIT ABI; the
///         contract itself is never compiled here — it is the replayed mainnet runtime on Moderato). Declared
///         non-payable: the real functions are payable, but Tempo has no native value and we never send any.
interface IPositionManagerLite {
    function multicall(bytes[] calldata data) external returns (bytes[] memory results);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external;
    function initializePool(PoolKeyLite calldata key, uint160 sqrtPriceX96) external returns (int24);
    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
}

/// @dev Same layout as v4-core's `PoolKey` (Currency and IHooks are address-sized).
struct PoolKeyLite {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice What the launchpad tells the LiquidityLocker when it hands over a graduated position.
interface ILiquidityLocker {
    function register(
        address coin,
        uint256 positionId,
        uint128 liquidity,
        address partner,
        address creator,
        LpSplit calldata split,
        uint32 vestingCliff,
        uint32 vestingDuration
    ) external;
}
