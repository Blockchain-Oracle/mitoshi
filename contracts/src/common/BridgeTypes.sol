// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Why a bridge credit did not reach its recipient (plan B.1.1). Order matters: `TIP20MintBurnAdapter`
///         evaluates the reasons in this order and reports the first that applies (B.1.4).
enum DeferReason {
    NONE,
    INVALID_RECIPIENT,
    TOKEN_PAUSED,
    POLICY,
    SUPPLY_CAP,
    RATE_LIMIT,
    RECEIVE_POLICY,
    CALL_REVERTED
}

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
