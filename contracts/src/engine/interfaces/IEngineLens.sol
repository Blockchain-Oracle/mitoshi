// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Config, Market, Series, PolicyVersion, Print} from "../EngineTypes.sol";

/// @notice The DreamDEX-shaped market reference products read (A.2.7 `markets(id)`).
struct MarketRef {
    uint40 tradingStart;
    uint40 lockAt; // trading-time checks and order expiry clamps
    uint40 expiry; // settlement
    uint8 status; // DreamDEX numbering (Listed 0 … Resolved 4, Voided 5)
    uint8 state;
    uint64 lotBase;
    uint64 tickBase;
    uint64 minLots;
    uint32 minRestSec;
    uint16 ticker;
    bytes32 seriesId;
    int64 openE8; // 0 while the slot is empty
    int64 closeE8;
    uint32 payoutYes;
    uint32 payoutNo;
}

/// @notice A holder's balances in one market (lots and base units).
struct PositionView {
    uint64 credit;
    uint64 lockedCash;
    uint64 yesFree;
    uint64 noFree;
    uint64 yesLocked;
    uint64 noLocked;
    uint16 openOrders;
}

/// @notice One live order (`IBinaryPool.getOrder` equivalent, engine units).
struct OrderView {
    uint128 orderId;
    bytes32 marketId;
    address owner;
    uint8 kind;
    bool isBid;
    uint16 priceTicks;
    uint64 lots;
    uint32 expireTs;
    uint32 placedAt;
}

/// @notice `IBinaryPool.Level` field for field: raw price (ticks × tickBase) and raw quantity (lots × lotBase).
struct LevelRaw {
    uint256 price;
    uint256 quantity;
}

/// @notice Best filtered bid and ask (0 when a side is empty).
struct TopOfBook {
    uint16 bidTicks;
    uint64 bidLots;
    uint16 askTicks;
    uint64 askLots;
}

/// @title Read-only lens over the engine's storage via `extsload` (A.2 "IEngineLens"). Walks traverse nodes with the
///        filter LIVE, `expireTs > now`, `placedAt + minRestSec ≤ now`, and visit at most `maxNodes` nodes.
interface IEngineLens {
    function engine() external view returns (address);

    // ---- engine-wide (ops, deploy scripts' drift checks) ----
    function config() external view returns (Config memory);
    function admin() external view returns (address);
    function pendingAdmin() external view returns (address);
    function isRoller(address who) external view returns (bool);
    function crankOptedOut(address holder) external view returns (bool);
    function seriesCount() external view returns (uint32);
    function seriesIdAt(uint32 seriesIdx) external view returns (bytes32);
    function marketIdAt(uint32 mIdx) external view returns (bytes32);

    function marketRef(bytes32 m) external view returns (MarketRef memory);
    function marketsOf(bytes32[] calldata ids) external view returns (MarketRef[] memory);
    function marketOf(bytes32 m) external view returns (Market memory);
    function printOf(bytes32 m, uint8 which) external view returns (Print memory);
    function status(bytes32 m) external view returns (uint8);
    function isResolved(bytes32 m) external view returns (bool);
    function isVoided(bytes32 m) external view returns (bool);
    /// @return Two numerators over 1e7 (YES, NO); (0, 0) before the market is terminal.
    function payoutNumerators(bytes32 m) external view returns (uint256[] memory);

    function positionOf(bytes32 m, address holder) external view returns (PositionView memory);
    function positionsOf(address holder, bytes32[] calldata ids) external view returns (PositionView[] memory);
    function creditOf(bytes32 m, address holder) external view returns (uint64);
    function orderOf(uint128 orderId) external view returns (OrderView memory);
    function openOrdersOf(bytes32 m, address holder) external view returns (OrderView[] memory);

    function levels(bytes32 m, bool isBid, uint256 n, uint32 minRestSec, uint256 maxNodes)
        external
        view
        returns (uint16[] memory ticks, uint64[] memory lots);
    function levelsRaw(bytes32 m, bool isBid, uint256 n, uint32 minRestSec, uint256 maxNodes)
        external
        view
        returns (LevelRaw[] memory);
    function topOfBook(bytes32 m) external view returns (TopOfBook memory);
    function topOfBook(bytes32[] calldata ids) external view returns (TopOfBook[] memory);
    /// @return tickSize = tickBase, minQuantity = minLots × lotBase, lotSize = lotBase (DreamDEX order).
    function grid(bytes32 m) external view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize);

    function seriesOf(bytes32 seriesId) external view returns (Series memory);
    function policyOf(bytes32 seriesId, uint8 index) external view returns (PolicyVersion memory);
    function seriesIdOf(uint16 ticker, uint32 cadenceSec, uint8 basis) external pure returns (bytes32);
    function marketIdOf(bytes32 seriesId, uint64 index) external pure returns (bytes32);
}
