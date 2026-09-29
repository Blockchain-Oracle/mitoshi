// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BookHarness} from "./harness/BookHarness.sol";
import {KIND_BUY_YES, KIND_BUY_NO, KIND_SELL_YES, ORDER_NORMAL} from "../../src/engine/EngineTypes.sol";
import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";

/// The per-holder order list threaded through `Node.holderPrev/holderNext` with its head in `Position.orderHead`
/// (A.1.5): what makes `cancelAll` and the redeem drain O(open orders) instead of a book scan.
contract HolderListTest is Test {
    BookHarness internal h;
    uint32 internal constant M = 3;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        h = new BookHarness();
    }

    function test_listPushesAtTheHeadAndUnlinksAnywhere() public {
        uint32 a = h.rest(M, alice, KIND_BUY_YES, 500, 1);
        uint32 x = h.rest(M, bob, KIND_BUY_YES, 500, 1);
        uint32 b = h.rest(M, alice, KIND_BUY_NO, 600, 1);
        uint32 c = h.rest(M, alice, KIND_BUY_YES, 480, 1);
        uint32[] memory list = h.walkHolder(M, alice);
        assertEq(list.length, 3);
        assertEq(list[0], c);
        assertEq(list[1], b);
        assertEq(list[2], a);
        assertEq(h.walkHolder(M, bob).length, 1);
        assertEq(h.walkHolder(M, bob)[0], x);

        h.remove(M, b); // middle
        list = h.walkHolder(M, alice);
        assertEq(list.length, 2);
        assertEq(list[0], c);
        assertEq(list[1], a);
        h.remove(M, c); // head
        list = h.walkHolder(M, alice);
        assertEq(list.length, 1);
        assertEq(list[0], a);
        assertEq(h.position(M, alice).orderHead, a);
        h.remove(M, a); // last
        assertEq(h.walkHolder(M, alice).length, 0);
        assertEq(h.position(M, alice).orderHead, 0);
        assertEq(h.position(M, alice).openOrders, 0);
        assertEq(h.walkHolder(M, bob)[0], x, "another holder's list is untouched");
    }

    function test_listsArePerMarket() public {
        h.rest(M, alice, KIND_BUY_YES, 500, 1);
        h.rest(M + 1, alice, KIND_BUY_YES, 500, 1);
        h.rest(M + 1, alice, KIND_BUY_YES, 501, 1);
        assertEq(h.walkHolder(M, alice).length, 1);
        assertEq(h.walkHolder(M + 1, alice).length, 2);
        assertEq(h.position(M + 1, alice).openOrders, 2);
    }

    function test_escrowFollowsTheList() public {
        h.seedFree(M, alice, 50, 0);
        uint32 s = h.rest(M, alice, KIND_SELL_YES, 700, 30);
        h.rest(M, alice, KIND_BUY_YES, 400, 10);
        assertEq(h.position(M, alice).yesLocked, 30);
        assertEq(h.position(M, alice).yesFree, 20);
        assertEq(h.position(M, alice).lockedCash, 4_000);
        h.remove(M, s);
        assertEq(h.position(M, alice).yesLocked, 0);
        assertEq(h.position(M, alice).yesFree, 50);
    }

    /// Any interleaving of rests and removals keeps every holder's list equal to the set of its live nodes.
    function testFuzz_listMatchesLiveNodes(uint256 seed) public {
        address[3] memory who = [alice, bob, makeAddr("carol")];
        uint32[] memory live = new uint32[](40);
        address[] memory ownerOf = new address[](41);
        uint256 n;
        for (uint256 i; i < 40; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            if (n > 0 && r % 3 == 0) {
                uint256 k = (r >> 8) % n;
                h.remove(M, live[k]);
                live[k] = live[--n];
            } else {
                address o = who[(r >> 16) % 3];
                uint32 idx = h.rest(M, o, KIND_BUY_YES, uint16(100 + (r >> 24) % 800), 1);
                live[n++] = idx;
                ownerOf[idx] = o;
            }
        }
        uint256 total;
        for (uint256 j; j < 3; ++j) {
            uint32[] memory list = h.walkHolder(M, who[j]);
            assertEq(list.length, h.position(M, who[j]).openOrders);
            for (uint256 k; k < list.length; ++k) assertEq(ownerOf[list[k]], who[j]);
            total += list.length;
        }
        assertEq(total, n);
    }
}

/// The engine's cancel path over the holder list: a live id of another holder or another market refuses by name.
contract HolderListEngineTest is EngineFixture {
    function test_cancelForeignOrderRefused() public {
        bytes32 other = list(START, LOCK, true);
        uint128 mine = place(1, order(KIND_BUY_YES, 400, 10, ORDER_NORMAL)).restedOrderId;
        uint128[] memory ids = new uint128[](1);
        ids[0] = mine;
        vm.prank(who(2));
        vm.expectRevert(E.NotOrderOwner.selector);
        engine.cancelOrders(m, ids, false);
        vm.prank(who(1));
        vm.expectRevert(E.OrderMarketMismatch.selector);
        engine.cancelOrders(other, ids, false);
        vm.prank(who(1));
        vm.expectRevert(E.InvalidOrderArgs.selector);
        engine.cancelOrders(m, new uint128[](17), false);
        vm.prank(who(1));
        (uint256 removed, uint64 withdrawn) = engine.cancelOrders(m, ids, true);
        assertEq(removed, 1);
        assertEq(withdrawn, 4_000);
        assertConserved();
    }
}
