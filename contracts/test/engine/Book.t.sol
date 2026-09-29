// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BookHarness} from "./harness/BookHarness.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {Level, Node, NODE_LIVE, NODE_FREED, KIND_BUY_YES, KIND_SELL_YES, KIND_BUY_NO, KIND_SELL_NO} from
    "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/book/ladder.rs (tests)
// plus the EVM-specific pool and bitmap-word vectors (A.1.3–A.1.4, D-054).
contract BookTest is Test {
    BookHarness internal h;
    uint32 internal constant M = 7;
    uint256 internal constant BID = 0;
    uint256 internal constant ASK = 1;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        h = new BookHarness();
    }

    /// Agari's vector: prices 1, 63, 64, 500, 999 on one side.
    function test_bitmapScansFindTheNearestSetPriceInEachDirection() public {
        uint16[5] memory ps = [uint16(1), 63, 64, 500, 999];
        for (uint256 i; i < ps.length; ++i) {
            h.setBit(M, ASK, ps[i], true);
            h.setBit(M, BID, ps[i], true);
        }
        assertEq(h.lowest(M, ASK, 0), 1);
        assertEq(h.lowest(M, ASK, 2), 63);
        assertEq(h.lowest(M, ASK, 65), 500);
        assertEq(h.lowest(M, ASK, 1000), 0);
        assertEq(h.highest(M, BID, 999), 999);
        assertEq(h.highest(M, BID, 998), 500);
        assertEq(h.highest(M, BID, 63), 63);
        assertEq(h.highest(M, BID, 62), 1);
        assertEq(h.highest(M, BID, 0), 0);
    }

    /// Solady `ffs/fls(0) = 256`: empty words must be skipped, and the top bit of a word (255) and the first bit of the
    /// next (256) are distinct prices (D-054).
    function test_emptyWordsAndWordEdges() public {
        assertEq(h.lowest(M, ASK, 1), 0, "empty side");
        assertEq(h.highest(M, BID, 999), 0, "empty side");
        h.setBit(M, ASK, 255, true);
        assertEq(h.lowest(M, ASK, 1), 255);
        assertEq(h.lowest(M, ASK, 256), 0);
        assertEq(h.highest(M, ASK, 999), 255, "skips empty words 1..3");
        h.setBit(M, ASK, 256, true);
        assertEq(h.lowest(M, ASK, 256), 256);
        assertEq(h.highest(M, ASK, 255), 255);
        assertEq(h.highest(M, ASK, 511), 256);
        h.setBit(M, ASK, 768, true);
        assertEq(h.lowest(M, ASK, 257), 768, "skips empty word 2");
        h.setBit(M, ASK, 255, false);
        assertEq(h.lowest(M, ASK, 1), 256);
        assertFalse(h.bitIsSet(M, ASK, 255));
        // Sides and markets are separate bitmaps.
        assertEq(h.lowest(M, BID, 1), 0);
        assertEq(h.lowest(M + 1, ASK, 1), 0);
    }

    /// Any set of prices: the scans agree with a naive walk from every starting point.
    function testFuzz_scansMatchANaiveWalk(uint256 seed) public {
        bool[1000] memory set;
        for (uint256 i; i < 12; ++i) {
            uint16 p = uint16(bound(uint256(keccak256(abi.encode(seed, i))), 1, 999));
            set[p] = true;
            h.setBit(M, BID, p, true);
        }
        for (uint256 at = 0; at < 1000; at += 37) {
            uint16 up;
            for (uint256 p = at == 0 ? 1 : at; p < 1000; ++p) if (set[p]) { up = uint16(p); break; }
            uint16 down;
            for (uint256 p = at; p >= 1; --p) if (set[p]) { down = uint16(p); break; }
            assertEq(h.lowest(M, BID, at), up);
            assertEq(h.highest(M, BID, at), down);
        }
    }

    function test_levelIsFifoAndUnlinksFromAnyPosition() public {
        uint32 a = h.rest(M, alice, KIND_BUY_YES, 500, 10);
        uint32 b = h.rest(M, bob, KIND_BUY_YES, 500, 20);
        uint32 c = h.rest(M, alice, KIND_BUY_YES, 500, 30);
        uint32[] memory fifo = h.walkLevel(M, BID, 500);
        assertEq(fifo.length, 3);
        (uint32 f0, uint32 f1, uint32 f2) = (fifo[0], fifo[1], fifo[2]);
        assertEq(f0, a);
        assertEq(f1, b);
        assertEq(f2, c);
        assertEq(h.level(M, BID, 500).liveLots, 60);
        assertTrue(h.bitIsSet(M, BID, 500));

        h.remove(M, b); // middle
        fifo = h.walkLevel(M, BID, 500);
        assertEq(fifo.length, 2);
        assertEq(h.level(M, BID, 500).liveLots, 40);
        h.remove(M, a); // head
        fifo = h.walkLevel(M, BID, 500);
        assertEq(fifo.length, 1);
        assertEq(fifo[0], c);
        h.remove(M, c); // last → the level is zeroed and its bit cleared (A.1.4)
        Level memory lv = h.level(M, BID, 500);
        assertEq(lv.head, 0);
        assertEq(lv.tail, 0);
        assertEq(lv.liveLots, 0);
        assertFalse(h.bitIsSet(M, BID, 500));
        assertEq(uint256(vm.load(address(h), _levelSlot(M, BID, 500))), 0, "emptied level slot is zero");
    }

    function test_sidesFollowKinds() public {
        h.seedFree(M, alice, 100, 100);
        h.rest(M, alice, KIND_BUY_YES, 400, 1);
        h.rest(M, alice, KIND_SELL_NO, 401, 1);
        h.rest(M, alice, KIND_SELL_YES, 600, 1);
        h.rest(M, alice, KIND_BUY_NO, 601, 1);
        assertEq(h.highest(M, BID, 999), 401);
        assertEq(h.lowest(M, ASK, 1), 600);
        assertTrue(h.bitIsSet(M, BID, 400));
        assertTrue(h.bitIsSet(M, ASK, 601));
    }

    function test_shrinkKeepsTheQueueAndTheLevelTotal() public {
        uint32 a = h.rest(M, alice, KIND_BUY_YES, 500, 10);
        h.rest(M, bob, KIND_BUY_YES, 500, 20);
        h.shrink(M, a, 4);
        assertEq(h.node(a).lots, 6);
        assertEq(h.level(M, BID, 500).liveLots, 26);
        assertEq(h.walkLevel(M, BID, 500)[0], a, "priority kept");
        assertEq(h.position(M, alice).lockedCash, 6 * 500, "escrow refunded to credit");
        assertEq(h.position(M, alice).credit, 4 * 500);
    }

    /// A.1.3: freed nodes keep both slots non-zero (FREED + expireTs sentinel), the free list is LIFO, and a reused node
    /// comes from the list before the high-water mark grows.
    function test_nodePoolReusesFreedNodesAsNonZeroSentinels() public {
        uint32 a = h.rest(M, alice, KIND_BUY_YES, 500, 10);
        uint32 b = h.rest(M, alice, KIND_BUY_YES, 501, 10);
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(h.cfg().highWater, 2);
        h.remove(M, a);
        h.remove(M, b);
        Node memory n = h.node(b);
        assertEq(n.flags, NODE_FREED);
        assertEq(n.expireTs, type(uint32).max);
        assertEq(n.next, a, "free list threads through next");
        bytes32 s0 = vm.load(address(h), _nodeSlot(b));
        bytes32 s1 = bytes32(uint256(_nodeSlot(b)) + 1);
        assertTrue(s0 != bytes32(0) && vm.load(address(h), s1) != bytes32(0), "both slots non-zero");
        assertEq(h.cfg().freeHead, b);
        uint32 c = h.rest(M, bob, KIND_SELL_NO, 300, 0);
        assertEq(c, b, "LIFO reuse");
        uint32 d = h.rest(M, bob, KIND_BUY_NO, 300, 1);
        assertEq(d, a);
        uint32 e = h.rest(M, bob, KIND_BUY_NO, 300, 1);
        assertEq(e, 3, "then the high-water mark grows");
        assertEq(h.node(e).flags, NODE_LIVE);
    }

    function test_reserveNodesPrebuildsTheFreeList() public {
        h.reserve(5);
        assertEq(h.cfg().highWater, 5);
        uint32[] memory free = h.freeList();
        assertEq(free.length, 5);
        assertEq(free[0], 5);
        assertEq(free[4], 1);
        uint32 a = h.rest(M, alice, KIND_BUY_YES, 500, 1);
        assertEq(a, 5);
        assertEq(h.cfg().highWater, 5, "no new node while reserved ones remain");
        h.reserve(2);
        assertEq(h.freeList().length, 6);
        assertEq(h.cfg().highWater, 7);
    }

    function _levelSlot(uint32 mIdx, uint256 side, uint16 price) internal pure returns (bytes32) {
        return keccak256(abi.encode(EngineStorage.levelKey(mIdx, side, price), uint256(EngineStorage.SLOT) + EngineStorage.OFF_LEVELS));
    }

    function _nodeSlot(uint32 idx) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(idx), uint256(EngineStorage.SLOT) + EngineStorage.OFF_NODES));
    }
}
