// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice StockSync status flags (plan B.1.1, record type 0x02).
library SyncFlags {
    uint8 internal constant TOKEN_PAUSED = 1 << 0;
    uint8 internal constant REGISTRY_PAUSED = 1 << 1;
    uint8 internal constant ORACLE_PAUSED = 1 << 2;
    uint8 internal constant ORACLE_SUPPORTED = 1 << 3;
    uint8 internal constant LOCKBOX_BLOCKED = 1 << 4;
    uint8 internal constant TOKEN_PAUSED_SUPPORTED = 1 << 5;

    /// @notice Either pause on the source makes the Stock Token untransferable there.
    function isPaused(uint8 flags) internal pure returns (bool) {
        return flags & (TOKEN_PAUSED | REGISTRY_PAUSED) != 0;
    }
}
