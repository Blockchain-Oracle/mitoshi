// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/GameArena.agents.t.sol (R4-9, D-227) — on the real engine (ArenaTestBase).
// The entry test no longer forwards gas (Tempo has no native value): it names both keys in the one transaction each.

import {IGameArena} from "../../../src/products/arena/IGameArena.sol";
import {ArenaTestBase} from "../harness/ArenaTestBase.sol";

/// @dev The agent lane: a key named at entry places a seat's picks with the seat's money, and nothing else.
contract GameArenaAgentsTest is ArenaTestBase {
    address internal agent = makeAddr("agent");
    uint32 internal constant TTL = 600;

    function test_placePickFor_booksForThePlayerWithThePlayersMoney() public {
        stage(TIER_ONE);
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, TTL);

        uint256 before = usd.balanceOf(creator);
        vm.expectEmit(true, true, true, false, address(arena));
        emit IGameArena.PickFilled(matchId, creator, cards[0], 0, 0, 0, 0, 0);
        vm.prank(agent);
        (uint256 quantity, uint256 cost) = arena.placePickFor(creator, matchId, 0, 0, ONE, 0);

        IGameArena.PickRecord memory rec = arena.pickOf(matchId, 0, 0);
        assertTrue(rec.placed);
        assertEq(rec.quantity, quantity);
        assertEq(rec.costBase, cost);
        // the stake left the player and the refund came back to the player; the key moved no collateral
        assertEq(before - usd.balanceOf(creator), cost);
        assertEq(usd.balanceOf(agent), 0);
        assertEq(arena.agentOf(matchId, creator).spentBase, ONE);
    }

    function test_placePickFor_refusesAnyoneWhoIsNotTheSeatsAgent() public {
        stage(TIER_ONE);
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, TTL);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAgent.selector, matchId, creator, stranger));
        vm.prank(stranger);
        arena.placePickFor(creator, matchId, 0, 0, ONE, 0);
        // the creator's agent is not the challenger's
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAgent.selector, matchId, challenger, agent));
        vm.prank(agent);
        arena.placePickFor(challenger, matchId, 0, 0, ONE, 0);
    }

    function test_placePickFor_refusesAnExpiredGrantAndARevokedOne() public {
        stage(TIER_ONE);
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, 30);
        vm.warp(now_() + 31);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.AgentExpired.selector, matchId, uint64(now_() - 1)));
        vm.prank(agent);
        arena.placePickFor(creator, matchId, 0, 0, ONE, 0);

        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, TTL);
        vm.prank(creator);
        arena.authorizeAgent(matchId, address(0), 0);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAgent.selector, matchId, creator, agent));
        vm.prank(agent);
        arena.placePickFor(creator, matchId, 0, 0, ONE, 0);
    }

    function test_placePickFor_neverSpendsPastTheDecksCeiling() public {
        stage(TIER_ONE);
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, TTL);
        assertEq(arena.agentOf(matchId, creator).budgetBase, ONE * DECK);
        // a stake above the tier's cap is refused by the card before the budget is touched
        vm.expectRevert(abi.encodeWithSelector(IGameArena.StakeAboveCap.selector, 2 * ONE, ONE));
        vm.prank(agent);
        arena.placePickFor(creator, matchId, 0, 0, 2 * ONE, 0);
        for (uint8 i = 0; i < DECK; i++) {
            vm.prank(agent);
            arena.placePickFor(creator, matchId, i, 0, ONE, 0);
        }
        assertEq(arena.agentOf(matchId, creator).spentBase, ONE * DECK);
    }

    function test_authorizeAgent_refusesANonPlayerAndABadTtl() public {
        stage(TIER_ONE);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAPlayer.selector, stranger));
        vm.prank(stranger);
        arena.authorizeAgent(matchId, agent, TTL);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BadTtl.selector, uint32(0)));
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, 0);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BadTtl.selector, uint32(2 days)));
        vm.prank(creator);
        arena.authorizeAgent(matchId, agent, 2 days);
    }

    function test_entryWithAgent_namesTheKeyInTheOneTransaction() public {
        address agent2 = makeAddr("agent2");
        vm.prank(creator);
        arena.createMatchWithAgent(matchId, challenger, TIER_ONE, deckHash(), uint8(cards.length), POLICY, agent, TTL);
        assertEq(arena.agentOf(matchId, creator).agent, agent);
        assertEq(usd.balanceOf(address(arena)), ONE);

        vm.prank(challenger);
        arena.joinMatchWithAgent(matchId, agent2, TTL);
        assertEq(arena.agentOf(matchId, challenger).agent, agent2);
        reveal();

        vm.prank(agent);
        arena.placePickFor(creator, matchId, 0, 0, ONE, 0);
        vm.prank(agent2);
        arena.placePickFor(challenger, matchId, 0, 1, ONE, 0);
        assertTrue(arena.pickOf(matchId, 0, 0).placed);
        assertTrue(arena.pickOf(matchId, 0, 1).placed);
    }

    function test_entryWithAgent_refusesANamelessKey() public {
        vm.expectRevert(IGameArena.ZeroAddress.selector);
        vm.prank(creator);
        arena.createMatchWithAgent(matchId, challenger, TIER_ONE, deckHash(), uint8(cards.length), POLICY, address(0), TTL);
    }
}
