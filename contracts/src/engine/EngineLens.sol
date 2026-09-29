// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "./EngineStorage.sol";
import {IEngineErrors as E} from "./EngineErrors.sol";
import {IEngineLens, MarketRef, PositionView, OrderView, LevelRaw, TopOfBook} from "./interfaces/IEngineLens.sol";
import {LensSlots as S} from "./libs/LensSlots.sol";
import {PrintLib} from "./libs/PrintLib.sol";
import {LibBit} from "solady/utils/LibBit.sol";
import "./EngineTypes.sol";

/// @notice The two reads the lens needs from the engine.
interface IExtsload {
    function extsload(bytes32 slot) external view returns (bytes32);
    function extsload(bytes32[] calldata slots) external view returns (bytes32[] memory);
}

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/book_walk/mod.rs
// (`levels`, `top_of_book`, the node filter) and state/view.rs; the DreamDEX-shaped reads follow A.2.7.

/// @title Read-only lens over the engine's storage (A.2 "IEngineLens"): market, position, order and book reads, walks
///        that traverse nodes (never `liveLots` alone, which still counts unevicted expired orders — C08:133-135).
/// @dev Separate contract so the engine stays under EIP-170; every value comes from `engine.extsload` over the ERC-7201
///      layout (slot maths in `LensSlots`, proven against storage in `Layout.t.sol`). Walk filter: LIVE,
///      `expireTs > now`, `placedAt + minRestSec ≤ now`; at most `maxNodes` nodes visited.
contract EngineLens is IEngineLens {
    IExtsload private immutable _e;
    uint256 public constant TOP_OF_BOOK_NODES = 256;

    constructor(address engine_) {
        _e = IExtsload(engine_);
    }

    function engine() external view returns (address) {
        return address(_e);
    }

    // ------------------------------------------------------------------------------------------------ engine-wide

    function config() external view returns (Config memory) {
        return S.config(_load(S.cfgSlot()));
    }

    function admin() external view returns (address) {
        return address(uint160(_load(S.adminSlot())));
    }

    function pendingAdmin() external view returns (address) {
        return address(uint160(_load(S.pendingAdminSlot())));
    }

    function isRoller(address who) external view returns (bool) {
        return _load(S.isRollerSlot(who)) != 0;
    }

    function crankOptedOut(address holder) external view returns (bool) {
        return _load(S.crankOptOutSlot(holder)) != 0;
    }

    function seriesCount() external view returns (uint32) {
        return uint32(_load(S.adminSlot()) >> 160);
    }

    function seriesIdAt(uint32 seriesIdx) external view returns (bytes32) {
        return bytes32(_load(S.seriesIdOfSlot(seriesIdx)));
    }

    function marketIdAt(uint32 mIdx) external view returns (bytes32) {
        return bytes32(_load(S.marketIdOfSlot(mIdx)));
    }

    // ------------------------------------------------------------------------------------------------ markets

    function marketOf(bytes32 m) public view returns (Market memory mk) {
        mk = S.market(_loadN(S.marketSlot(m), 6));
        if (mk.mIdx == 0) revert E.UnknownMarket();
    }

    function marketRef(bytes32 m) public view returns (MarketRef memory r) {
        Market memory mk = marketOf(m);
        Series memory s = _series(mk.seriesIdx);
        r.tradingStart = mk.tradingStart;
        r.lockAt = mk.lockAt;
        r.expiry = mk.expiry;
        r.status = _status(mk);
        r.state = mk.state;
        r.lotBase = s.lotBase;
        r.tickBase = s.tickBase;
        r.minLots = s.minLots;
        r.minRestSec = s.minRestSec;
        r.ticker = s.ticker;
        r.seriesId = bytes32(_load(S.seriesIdOfSlot(mk.seriesIdx)));
        r.openE8 = PrintLib.priceE8(mk.open);
        r.closeE8 = PrintLib.priceE8(mk.close);
        r.payoutYes = mk.payoutYes;
        r.payoutNo = mk.payoutNo;
    }

    function marketsOf(bytes32[] calldata ids) external view returns (MarketRef[] memory out) {
        out = new MarketRef[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = marketRef(ids[i]);
    }

    function printOf(bytes32 m, uint8 which) external view returns (Print memory) {
        if (which > WHICH_CHECK_CLOSE) revert E.BadPrintSlot();
        Market memory mk = marketOf(m);
        uint128 v = which == WHICH_OPEN ? mk.open : which == WHICH_CLOSE ? mk.close : which == WHICH_CHECK_OPEN ? mk.checkOpen : mk.checkClose;
        return PrintLib.unpack(v);
    }

    function status(bytes32 m) external view returns (uint8) {
        return _status(marketOf(m));
    }

    function isResolved(bytes32 m) external view returns (bool) {
        return marketOf(m).state == STATE_RESOLVED;
    }

    function isVoided(bytes32 m) external view returns (bool) {
        return marketOf(m).state == STATE_VOIDED;
    }

    function payoutNumerators(bytes32 m) external view returns (uint256[] memory out) {
        Market memory mk = marketOf(m);
        out = new uint256[](2);
        if (mk.state != STATE_OPEN) (out[0], out[1]) = (mk.payoutYes, mk.payoutNo);
    }

    function grid(bytes32 m) external view returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize) {
        Series memory s = _series(marketOf(m).seriesIdx);
        return (s.tickBase, uint256(s.minLots) * s.lotBase, s.lotBase);
    }

    function seriesOf(bytes32 seriesId) external view returns (Series memory) {
        uint32 idx = uint32(_load(S.seriesIdxOfSlot(seriesId)));
        if (idx == 0) revert E.UnknownSeries();
        return _series(idx);
    }

    function policyOf(bytes32 seriesId, uint8 index) external view returns (PolicyVersion memory) {
        uint32 idx = uint32(_load(S.seriesIdxOfSlot(seriesId)));
        if (idx == 0) revert E.UnknownSeries();
        if (index >= _series(idx).versionCount) revert E.UnknownPolicyVersion();
        return S.policyVersion(_loadN(S.versionSlot(idx, index), 7));
    }

    function seriesIdOf(uint16 ticker, uint32 cadenceSec, uint8 basis) external pure returns (bytes32) {
        return EngineStorage.seriesIdOf(ticker, cadenceSec, basis);
    }

    function marketIdOf(bytes32 seriesId, uint64 index) external pure returns (bytes32) {
        return EngineStorage.marketIdOf(seriesId, index);
    }

    // ------------------------------------------------------------------------------------------------ positions, orders

    function positionOf(bytes32 m, address holder) public view returns (PositionView memory v) {
        Position memory p = S.position(_loadN(S.positionSlot(marketOf(m).mIdx, holder), 2));
        v = PositionView(p.credit, p.lockedCash, p.yesFree, p.noFree, p.yesLocked, p.noLocked, p.openOrders);
    }

    function positionsOf(address holder, bytes32[] calldata ids) external view returns (PositionView[] memory out) {
        out = new PositionView[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = positionOf(ids[i], holder);
    }

    function creditOf(bytes32 m, address holder) external view returns (uint64) {
        return uint64(_load(S.positionSlot(marketOf(m).mIdx, holder)));
    }

    /// @notice A live order, or a zeroed view (`orderId == 0`) for a stale or unknown id.
    function orderOf(uint128 orderId) public view returns (OrderView memory v) {
        (uint32 mIdx, uint48 seq, uint32 idx) = EngineStorage.decodeOrderId(orderId);
        if (idx == 0) return v;
        Node memory n = S.node(_loadN(S.nodeSlot(idx), 2));
        if (n.flags & NODE_LIVE == 0 || n.seq != seq) return v;
        v = OrderView(
            orderId,
            bytes32(_load(S.marketIdOfSlot(mIdx))),
            n.owner,
            n.kind,
            n.kind == KIND_BUY_YES || n.kind == KIND_SELL_NO,
            n.price,
            n.lots,
            n.expireTs,
            n.placedAt
        );
    }

    /// @notice The holder's live orders in `m`, newest first (the per-holder list, ≤ 16).
    function openOrdersOf(bytes32 m, address holder) external view returns (OrderView[] memory out) {
        uint32 mIdx = marketOf(m).mIdx;
        Position memory p = S.position(_loadN(S.positionSlot(mIdx, holder), 2));
        out = new OrderView[](p.openOrders);
        uint32 idx = p.orderHead;
        for (uint256 i; i < out.length && idx != 0; ++i) {
            Node memory n = S.node(_loadN(S.nodeSlot(idx), 2));
            out[i] = OrderView(
                EngineStorage.orderIdOf(mIdx, n.seq, idx),
                m,
                n.owner,
                n.kind,
                n.kind == KIND_BUY_YES || n.kind == KIND_SELL_NO,
                n.price,
                n.lots,
                n.expireTs,
                n.placedAt
            );
            idx = n.holderNext;
        }
    }

    // ------------------------------------------------------------------------------------------------ book walks

    /// @notice Up to `n` non-empty filtered levels, best first (bids descending, asks ascending), YES ticks and lots.
    function levels(bytes32 m, bool isBid, uint256 n, uint32 minRestSec, uint256 maxNodes)
        public
        view
        returns (uint16[] memory ticks, uint64[] memory lots)
    {
        uint32 mIdx = marketOf(m).mIdx;
        return _levels(mIdx, isBid, n, minRestSec, maxNodes);
    }

    /// @notice `IBinaryPool.getBookLevels` shape: raw price (ticks × tickBase) and raw quantity (lots × lotBase).
    function levelsRaw(bytes32 m, bool isBid, uint256 n, uint32 minRestSec, uint256 maxNodes)
        external
        view
        returns (LevelRaw[] memory out)
    {
        Market memory mk = marketOf(m);
        Series memory s = _series(mk.seriesIdx);
        (uint16[] memory t, uint64[] memory q) = _levels(mk.mIdx, isBid, n, minRestSec, maxNodes);
        out = new LevelRaw[](t.length);
        for (uint256 i; i < t.length; ++i) out[i] = LevelRaw(uint256(t[i]) * s.tickBase, uint256(q[i]) * s.lotBase);
    }

    function topOfBook(bytes32 m) public view returns (TopOfBook memory top) {
        uint32 mIdx = marketOf(m).mIdx;
        (uint16[] memory bt, uint64[] memory bq) = _levels(mIdx, true, 1, 0, TOP_OF_BOOK_NODES);
        (uint16[] memory at, uint64[] memory aq) = _levels(mIdx, false, 1, 0, TOP_OF_BOOK_NODES);
        if (bt.length != 0) (top.bidTicks, top.bidLots) = (bt[0], bq[0]);
        if (at.length != 0) (top.askTicks, top.askLots) = (at[0], aq[0]);
    }

    function topOfBook(bytes32[] calldata ids) external view returns (TopOfBook[] memory out) {
        out = new TopOfBook[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = topOfBook(ids[i]);
    }

    /// Jumps between set bits (highest first for bids, lowest first for asks), walking each level's FIFO list with the
    /// node filter; levels whose filtered total is 0 are omitted (Agari `levels`).
    function _levels(uint32 mIdx, bool isBid, uint256 n, uint32 minRestSec, uint256 maxNodes)
        private
        view
        returns (uint16[] memory ticks, uint64[] memory lots)
    {
        ticks = new uint16[](n);
        lots = new uint64[](n);
        uint256 found;
        uint256 side = isBid ? 0 : 1;
        uint256[] memory words = _loadN(S.bitsSlot(mIdx, side), 4);
        Walk memory w = Walk(maxNodes, block.timestamp, minRestSec);
        for (uint256 k; k < 4 && found < n && w.budget != 0; ++k) {
            uint256 wi = isBid ? 3 - k : k;
            uint256 word = words[wi];
            while (word != 0 && found < n && w.budget != 0) {
                uint256 b = isBid ? LibBit.fls(word) : LibBit.ffs(word); // word != 0 (D-054)
                word &= ~(uint256(1) << b);
                uint16 price = uint16(wi * 256 + b);
                if (price < MIN_PRICE_TICKS || price > MAX_PRICE_TICKS) continue;
                uint64 q = _levelLots(mIdx, side, price, w);
                if (q != 0) (ticks[found], lots[found], found) = (price, q, found + 1);
            }
        }
        assembly ("memory-safe") {
            mstore(ticks, found)
            mstore(lots, found)
        }
    }

    struct Walk {
        uint256 budget;
        uint256 nowTs;
        uint32 minRestSec;
    }

    function _levelLots(uint32 mIdx, uint256 side, uint16 price, Walk memory w) private view returns (uint64 total) {
        uint32 r = S.level(_load(S.levelSlot(mIdx, side, price))).head;
        while (r != 0 && w.budget != 0) {
            --w.budget;
            Node memory nd = S.node(_loadN(S.nodeSlot(r), 2));
            if (nd.flags & NODE_LIVE != 0 && nd.expireTs > w.nowTs && uint256(nd.placedAt) + w.minRestSec <= w.nowTs) {
                total += nd.lots;
            }
            r = nd.next;
        }
    }

    // ------------------------------------------------------------------------------------------------ helpers

    function _status(Market memory mk) private view returns (uint8) {
        if (mk.state == STATE_RESOLVED) return STATUS_RESOLVED;
        if (mk.state == STATE_VOIDED) return STATUS_VOIDED;
        if (block.timestamp < mk.tradingStart) return STATUS_LISTED;
        if (block.timestamp < mk.lockAt) return STATUS_TRADING;
        return STATUS_LOCKED;
    }

    function _series(uint32 idx) private view returns (Series memory) {
        return S.series(_loadN(S.seriesSlot(idx), 2));
    }

    function _load(bytes32 slot) private view returns (uint256) {
        return uint256(_e.extsload(slot));
    }

    function _loadN(bytes32 first, uint256 n) private view returns (uint256[] memory out) {
        bytes32[] memory slots = new bytes32[](n);
        for (uint256 i; i < n; ++i) slots[i] = bytes32(uint256(first) + i);
        bytes32[] memory raw = _e.extsload(slots);
        out = new uint256[](n);
        for (uint256 i; i < n; ++i) out[i] = uint256(raw[i]);
    }
}
