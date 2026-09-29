// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../EngineStorage.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../interfaces/IEventsEngineEvents.sol";
import {BookLib, MarketCtx} from "./BookLib.sol";
import {PositionLib} from "./PositionLib.sol";
import {Grid} from "./Grid.sol";
import "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/{engine.rs,place.rs}
// (`run`, `fill`, `rest_order`).

/// @notice Budgets and results of one match walk (Agari `MatchOutcome`), plus the market counters it accumulates.
struct Walk {
    address taker;
    uint8 kind;
    bool bid;
    bool crossCheck; // PostOnly: never fill, refuse on any live crossing order
    uint8 selfMatch;
    uint16 limit;
    uint8 maxFills;
    uint8 maxEvictions;
    uint64 remaining;
    uint64 filled;
    uint64 cashSpent;
    uint64 cashReceived;
    uint8 fills;
    uint8 evictions;
    uint8 selfCancels;
    uint8 skips;
    uint8 pathMask;
    uint8 stop;
    // market counters, written once after the walk
    int256 backingDelta;
    uint64 volumeLots;
    uint64 volumeCash;
    uint16 lastPrice;
}

/// @title The match loop, fills and rests (E-28…E-32), inlined into `MatchLib`.
library MatchCore {
    /// The match loop (E-28) and the PostOnly cross walk (E-30), one function in two modes so the walk can never
    /// disagree with what matching would have done. Levels best-first while they cross; nodes FIFO.
    function run(EngineStorage.Layout storage l, MarketCtx memory c, Walk memory w) internal {
        uint256 opp = w.bid ? BookLib.ASK : BookLib.BID;
        uint16 price = nextLevel(l, c.mIdx, w, 0);
        while (price != 0) {
            uint32 r = l.levels[EngineStorage.levelKey(c.mIdx, opp, price)].head;
            while (r != 0) {
                if (w.remaining == 0) {
                    w.stop = STOP_FILLED;
                    return;
                }
                Node memory n = l.nodes[r];
                uint32 next = n.next;
                if (n.expireTs <= c.now) {
                    if (w.evictions < w.maxEvictions) {
                        BookLib.removeOrder(l, c, r, REMOVE_EXPIRED);
                        ++w.evictions;
                    } else if (++w.skips == MAX_SKIPS) {
                        w.stop = STOP_SKIP_CAP;
                        return;
                    }
                    r = next;
                    continue;
                }
                if (w.crossCheck) revert E.PostOnlyWouldCross();
                if (n.owner == w.taker) {
                    if (w.selfMatch == SELF_CANCEL_TAKER) revert E.SelfMatchCancelTaker();
                    if (w.fills + w.selfCancels == w.maxFills) {
                        w.stop = STOP_FILL_CAP;
                        return;
                    }
                    BookLib.removeOrder(l, c, r, REMOVE_SELF_MATCH);
                    ++w.selfCancels;
                    r = next;
                    continue;
                }
                if (w.fills + w.selfCancels == w.maxFills) {
                    w.stop = STOP_FILL_CAP;
                    return;
                }
                fill(l, c, w, r, n, price);
                r = next;
            }
            price = nextLevel(l, c.mIdx, w, price);
        }
        if (w.remaining == 0) w.stop = STOP_FILLED;
    }

    /// The next opposite-side level after `from` (the best one when `from == 0`), or 0 once it no longer crosses.
    function nextLevel(EngineStorage.Layout storage l, uint32 mIdx, Walk memory w, uint16 from) internal view returns (uint16 p) {
        if (w.bid) {
            if (from >= MAX_PRICE_TICKS) return 0;
            p = BookLib.lowestAtOrAbove(l, mIdx, BookLib.ASK, from == 0 ? MIN_PRICE_TICKS : from + 1);
            return (p != 0 && p <= w.limit) ? p : 0;
        }
        if (from == MIN_PRICE_TICKS) return 0;
        p = BookLib.highestAtOrBelow(l, mIdx, BookLib.BID, from == 0 ? MAX_PRICE_TICKS : from - 1);
        return (p != 0 && p >= w.limit) ? p : 0;
    }

    /// One fill of `q = min(remaining, node.lots)` against maker node `r` at the maker's price (E-03): the maker's
    /// position, the node and its level now; the taker's outcome and the market counters once, after the walk.
    function fill(EngineStorage.Layout storage l, MarketCtx memory c, Walk memory w, uint32 r, Node memory n, uint16 price)
        internal
    {
        uint64 q = w.remaining < n.lots ? w.remaining : n.lots;
        uint8 path = pathOf(w.kind, n.kind);
        Position storage maker = l.positions[c.mIdx][n.owner];
        PositionLib.applyMaker(maker, n.kind, price, q, c.cu);
        uint64 makerRemaining = n.lots - q;
        if (makerRemaining == 0) {
            maker.openOrders -= 1;
            BookLib.unlink(l, c.mIdx, BookLib.sideOf(n.kind), price, n.prev, n.next, n.lots);
            BookLib.holderUnlink(l, maker, n.holderPrev, n.holderNext);
            BookLib.release(l, r);
            l.markets[c.marketId].orderCount -= 1;
        } else {
            BookLib.shrink(l, c.mIdx, BookLib.sideOf(n.kind), price, r, q);
        }

        uint64 cash = Grid.cashOf(w.kind, price, q, c.cu);
        if (PositionLib.isBuy(w.kind)) w.cashSpent += cash;
        else w.cashReceived += cash;
        if (path == PATH_MINT_PAIR) w.backingDelta += int256(uint256(q));
        else if (path == PATH_BURN_PAIR) w.backingDelta -= int256(uint256(q));
        w.volumeLots += q;
        w.volumeCash += Grid.yesCash(q, price, c.cu);
        w.lastPrice = price;
        w.filled += q;
        w.remaining -= q;
        ++w.fills;
        w.pathMask |= uint8(1 << path);
        emit Ev.Fill(
            c.marketId, c.seq, n.owner, w.taker, EngineStorage.orderIdOf(c.mIdx, n.seq, r), n.kind, w.kind, path, price, q, makerRemaining
        );
    }

    /// The path a taker × maker cross takes; both kinds are opposite sides by construction.
    function pathOf(uint8 taker, uint8 maker) internal pure returns (uint8) {
        bool takerYes = taker == KIND_BUY_YES || taker == KIND_SELL_YES;
        bool makerYes = maker == KIND_BUY_YES || maker == KIND_SELL_YES;
        if (takerYes && makerYes) return PATH_DIRECT_YES;
        if (!takerYes && !makerYes) return PATH_DIRECT_NO;
        return PositionLib.isBuy(taker) ? PATH_MINT_PAIR : PATH_BURN_PAIR;
    }

    function applyCounters(Market storage mk, Walk memory w) internal {
        if (w.fills == 0) return;
        mk.backingLots = uint64(uint256(int256(uint256(mk.backingLots)) + w.backingDelta));
        mk.volumeLots += w.volumeLots;
        mk.volumeCash += w.volumeCash;
        mk.tradeCount += w.fills;
        mk.lastPrice = w.lastPrice;
        mk.lastTradeTs = uint40(block.timestamp);
    }

    /// Rests `lots` at the tail of its level, locking its escrow (E-32).
    function rest(EngineStorage.Layout storage l, MarketCtx memory c, Position storage pos, PlaceArgs calldata a, uint64 lots)
        internal
        returns (uint128)
    {
        if (pos.openOrders >= MAX_OPEN_ORDERS) revert E.TooManyOpenOrders();
        uint32 idx = BookLib.alloc(l);
        uint32 prev = BookLib.linkTail(l, c.mIdx, BookLib.sideOf(a.kind), a.priceTicks, idx, lots);
        uint32 oldHead = BookLib.holderPush(l, pos, idx);
        uint48 seq = ++l.cfg.nextSeq;
        l.nodes[idx] = Node({
            owner: msg.sender,
            lots: lots,
            price: a.priceTicks,
            kind: a.kind,
            flags: NODE_LIVE,
            seq: seq,
            // expireTs ≤ lockAt, and openWindow keeps lockAt within uint32 (BadHorizon).
            // forge-lint: disable-next-line(unsafe-typecast)
            expireTs: uint32(a.expireTs),
            // forge-lint: disable-next-line(unsafe-typecast)
            placedAt: uint32(c.now),
            prev: prev,
            next: 0,
            holderPrev: 0,
            holderNext: oldHead
        });
        pos.openOrders += 1;
        PositionLib.lockEscrow(pos, a.kind, a.priceTicks, lots, c.cu);
        l.markets[c.marketId].orderCount += 1;
        return EngineStorage.orderIdOf(c.mIdx, seq, idx);
    }
}
