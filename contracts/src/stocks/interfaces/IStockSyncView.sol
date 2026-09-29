// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The StockSyncReceiver views the guard reads (plan B.1.4): the multiplier in effect, the pending one and its
///         `effectiveAt` (the corporate-action window), the Robinhood status flags (`SyncFlags`), and sync freshness.
interface IStockSyncView {
    function uiMultiplierOf(address mirror) external view returns (uint256);
    function pendingOf(address mirror) external view returns (uint256 pending, uint256 effectiveAt);
    function flagsOf(address mirror) external view returns (uint8);
    function isSynced(address mirror, uint256 maxAge) external view returns (bool);
}
