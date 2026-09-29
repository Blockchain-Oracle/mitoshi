// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../../../src/engine/EngineStorage.sol";
import {MatchLib} from "../../../src/engine/libs/MatchLib.sol";
import {BookLib} from "../../../src/engine/libs/BookLib.sol";
import {PrintLib} from "../../../src/engine/libs/PrintLib.sol";
import "../../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/support.rs
// (`TestVenue`): the pure matching core over the real storage layout, with an mvault model moved only by the cash each
// call reports, and the events-engine.md §8.3 invariants. The real engine and token I/O are proven from S2.4 on.
contract MatchHarness {
    /// What the engine's TIP-20 balance would be: only reported pulls and payouts move it.
    uint256 public mvault;

    // ---------------------------------------------------------------------------------------------- setup

    /// Lists a Window directly in storage on a launch-grid Series (cu 1, minLots 1, caps 32/16) with its open print.
    function openTestMarket(uint40 tradingStart, uint40 lockAt, bool openPrint) external returns (bytes32 m) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        if (l.seriesCount == 0) {
            l.seriesCount = 1;
            l.series[1] = Series({
                ticker: 1,
                basis: BASIS_REGULAR,
                cadenceSec: 300,
                lotBase: 1000,
                tickBase: 1000,
                cashUnit: 1,
                minLots: 1,
                nextIndex: 0,
                lastExpiry: 0,
                minRestSec: 20,
                maxLeadSec: 400_000,
                fillsCap: 32,
                evictionsCap: 16,
                versionCount: 0
            });
        }
        uint32 mIdx = ++l.cfg.nextMIdx;
        m = keccak256(abi.encode("test-market", mIdx));
        Market storage mk = l.markets[m];
        mk.tradingStart = tradingStart;
        mk.lockAt = lockAt;
        mk.expiry = lockAt;
        mk.openDeadline = tradingStart + 900;
        mk.closeDeadline = lockAt + 900;
        mk.seriesIdx = 1;
        mk.mIdx = mIdx;
        mk.index = mIdx;
        l.marketIdOf[mIdx] = m;
        if (openPrint) setOpenPrint(m);
    }

    function setOpenPrint(bytes32 m) public {
        Market storage mk = EngineStorage.layout().markets[m];
        mk.open = PrintLib.pack(Print(36_500_000_000, mk.tradingStart, SOURCE_REDSTONE, 5, 0));
    }

    function setState(bytes32 m, uint8 state, uint32 payoutYes, uint32 payoutNo) external {
        Market storage mk = EngineStorage.layout().markets[m];
        (mk.state, mk.payoutYes, mk.payoutNo) = (state, payoutYes, payoutNo);
    }

    function setMode(uint8 mode) external {
        EngineStorage.layout().cfg.mode = mode;
    }

    function setMinLots(uint64 minLots) external {
        EngineStorage.layout().series[1].minLots = minLots;
    }

    function setCaps(uint8 fillsCap, uint8 evictionsCap) external {
        Series storage s = EngineStorage.layout().series[1];
        (s.fillsCap, s.evictionsCap) = (fillsCap, evictionsCap);
    }

    /// Seeds `lots` pairs outside the book: `yesTo` holds the YES, `noTo` the NO, the mvault holds the backing.
    function seedPair(bytes32 m, address yesTo, address noTo, uint64 lots) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = l.markets[m];
        l.positions[mk.mIdx][yesTo].yesFree += lots;
        l.positions[mk.mIdx][noTo].noFree += lots;
        mk.backingLots += lots;
        mvault += uint256(lots) * 1000;
    }

    function seedCredit(bytes32 m, address who, uint64 credit) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        l.positions[l.markets[m].mIdx][who].credit += credit;
        mvault += credit;
    }

    // ---------------------------------------------------------------------------------------------- calls (as msg.sender)

    function place(PlaceArgs calldata a) external returns (PlaceResult memory r) {
        r = MatchLib.placeOrder(a);
        mvault = mvault + r.transferredIn - r.withdrawn;
    }

    function cancel(bytes32 m, uint128[] calldata ids, bool withdraw) external returns (uint256 removed, uint64 withdrawn) {
        (removed, withdrawn) = MatchLib.cancelOrders(m, ids, withdraw);
        mvault -= withdrawn;
    }

    function reduce(bytes32 m, uint128 id, uint64 newLots) external {
        MatchLib.reduceOrder(m, id, newLots);
    }

    function cancelAll(bytes32 m, uint8 max, bool withdraw) external returns (uint256 removed, uint64 withdrawn) {
        (removed, withdrawn) = MatchLib.cancelAll(m, max, withdraw);
        mvault -= withdrawn;
    }

    function sweep(bytes32 m, uint8 max) external returns (uint256) {
        return MatchLib.sweepExpired(m, max);
    }

    // ---------------------------------------------------------------------------------------------- views

    function position(bytes32 m, address who) external view returns (Position memory) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        return l.positions[l.markets[m].mIdx][who];
    }

    function market(bytes32 m) external view returns (Market memory) {
        return EngineStorage.layout().markets[m];
    }

    function node(uint32 idx) external view returns (Node memory) {
        return EngineStorage.layout().nodes[idx];
    }

    function cfg() external view returns (Config memory) {
        return EngineStorage.layout().cfg;
    }

    function level(bytes32 m, uint256 side, uint16 price) external view returns (Level memory) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        return l.levels[EngineStorage.levelKey(l.markets[m].mIdx, side, price)];
    }

    // ---------------------------------------------------------------------------------------------- invariants

    /// events-engine.md §8.3 over one market and its actors: pairs, conservation (as equality, the harness sees no
    /// donations), order count, level lists (links, tail, liveLots, bit), per-holder lists and escrow. Returns "" or the
    /// first broken invariant.
    function check(bytes32 m, address[] calldata actors) external view returns (string memory) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = l.markets[m];
        uint32 mIdx = mk.mIdx;
        uint256 yes;
        uint256 no;
        uint256 owed = uint256(mk.backingLots) * 1000;
        for (uint256 i; i < actors.length; ++i) {
            Position storage p = l.positions[mIdx][actors[i]];
            yes += uint256(p.yesFree) + p.yesLocked;
            no += uint256(p.noFree) + p.noLocked;
            owed += uint256(p.credit) + p.lockedCash;
            string memory err = _checkHolder(l, mIdx, actors[i]);
            if (bytes(err).length != 0) return err;
        }
        if (yes != mk.backingLots || no != mk.backingLots) return "pairs";
        if (owed != mvault) return "conservation";
        uint256 linked;
        for (uint256 side; side < 2; ++side) {
            for (uint16 p = 1; p <= MAX_PRICE_TICKS; ++p) {
                (string memory err, uint256 n) = _checkLevel(l, mIdx, side, p);
                if (bytes(err).length != 0) return err;
                linked += n;
            }
        }
        if (linked != mk.orderCount) return "orderCount";
        return "";
    }

    function _checkLevel(EngineStorage.Layout storage l, uint32 mIdx, uint256 side, uint16 price)
        private
        view
        returns (string memory, uint256 steps)
    {
        Level storage lv = l.levels[EngineStorage.levelKey(mIdx, side, price)];
        uint32 r = lv.head;
        uint32 prev;
        uint64 lots;
        while (r != 0) {
            Node storage n = l.nodes[r];
            if (n.flags & NODE_LIVE == 0 || n.price != price || BookLib.sideOf(n.kind) != side || n.prev != prev) {
                return ("node out of place", 0);
            }
            lots += n.lots;
            (prev, r) = (r, n.next);
            if (++steps > 10_000) return ("level cycle", 0);
        }
        bool bit = BookLib.bitIsSet(l, mIdx, side, price);
        if (lv.tail != prev || lv.liveLots != lots || bit != (lv.head != 0)) return ("tail/liveLots/bit", 0);
        return ("", steps);
    }

    function _checkHolder(EngineStorage.Layout storage l, uint32 mIdx, address who) private view returns (string memory) {
        Position storage p = l.positions[mIdx][who];
        uint32 r = p.orderHead;
        uint32 prev;
        uint256 orders;
        uint256 cash;
        uint256 yesL;
        uint256 noL;
        while (r != 0) {
            Node storage n = l.nodes[r];
            if (n.flags & NODE_LIVE == 0 || n.owner != who || n.holderPrev != prev) return "holder list";
            ++orders;
            if (n.kind == KIND_BUY_YES) cash += uint256(n.lots) * n.price;
            else if (n.kind == KIND_BUY_NO) cash += uint256(n.lots) * (1000 - n.price);
            else if (n.kind == KIND_SELL_YES) yesL += n.lots;
            else noL += n.lots;
            (prev, r) = (r, n.holderNext);
            if (orders > MAX_OPEN_ORDERS) return "holder cycle";
        }
        if (orders != p.openOrders || cash != p.lockedCash || yesL != p.yesLocked || noL != p.noLocked) return "escrow";
        return "";
    }
}
