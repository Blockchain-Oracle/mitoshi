// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PlaceArgs, PlaceResult, OpenWindowArgs, RegisterSeriesArgs, PolicyVersion} from "../EngineTypes.sol";
import {IEngineErrors} from "../EngineErrors.sol";
import {IEventsEngineEvents} from "./IEventsEngineEvents.sol";

/// @title The engine's native ABI (A.2, frozen at `engine-abi-v1`). Every write pays `msg.sender` only; the one
///        exception is `redeemFor`, which pays the holder it names (never a caller-chosen destination).
interface IEventsEngine is IEngineErrors, IEventsEngineEvents {
    // ---- trading ----
    /// @notice Places an order (E-27 check order). Returns the result **and** emits it in `OrderExecuted`.
    function placeOrder(PlaceArgs calldata a) external returns (PlaceResult memory);

    /// @notice Cancels up to 16 of the caller's order ids in market `m`; stale ids are skipped; a live id of another
    ///         holder → `NotOrderOwner`, of another market → `OrderMarketMismatch`. Every status and mode.
    function cancelOrders(bytes32 m, uint128[] calldata ids, bool withdraw) external returns (uint256 removed, uint64 withdrawn);

    /// @notice Shrinks a live order in place, keeping queue priority (`minLots ≤ newLots < lots`).
    function reduceOrder(bytes32 m, uint128 id, uint64 newLots) external;

    /// @notice Cancels up to `max` (1..32) of the caller's orders in `m` through the per-holder list.
    function cancelAll(bytes32 m, uint8 max, bool withdraw) external returns (uint256 removed, uint64 withdrawn);

    /// @notice Permissionless keeper: evicts up to `max` (1..32) expired orders, or every order once `now ≥ lockAt`
    ///         or the market is terminal. Nothing to do is a success.
    function sweepExpired(bytes32 m, uint8 max) external returns (uint256 removed);

    // ---- sets and cash ----
    function mintSet(bytes32 m, uint64 lots, bool useCredit) external returns (uint64 transferredIn);
    function mergeSet(bytes32 m, uint64 lots, bool withdraw) external returns (uint64 cash, uint64 withdrawn);
    function withdrawCredit(bytes32 m, uint64 amount) external;

    // ---- prints and settlement (permissionless) ----
    function recordPrint(bytes32 m, uint8 which, bytes calldata proof) external;
    function copyOpenFromPrev(bytes32 m, bytes32 prev) external;
    function settle(bytes32 m) external;
    function voidExpired(bytes32 m) external;

    // ---- redemption ----
    /// @notice Full redeem of the caller's position; drains the caller's own resting orders first (T05).
    function redeem(bytes32 m) external returns (uint64 total);
    /// @notice Redeems `lots` of one outcome (0 YES, 1 NO) from the caller's free balance; any holder (T04, E-54).
    function redeemPartial(bytes32 m, uint8 outcome, uint64 lots) external returns (uint64 payout);
    /// @notice Permissionless crank paying `holder`; a blocked payout is held as the holder's credit (P12, D-014).
    function redeemFor(bytes32 m, address holder) external returns (uint64 paid, bool heldAsCredit);
    /// @notice Refuse (`CrankRefused`) third-party `redeemFor` of the caller's positions (T09, D-015).
    function setCrankOptOut(bool on) external;

    // ---- roller and admin ----
    function openWindow(OpenWindowArgs calldata a) external returns (bytes32 marketId);
    function registerSeries(RegisterSeriesArgs calldata a) external returns (bytes32 seriesId);
    function addPolicyVersion(bytes32 seriesId, uint8 index, PolicyVersion calldata v) external;
    function setMode(uint8 mode) external;
    function setRoller(address roller, bool enabled) external;
    function transferAdmin(address next) external;
    function acceptAdmin() external;

    // ---- pool, surplus, reads ----
    /// @notice Permissionless: pre-grows the node pool by `n` freed nodes (the house pays the new slots once).
    function reserveNodes(uint32 n) external;
    /// @notice Sends `balanceOf(engine) − totalOwed` (donations) to the immutable treasury.
    function sweepSurplus() external returns (uint256 amount);
    function extsload(bytes32 slot) external view returns (bytes32);
    function extsload(bytes32[] calldata slots) external view returns (bytes32[] memory);
    function collateral() external view returns (address);
    function treasury() external view returns (address);
}
