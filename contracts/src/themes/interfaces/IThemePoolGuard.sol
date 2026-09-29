// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @notice What ThemeRegistry needs from the StockGuardHook (plan B.3.3, S15b): whether `key` is a pool the guard has
///         registered (`registerPool`: currency0 pathUSD, currency1 the mirror, static fee). The registry only lists
///         tokens with such a pool (B.4.1), so every theme trade runs through the guard's band checks.
interface IThemePoolGuard {
    function isGuardedPool(PoolKey calldata key) external view returns (bool);
}
