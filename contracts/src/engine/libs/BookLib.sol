// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LibBit} from "solady/utils/LibBit.sol";
import {EngineStorage} from "../EngineStorage.sol";
import {Config, Level, Node, Position, KIND_BUY_YES, KIND_SELL_NO, MAX_PRICE_TICKS, NODE_FREED, NODE_LIVE} from
    "../EngineTypes.sol";
import {IEngineErrors} from "../EngineErrors.sol";
import {IEventsEngineEvents} from "../interfaces/IEventsEngineEvents.sol";
import {PositionLib} from "./PositionLib.sol";

/// @notice The market a call works on, and the `seq` its events carry (0 until taken).
struct MarketCtx {
    bytes32 marketId;
    uint32 mIdx;
    uint48 seq;
    uint64 cu;
    uint40 now;
}

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/book/{ladder.rs,slab.rs}
// (reshaped: per-market levels + a global recycled node pool, A.1.3–A.1.5).

/// @title Price levels, bitmaps, the recycled node pool and the per-holder order list.
/// @dev A level is a FIFO doubly linked list of node indices (oldest → newest); its bitmap bit is set iff it holds a
///      node. An emptied level is zeroed (not sentinelled: it mints a storage credit, A.1.4). A freed node keeps
///      `flags = FREED` and `expireTs = 0xFFFFFFFF`, so both of its slots stay non-zero and reuse costs a rewrite
///      (non-zero → non-zero) instead of two new slots (A.1.3).
library BookLib {
    uint256 internal constant BID = 0;
    uint256 internal constant ASK = 1;

    /// @notice Bid side: BUY_YES and SELL_NO. Ask side: SELL_YES and BUY_NO.
    function sideOf(uint8 kind) internal pure returns (uint256) {
        return (kind == KIND_BUY_YES || kind == KIND_SELL_NO) ? BID : ASK;
    }

    // ------------------------------------------------------------------------------------------------ bitmap

    function setBit(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint16 price, bool on) internal {
        uint256 w = side * 4 + (uint256(price) >> 8);
        uint256 mask = uint256(1) << (uint256(price) & 255);
        uint256 word = l.bits[mIdx][w];
        l.bits[mIdx][w] = on ? word | mask : word & ~mask;
    }

    function bitIsSet(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint16 price) internal view returns (bool) {
        return l.bits[mIdx][side * 4 + (uint256(price) >> 8)] & (uint256(1) << (uint256(price) & 255)) != 0;
    }

    /// @notice Lowest non-empty price `≥ at` on `side` (asks walk up from the best ask); 0 = none (prices are 1..999).
    ///         Solady `ffs(0) = 256`, so empty words are skipped explicitly (D-054).
    function lowestAtOrAbove(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint256 at)
        internal
        view
        returns (uint16 price)
    {
        if (at > MAX_PRICE_TICKS) return 0;
        uint256 w = at >> 8;
        uint256 word = l.bits[mIdx][side * 4 + w] & (type(uint256).max << (at & 255));
        for (;;) {
            if (word != 0) {
                uint256 p = (w << 8) + LibBit.ffs(word);
                // forge-lint: disable-next-line(unsafe-typecast)
                return p <= MAX_PRICE_TICKS ? uint16(p) : 0;
            }
            if (++w == 4) return 0;
            word = l.bits[mIdx][side * 4 + w];
        }
    }

    /// @notice Highest non-empty price `≤ at` on `side` (bids walk down from the best bid); 0 = none. Solady
    ///         `fls(0) = 256`, so empty words are skipped explicitly.
    function highestAtOrBelow(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint256 at)
        internal
        view
        returns (uint16 price)
    {
        if (at > MAX_PRICE_TICKS) at = MAX_PRICE_TICKS;
        uint256 w = at >> 8;
        uint256 b = at & 255;
        uint256 mask = b == 255 ? type(uint256).max : (uint256(1) << (b + 1)) - 1;
        uint256 word = l.bits[mIdx][side * 4 + w] & mask;
        for (;;) {
            // forge-lint: disable-next-line(unsafe-typecast)
            if (word != 0) return uint16((w << 8) + LibBit.fls(word));
            if (w == 0) return 0;
            word = l.bits[mIdx][side * 4 + --w];
        }
    }

    // ------------------------------------------------------------------------------------------------ levels

    /// @notice Appends node `idx` (holding `lots`) at the tail of its level, so it queues behind every older order.
    ///         Returns the previous tail, which the caller stores as the node's `prev`.
    function linkTail(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint16 price, uint32 idx, uint64 lots)
        internal
        returns (uint32 tail)
    {
        Level storage lv = l.levels[EngineStorage.levelKey(mIdx, side, price)];
        tail = lv.tail;
        if (tail == 0) {
            lv.head = idx;
            setBit(l, mIdx, side, price, true);
        } else {
            l.nodes[tail].next = idx;
        }
        lv.tail = idx;
        lv.liveLots += lots;
    }

    /// @notice Unlinks node `idx` (with its `prev`, `next` and remaining `lots`) from its level; an emptied level is
    ///         zeroed and its bit cleared. The node itself is left for the caller to release.
    function unlink(
        EngineStorage.Layout storage l,
        uint32 mIdx,
        uint256 side,
        uint16 price,
        uint32 prev,
        uint32 next,
        uint64 lots
    ) internal {
        Level storage lv = l.levels[EngineStorage.levelKey(mIdx, side, price)];
        if (prev == 0 && next == 0) {
            delete l.levels[EngineStorage.levelKey(mIdx, side, price)];
            setBit(l, mIdx, side, price, false);
            return;
        }
        if (prev == 0) lv.head = next;
        else l.nodes[prev].next = next;
        if (next == 0) lv.tail = prev;
        else l.nodes[next].prev = prev;
        lv.liveLots -= lots;
    }

    /// @notice Reduces a linked node's lots in place (queue position kept), keeping the level total in step.
    function shrink(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint16 price, uint32 idx, uint64 by) internal {
        l.nodes[idx].lots -= by;
        l.levels[EngineStorage.levelKey(mIdx, side, price)].liveLots -= by;
    }

    // ------------------------------------------------------------------------------------------------ node pool

    /// @notice Pops the free list, else takes a never-used index (`BookFull` only when uint32 is exhausted). The caller
    ///         overwrites the whole node.
    function alloc(EngineStorage.Layout storage l) internal returns (uint32 idx) {
        Config storage c = l.cfg;
        idx = c.freeHead;
        if (idx != 0) {
            c.freeHead = l.nodes[idx].next;
            return idx;
        }
        uint32 hw = c.highWater;
        if (hw == type(uint32).max) revert IEngineErrors.BookFull();
        c.highWater = hw + 1;
        return hw + 1;
    }

    /// @notice Returns node `idx` to the free list as a FREED sentinel (both slots non-zero).
    function release(EngineStorage.Layout storage l, uint32 idx) internal {
        Config storage c = l.cfg;
        l.nodes[idx] = _freed(c.freeHead);
        c.freeHead = idx;
    }

    /// @notice Pre-grows the pool by `n` FREED nodes (each two new slots, paid once by whoever reserves).
    function reserve(EngineStorage.Layout storage l, uint32 n) internal returns (uint32 highWater) {
        Config storage c = l.cfg;
        highWater = c.highWater;
        uint32 head = c.freeHead;
        if (uint256(highWater) + n > type(uint32).max) revert IEngineErrors.BookFull();
        for (uint32 i; i < n; ++i) {
            ++highWater;
            l.nodes[highWater] = _freed(head);
            head = highWater;
        }
        c.highWater = highWater;
        c.freeHead = head;
    }

    function _freed(uint32 next) private pure returns (Node memory n) {
        n.flags = NODE_FREED;
        n.expireTs = type(uint32).max;
        n.next = next;
    }

    // ------------------------------------------------------------------------------------------------ holder list

    /// @notice Makes node `idx` the head of the holder's order list; returns the old head (the node's `holderNext`).
    function holderPush(EngineStorage.Layout storage l, Position storage pos, uint32 idx) internal returns (uint32 oldHead) {
        oldHead = pos.orderHead;
        if (oldHead != 0) l.nodes[oldHead].holderPrev = idx;
        pos.orderHead = idx;
    }

    /// @notice Removes a node (with its `holderPrev`, `holderNext`) from the holder's order list.
    function holderUnlink(EngineStorage.Layout storage l, Position storage pos, uint32 hPrev, uint32 hNext) internal {
        if (hPrev == 0) pos.orderHead = hNext;
        else l.nodes[hPrev].holderNext = hNext;
        if (hNext != 0) l.nodes[hNext].holderPrev = hPrev;
    }

    // ------------------------------------------------------------------------------------------------ orders

    /// @notice True when `idx` names a LIVE node whose sequence is `seq` (a stale handle is simply not live).
    function isLive(EngineStorage.Layout storage l, uint32 idx, uint48 seq) internal view returns (bool) {
        if (idx == 0 || idx > l.cfg.highWater) return false;
        Node storage n = l.nodes[idx];
        return n.flags & NODE_LIVE != 0 && n.seq == seq;
    }

    /// @notice Removes live node `idx`: unlinks it from its level and its owner's list, refunds its escrow to the owner
    ///         (buy escrow → credit, sell lots → free), frees it and emits `OrderRemoved` (E-35). Eviction, self-match
    ///         cancel, user cancel, cancel-all, sweep and the redeem drain all come here, so the refund rule exists once.
    function removeOrder(EngineStorage.Layout storage l, MarketCtx memory c, uint32 idx, uint8 reason) internal {
        Node memory n = l.nodes[idx];
        unlink(l, c.mIdx, sideOf(n.kind), n.price, n.prev, n.next, n.lots);
        Position storage pos = l.positions[c.mIdx][n.owner];
        holderUnlink(l, pos, n.holderPrev, n.holderNext);
        pos.openOrders -= 1;
        PositionLib.refundEscrow(pos, n.kind, n.price, n.lots, c.cu);
        release(l, idx);
        l.markets[c.marketId].orderCount -= 1;
        emit IEventsEngineEvents.OrderRemoved(
            c.marketId, c.seq, n.owner, EngineStorage.orderIdOf(c.mIdx, n.seq, idx), n.kind, n.price, n.lots, reason
        );
    }
}

