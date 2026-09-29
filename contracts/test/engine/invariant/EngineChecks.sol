// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {LibBit} from "solady/utils/LibBit.sol";
import {EventsEngine} from "../../../src/engine/EventsEngine.sol";
import {LensSlots as S} from "../../../src/engine/libs/LensSlots.sol";
import "../../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/support.rs
// (`check`, `check_book`, `check_escrow`) — the events-engine.md §8.3 invariants, read from the real engine's storage.
/// Agari's 8 invariant families over every market and holder, plus the pool's free list:
///   1 pairs (Σyes == Σno == backing, while open) · 2 conservation as equality (balanceOf == totalOwed == owed) ·
///   3 orderCount == nodes linked from the bitmaps · 4 level lists (LIVE, price, side, prev links) · 5 tail / liveLots /
///   bit agree · 6 no orphans (Σ linked == LIVE nodes in the pool) · 7 free list (FREED sentinels) + live == highWater ·
///   8 per-holder list and escrow (openOrders, lockedCash, yesLocked, noLocked).
/// `check` returns "" or the first broken family.
contract EngineChecks {
    EventsEngine public immutable engine;
    ITIP20 public immutable usd;

    constructor(EventsEngine engine_, ITIP20 usd_) {
        (engine, usd) = (engine_, usd_);
    }

    function check(bytes32[] calldata markets, address[] calldata actors) external view returns (string memory) {
        Config memory cfg = S.config(_load(S.cfgSlot()));
        uint256 owed;
        uint256 linkedTotal;
        for (uint256 i; i < markets.length; ++i) {
            Market memory mk = S.market(_loadN(S.marketSlot(markets[i]), 6));
            (string memory err, uint256 marketOwed) = _holders(mk, actors);
            if (bytes(err).length != 0) return err;
            owed += marketOwed;
            uint256 linked;
            for (uint256 side; side < 2; ++side) {
                uint256 n;
                (err, n) = _side(mk.mIdx, side);
                if (bytes(err).length != 0) return err;
                linked += n;
            }
            if (linked != mk.orderCount) return "3 orderCount";
            linkedTotal += linked;
        }
        if (cfg.totalOwed != owed) return "2 conservation: totalOwed != owed";
        if (usd.balanceOf(address(engine)) != cfg.totalOwed) return "2 conservation: balance != totalOwed";
        return _pool(cfg, linkedTotal);
    }

    /// Families 1, 2 (what this market owes) and 8.
    function _holders(Market memory mk, address[] calldata actors) private view returns (string memory, uint256 owed) {
        uint256 yes;
        uint256 no;
        if (mk.state == STATE_OPEN) owed = uint256(mk.backingLots) * 1000;
        for (uint256 j; j < actors.length; ++j) {
            Position memory p = S.position(_loadN(S.positionSlot(mk.mIdx, actors[j]), 2));
            yes += uint256(p.yesFree) + p.yesLocked;
            no += uint256(p.noFree) + p.noLocked;
            owed += _owed(mk, p);
            string memory err = _escrow(p, actors[j]);
            if (bytes(err).length != 0) return (err, 0);
        }
        if (mk.state == STATE_OPEN && (yes != mk.backingLots || no != mk.backingLots)) return ("1 pairs", 0);
        return ("", owed);
    }

    /// What one holder is owed beyond the pairs' backing: credit and escrow, plus its payout once terminal.
    function _owed(Market memory mk, Position memory p) private pure returns (uint256 owed) {
        owed = uint256(p.credit) + p.lockedCash;
        if (mk.state != STATE_OPEN) {
            uint256 y = uint256(p.yesFree) + p.yesLocked;
            uint256 n = uint256(p.noFree) + p.noLocked;
            owed += (y * 1000 * mk.payoutYes + n * 1000 * mk.payoutNo) / PAYOUT_DENOMINATOR;
        }
    }

    function _escrow(Position memory p, address who) private view returns (string memory) {
        uint32 r = p.orderHead;
        uint32 prev;
        uint256 orders;
        uint256 cash;
        uint256 yesL;
        uint256 noL;
        while (r != 0) {
            Node memory n = S.node(_loadN(S.nodeSlot(r), 2));
            if (n.flags & NODE_LIVE == 0 || n.owner != who || n.holderPrev != prev) return "8 holder list";
            if (++orders > MAX_OPEN_ORDERS) return "8 holder list cycle";
            if (n.kind == KIND_BUY_YES) cash += uint256(n.lots) * n.price;
            else if (n.kind == KIND_BUY_NO) cash += uint256(n.lots) * (1000 - n.price);
            else if (n.kind == KIND_SELL_YES) yesL += n.lots;
            else noL += n.lots;
            (prev, r) = (r, n.holderNext);
        }
        if (orders != p.openOrders || cash != p.lockedCash || yesL != p.yesLocked || noL != p.noLocked) return "8 escrow";
        return "";
    }

    /// Families 4 and 5 over every set bit of one side; returns the nodes linked.
    function _side(uint32 mIdx, uint256 side) private view returns (string memory, uint256 linked) {
        uint256[] memory words = _loadN(S.bitsSlot(mIdx, side), 4);
        for (uint256 w; w < 4; ++w) {
            uint256 word = words[w];
            while (word != 0) {
                uint256 b = LibBit.ffs(word);
                word &= ~(uint256(1) << b);
                uint16 price = uint16(w * 256 + b);
                (string memory err, uint256 n) = _level(mIdx, side, price);
                if (bytes(err).length != 0) return (err, 0);
                if (n == 0) return ("5 bit set on an empty level", 0);
                linked += n;
            }
        }
        return ("", linked);
    }

    function _level(uint32 mIdx, uint256 side, uint16 price) private view returns (string memory, uint256 steps) {
        Level memory lv = S.level(_load(S.levelSlot(mIdx, side, price)));
        uint32 r = lv.head;
        uint32 prev;
        uint256 lots;
        while (r != 0) {
            Node memory n = S.node(_loadN(S.nodeSlot(r), 2));
            bool bid = n.kind == KIND_BUY_YES || n.kind == KIND_SELL_NO;
            if (n.flags & NODE_LIVE == 0 || n.price != price || (bid ? 0 : 1) != side || n.prev != prev) {
                return ("4 node out of place", 0);
            }
            lots += n.lots;
            (prev, r) = (r, n.next);
            if (++steps > 10_000) return ("4 level cycle", 0);
        }
        if (lv.tail != prev || lv.liveLots != lots) return ("5 tail/liveLots", 0);
        return ("", steps);
    }

    /// Families 6 and 7: every pool node is on the free list (a FREED sentinel, both slots non-zero) or LIVE and
    /// linked in some book; nothing else.
    function _pool(Config memory cfg, uint256 linkedTotal) private view returns (string memory) {
        uint256 free;
        uint32 r = cfg.freeHead;
        while (r != 0) {
            Node memory n = S.node(_loadN(S.nodeSlot(r), 2));
            if (n.flags != NODE_FREED || n.expireTs != type(uint32).max) return "7 free node not a sentinel";
            r = n.next;
            if (++free > cfg.highWater) return "7 free list cycle";
        }
        if (free + linkedTotal != cfg.highWater) return "6/7 free + linked != highWater";
        return "";
    }

    function _load(bytes32 slot) private view returns (uint256) {
        return uint256(engine.extsload(slot));
    }

    function _loadN(bytes32 first, uint256 n) private view returns (uint256[] memory out) {
        bytes32[] memory slots = new bytes32[](n);
        for (uint256 i; i < n; ++i) slots[i] = bytes32(uint256(first) + i);
        bytes32[] memory raw = engine.extsload(slots);
        out = new uint256[](n);
        for (uint256 i; i < n; ++i) out[i] = uint256(raw[i]);
    }
}
