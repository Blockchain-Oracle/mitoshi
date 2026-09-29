// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../../../src/engine/EngineStorage.sol";
import {BookLib} from "../../../src/engine/libs/BookLib.sol";
import {PositionLib} from "../../../src/engine/libs/PositionLib.sol";
import {Config, Level, Node, Position, NODE_LIVE} from "../../../src/engine/EngineTypes.sol";

/// Exposes the internal book libraries over the real ERC-7201 layout, so Book/HolderList tests exercise the exact
/// storage code the engine runs.
contract BookHarness {
    uint64 internal constant CU = 1;

    function setBit(uint32 mIdx, uint256 side, uint16 price, bool on) external {
        BookLib.setBit(EngineStorage.layout(), mIdx, side, price, on);
    }

    function lowest(uint32 mIdx, uint256 side, uint256 at) external view returns (uint16) {
        return BookLib.lowestAtOrAbove(EngineStorage.layout(), mIdx, side, at);
    }

    function highest(uint32 mIdx, uint256 side, uint256 at) external view returns (uint16) {
        return BookLib.highestAtOrBelow(EngineStorage.layout(), mIdx, side, at);
    }

    /// Rests an order the way MatchLib does: alloc, link at the level tail, write the node, push on the holder list,
    /// lock escrow.
    function rest(uint32 mIdx, address owner, uint8 kind, uint16 price, uint64 lots) external returns (uint32 idx) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        idx = BookLib.alloc(l);
        uint256 side = BookLib.sideOf(kind);
        uint32 prev = BookLib.linkTail(l, mIdx, side, price, idx, lots);
        Position storage pos = l.positions[mIdx][owner];
        uint32 oldHead = BookLib.holderPush(l, pos, idx);
        uint48 seq = ++l.cfg.nextSeq;
        l.nodes[idx] = Node({
            owner: owner,
            lots: lots,
            price: price,
            kind: kind,
            flags: NODE_LIVE,
            seq: seq,
            expireTs: uint32(block.timestamp + 500),
            placedAt: uint32(block.timestamp),
            prev: prev,
            next: 0,
            holderPrev: 0,
            holderNext: oldHead
        });
        pos.openOrders += 1;
        PositionLib.lockEscrow(pos, kind, price, lots, CU);
    }

    function remove(uint32 mIdx, uint32 idx) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Node memory n = l.nodes[idx];
        BookLib.unlink(l, mIdx, BookLib.sideOf(n.kind), n.price, n.prev, n.next, n.lots);
        Position storage pos = l.positions[mIdx][n.owner];
        BookLib.holderUnlink(l, pos, n.holderPrev, n.holderNext);
        pos.openOrders -= 1;
        PositionLib.refundEscrow(pos, n.kind, n.price, n.lots, CU);
        BookLib.release(l, idx);
    }

    function shrink(uint32 mIdx, uint32 idx, uint64 by) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Node memory n = l.nodes[idx];
        BookLib.shrink(l, mIdx, BookLib.sideOf(n.kind), n.price, idx, by);
        PositionLib.refundEscrow(l.positions[mIdx][n.owner], n.kind, n.price, by, CU);
    }

    function reserve(uint32 n) external returns (uint32) {
        return BookLib.reserve(EngineStorage.layout(), n);
    }

    function seedFree(uint32 mIdx, address owner, uint64 yes, uint64 no) external {
        Position storage pos = EngineStorage.layout().positions[mIdx][owner];
        pos.yesFree += yes;
        pos.noFree += no;
    }

    // ---- views ----
    function level(uint32 mIdx, uint256 side, uint16 price) external view returns (Level memory) {
        return EngineStorage.layout().levels[EngineStorage.levelKey(mIdx, side, price)];
    }

    function node(uint32 idx) external view returns (Node memory) {
        return EngineStorage.layout().nodes[idx];
    }

    function cfg() external view returns (Config memory) {
        return EngineStorage.layout().cfg;
    }

    function position(uint32 mIdx, address owner) external view returns (Position memory) {
        return EngineStorage.layout().positions[mIdx][owner];
    }

    function bitIsSet(uint32 mIdx, uint256 side, uint16 price) external view returns (bool) {
        return BookLib.bitIsSet(EngineStorage.layout(), mIdx, side, price);
    }

    /// FIFO walk of one level (checks prev links as it goes).
    function walkLevel(uint32 mIdx, uint256 side, uint16 price) external view returns (uint32[] memory out) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Level memory lv = l.levels[EngineStorage.levelKey(mIdx, side, price)];
        uint256 count;
        uint32 r = lv.head;
        uint32 prev;
        while (r != 0) {
            require(l.nodes[r].prev == prev, "prev link broken");
            (prev, r) = (r, l.nodes[r].next);
            ++count;
        }
        require(lv.tail == prev, "tail broken");
        out = new uint32[](count);
        r = lv.head;
        for (uint256 i; i < count; ++i) (out[i], r) = (r, l.nodes[r].next);
    }

    function walkHolder(uint32 mIdx, address owner) external view returns (uint32[] memory out) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        uint32 r = l.positions[mIdx][owner].orderHead;
        uint256 count;
        uint32 prev;
        while (r != 0) {
            require(l.nodes[r].holderPrev == prev, "holderPrev broken");
            (prev, r) = (r, l.nodes[r].holderNext);
            ++count;
        }
        out = new uint32[](count);
        r = l.positions[mIdx][owner].orderHead;
        for (uint256 i; i < count; ++i) (out[i], r) = (r, l.nodes[r].holderNext);
    }

    function freeList() external view returns (uint32[] memory out) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        uint32 r = l.cfg.freeHead;
        uint256 count;
        while (r != 0) (r, count) = (l.nodes[r].next, count + 1);
        out = new uint32[](count);
        r = l.cfg.freeHead;
        for (uint256 i; i < count; ++i) (out[i], r) = (r, l.nodes[r].next);
    }
}
