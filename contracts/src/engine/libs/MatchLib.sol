// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../EngineStorage.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../interfaces/IEventsEngineEvents.sol";
import {BookLib, MarketCtx} from "./BookLib.sol";
import {PositionLib} from "./PositionLib.sol";
import {Grid} from "./Grid.sol";
import {PrintLib} from "./PrintLib.sol";
import {MatchCore, Walk} from "./MatchCore.sol";
import "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/
// {place.rs,evict.rs,orders.rs} and instructions/{user_place_order.rs,user_cancel_orders.rs,
// user_reduce_order.rs}.

/// @title The order book's writes: place (E-27…E-33), cancel / reduce / cancel-all (E-36) and the sweep (E-37).
/// @dev An external library, delegatecalled by `EventsEngine`: `msg.sender` is the engine's caller and storage is
///      the engine's. It moves no tokens: `placeOrder` returns `transferredIn` / `withdrawn` and the engine pulls
///      and pays after the state and events (CEI, E-33).
library MatchLib {
    // ------------------------------------------------------------------------------------------------ place

    function placeOrder(PlaceArgs calldata a) external returns (PlaceResult memory r) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        // 1. Mode: Halted refuses every placement; ReduceOnly refuses buys.
        uint8 mode = l.cfg.mode;
        if (mode == MODE_HALTED || (mode == MODE_REDUCE_ONLY && PositionLib.isBuy(a.kind))) revert E.InvalidMode();
        // 2. The market exists.
        Market storage mk = l.markets[a.marketId];
        uint32 mIdx = mk.mIdx;
        if (mIdx == 0) revert E.UnknownMarket();
        // 3. Enums.
        if (a.kind > KIND_SELL_NO || a.orderType > ORDER_POST_ONLY) revert E.InvalidOrderArgs();
        // 4. Status: Trading takes any type; Listed rests PostOnly only (D-088); anything else is refused.
        uint40 nowTs = uint40(block.timestamp);
        if (mk.state != STATE_OPEN || nowTs >= mk.lockAt) revert E.MarketNotTrading();
        if (nowTs < mk.tradingStart && a.orderType != ORDER_POST_ONLY) revert E.PreOpenTakerRefused();
        // 5. E-19 / T01: nothing may take before the open print (Q-006).
        if (a.orderType != ORDER_POST_ONLY && PrintLib.isEmpty(mk.open)) revert E.OpenPrintMissing();
        // 6–7. Self-match option and caps.
        Series storage s = l.series[mk.seriesIdx];
        if (
            a.selfMatch > SELF_CANCEL_MAKER || a.maxFills == 0 || a.maxFills > _min8(MAX_FILLS_CAP, s.fillsCap)
                || a.maxEvictions > _min8(MAX_EVICTIONS_CAP, s.evictionsCap)
        ) revert E.InvalidOrderArgs();
        // 8. Price, size, minimum.
        if (!Grid.isValidPrice(a.priceTicks)) revert E.InvalidPrice();
        if (a.lots == 0) revert E.InvalidQuantity();
        if (a.lots < s.minLots) revert E.BelowMinLots();
        // 9. Expiry: in the future and never after lockAt (T08).
        if (a.expireTs <= nowTs) revert E.OrderAlreadyExpired();
        if (a.expireTs > mk.lockAt) revert E.ExpiryAfterLock();
        // 10. The holder's position; a sell needs free balance (no shorts, semantic 4).
        Position storage pos = l.positions[mIdx][msg.sender];
        if (a.kind == KIND_SELL_YES ? pos.yesFree < a.lots : a.kind == KIND_SELL_NO && pos.noFree < a.lots) {
            revert E.InsufficientOutcome();
        }

        MarketCtx memory c = MarketCtx(a.marketId, mIdx, ++mk.eventSeq, s.cashUnit, nowTs);
        Walk memory w = Walk({
            taker: msg.sender,
            kind: a.kind,
            bid: BookLib.sideOf(a.kind) == BookLib.BID,
            crossCheck: a.orderType == ORDER_POST_ONLY,
            selfMatch: a.selfMatch,
            limit: a.priceTicks,
            maxFills: a.maxFills,
            maxEvictions: a.maxEvictions,
            remaining: a.lots,
            filled: 0,
            cashSpent: 0,
            cashReceived: 0,
            fills: 0,
            evictions: 0,
            selfCancels: 0,
            skips: 0,
            pathMask: 0,
            stop: STOP_NO_CROSS,
            backingDelta: 0,
            volumeLots: 0,
            volumeCash: 0,
            lastPrice: 0
        });
        // 11. PostOnly cross walk, or the match.
        if (w.crossCheck) {
            if (pos.openOrders >= MAX_OPEN_ORDERS) revert E.TooManyOpenOrders();
            MatchCore.run(l, c, w);
            if (w.stop == STOP_SKIP_CAP) revert E.PostOnlyWouldCross();
        } else {
            MatchCore.run(l, c, w);
        }
        // 12. Order types and the remainder: Normal rests only after NoCross/Filled (never rested crossed).
        if (a.orderType == ORDER_FOK && w.remaining != 0) revert E.FillOrKillNotFillable();
        if (a.orderType == ORDER_IOC && w.filled == 0) revert E.ImmediateOrCancelNoFill();
        bool rest = w.remaining > 0
            && (a.orderType == ORDER_POST_ONLY
                || (a.orderType == ORDER_NORMAL && (w.stop == STOP_NO_CROSS || w.stop == STOP_FILLED)));
        if (rest) {
            r.restedOrderId = MatchCore.rest(l, c, pos, a, w.remaining);
            r.restedLots = w.remaining;
        }
        MatchCore.applyCounters(mk, w);
        PositionLib.applyTaker(pos, a.kind, w.filled);

        // 13. Funding, exactly, after matching (E-33): proceeds credit first, then credit-first if allowed, one pull.
        bool buy = PositionLib.isBuy(a.kind);
        uint64 restEscrow = buy ? Grid.cashOf(a.kind, a.priceTicks, r.restedLots, c.cu) : 0;
        uint64 need = w.cashSpent + restEscrow;
        uint64 credit = pos.credit + w.cashReceived;
        r.creditUsed = a.useCredit ? (credit < need ? credit : need) : 0;
        credit -= r.creditUsed;
        r.transferredIn = need - r.creditUsed;
        if (a.withdrawProceeds) {
            r.withdrawn = credit;
            credit = 0;
        }
        pos.credit = credit;

        r.filledLots = w.filled;
        r.cashSpent = w.cashSpent;
        r.cashReceived = w.cashReceived;
        r.refunded = buy ? Grid.cashOf(a.kind, a.priceTicks, a.lots, c.cu) - w.cashSpent - restEscrow : 0;
        r.cancelledLots = a.lots - w.filled - r.restedLots;
        r.fills = w.fills;
        r.evictions = w.evictions;
        r.selfCancels = w.selfCancels;
        r.stopReason = (w.crossCheck && rest) ? STOP_POST_ONLY_RESTED : w.stop;
        r.pathMask = w.pathMask;
        // 14. Event (tokens move last, in the engine).
        emit Ev.OrderExecuted(
            c.marketId,
            c.seq,
            msg.sender,
            a.kind,
            a.orderType,
            a.selfMatch,
            a.priceTicks,
            a.lots,
            a.expireTs,
            a.clientId,
            r,
            mk.backingLots
        );
    }

    // ------------------------------------------------------------------------------------------------ cancel / reduce

    /// @notice Cancels up to 16 of the caller's order ids; stale ids are skipped (ABA-safe). Every status and mode.
    function cancelOrders(bytes32 m, uint128[] calldata ids, bool withdraw) external returns (uint256 removed, uint64 withdrawn) {
        if (ids.length > MAX_CANCEL_HANDLES) revert E.InvalidOrderArgs();
        (EngineStorage.Layout storage l, MarketCtx memory c) = _ctx(m);
        c.seq = ++l.markets[m].eventSeq;
        uint32 skipped;
        for (uint256 i; i < ids.length; ++i) {
            (uint32 hm, uint48 hseq, uint32 idx) = EngineStorage.decodeOrderId(ids[i]);
            if (!BookLib.isLive(l, idx, hseq)) {
                ++skipped;
                continue;
            }
            if (hm != c.mIdx) revert E.OrderMarketMismatch();
            if (l.nodes[idx].owner != msg.sender) revert E.NotOrderOwner();
            BookLib.removeOrder(l, c, idx, REMOVE_USER_CANCEL);
            ++removed;
        }
        withdrawn = _sweepCredit(l.positions[c.mIdx][msg.sender], withdraw);
        emit Ev.OrdersCancelled(m, c.seq, msg.sender, REMOVE_USER_CANCEL, uint32(removed), skipped, withdrawn);
    }

    /// @notice Shrinks a live order in place, keeping its queue position; refunds the difference.
    function reduceOrder(bytes32 m, uint128 id, uint64 newLots) external {
        (EngineStorage.Layout storage l, MarketCtx memory c) = _ctx(m);
        (uint32 hm, uint48 hseq, uint32 idx) = EngineStorage.decodeOrderId(id);
        if (!BookLib.isLive(l, idx, hseq)) revert E.UnknownOrder();
        if (hm != c.mIdx) revert E.OrderMarketMismatch();
        Node memory n = l.nodes[idx];
        if (n.owner != msg.sender) revert E.NotOrderOwner();
        if (newLots >= n.lots) revert E.ReduceNotSmaller();
        Market storage mk = l.markets[m];
        if (newLots < l.series[mk.seriesIdx].minLots) revert E.BelowMinLots();
        uint64 by = n.lots - newLots;
        BookLib.shrink(l, c.mIdx, BookLib.sideOf(n.kind), n.price, idx, by);
        PositionLib.refundEscrow(l.positions[c.mIdx][msg.sender], n.kind, n.price, by, c.cu);
        emit Ev.OrderReduced(m, ++mk.eventSeq, msg.sender, id, n.lots, newLots);
    }

    /// @notice Cancels up to `max` (1..32) of the caller's orders through the per-holder list (E-36).
    function cancelAll(bytes32 m, uint8 max, bool withdraw) external returns (uint256 removed, uint64 withdrawn) {
        if (max == 0 || max > MAX_REMOVED_PER_CALL) revert E.InvalidOrderArgs();
        (EngineStorage.Layout storage l, MarketCtx memory c) = _ctx(m);
        c.seq = ++l.markets[m].eventSeq;
        Position storage pos = l.positions[c.mIdx][msg.sender];
        uint32 idx = pos.orderHead;
        while (idx != 0 && removed < max) {
            uint32 next = l.nodes[idx].holderNext;
            BookLib.removeOrder(l, c, idx, REMOVE_CANCEL_ALL);
            ++removed;
            idx = next;
        }
        withdrawn = _sweepCredit(pos, withdraw);
        emit Ev.OrdersCancelled(m, c.seq, msg.sender, REMOVE_CANCEL_ALL, uint32(removed), 0, withdrawn);
    }

    /// @notice Permissionless keeper (E-37): evicts up to `max` (1..32) expired orders — or every order once
    ///         `now ≥ lockAt` or terminal — visiting at most `MAX_SWEEP_VISITS` nodes (F-S2-05). Nothing to do succeeds.
    function sweepExpired(bytes32 m, uint8 max) external returns (uint256 removed) {
        if (max == 0 || max > MAX_REMOVED_PER_CALL) revert E.InvalidOrderArgs();
        (EngineStorage.Layout storage l, MarketCtx memory c) = _ctx(m);
        Market storage mk = l.markets[m];
        bool drainAll = mk.state != STATE_OPEN || c.now >= mk.lockAt;
        uint256 visits;
        for (uint256 side; side < 2; ++side) {
            uint16 price = side == BookLib.BID
                ? BookLib.highestAtOrBelow(l, c.mIdx, side, MAX_PRICE_TICKS)
                : BookLib.lowestAtOrAbove(l, c.mIdx, side, MIN_PRICE_TICKS);
            while (price != 0) {
                uint32 r = l.levels[EngineStorage.levelKey(c.mIdx, side, price)].head;
                while (r != 0) {
                    if (removed == max || visits == MAX_SWEEP_VISITS) return _endSweep(c, removed);
                    ++visits;
                    uint32 next = l.nodes[r].next;
                    if (drainAll || l.nodes[r].expireTs <= c.now) {
                        if (c.seq == 0) c.seq = ++mk.eventSeq;
                        BookLib.removeOrder(l, c, r, REMOVE_SWEEP);
                        ++removed;
                    }
                    r = next;
                }
                if (side == BookLib.BID) price = price == MIN_PRICE_TICKS ? 0 : BookLib.highestAtOrBelow(l, c.mIdx, side, price - 1);
                else price = BookLib.lowestAtOrAbove(l, c.mIdx, side, uint256(price) + 1);
            }
        }
        return _endSweep(c, removed);
    }

    function _endSweep(MarketCtx memory c, uint256 removed) private returns (uint256) {
        if (removed != 0) emit Ev.OrdersCancelled(c.marketId, c.seq, msg.sender, REMOVE_SWEEP, uint32(removed), 0, 0);
        return removed;
    }

    // ------------------------------------------------------------------------------------------------ helpers

    function _ctx(bytes32 m) private view returns (EngineStorage.Layout storage l, MarketCtx memory c) {
        l = EngineStorage.layout();
        Market storage mk = l.markets[m];
        uint32 mIdx = mk.mIdx;
        if (mIdx == 0) revert E.UnknownMarket();
        c = MarketCtx(m, mIdx, 0, l.series[mk.seriesIdx].cashUnit, uint40(block.timestamp));
    }

    /// `withdraw`: the whole post-call credit leaves (E-33); returns the amount the engine pays `msg.sender`.
    function _sweepCredit(Position storage pos, bool withdraw) private returns (uint64 out) {
        if (!withdraw) return 0;
        out = pos.credit;
        if (out != 0) pos.credit = 0;
    }

    function _min8(uint8 a, uint8 b) private pure returns (uint8) {
        return a < b ? a : b;
    }
}
