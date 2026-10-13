// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/GameArena.lifecycle.t.sol (R4-9, D-227) — on the real engine
// (ArenaTestBase): `pools[i].resolve/voidIt` → a real close + `settle` or a missed close + `voidExpired`; the clock is
// `vm.getBlockTimestamp()` (via-IR). Every assertion is Masayume's.

import {ArenaTestBase} from "../harness/ArenaTestBase.sol";
import {IGameArena} from "../../../src/products/arena/IGameArena.sol";

/// @notice The whole match, end to end, and every way it can end early. The rule under all of it: the
///         pot is the only money the arena decides, and a lost pot never costs a player their position.
contract GameArenaLifecycleTest is ArenaTestBase {
    function test_happyPath_theGreaterRealPnlTakesThePot() public {
        stage(TIER_ONE);
        pickEveryCard(0); // creator buys YES on every card, challenger takes NO
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.SETTLING), "last pick locks the match");

        resolveAll(0);
        settleAll();
        arena.finalize(matchId);

        (int256 creatorPnl, int256 challengerPnl) = arena.pnlOf(matchId);
        assertGt(creatorPnl, 0, "YES was paid");
        assertLt(challengerPnl, 0, "NO paid for nothing");
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.FINALIZED));
        // The winner holds three card payouts plus both pots; the loser holds nothing.
        assertEq(arena.creditOf(creator), _payouts(0) + 2 * ONE, "creator credit");
        assertEq(arena.creditOf(challenger), 0, "loser credit");
        assertSolvent();
    }

    function test_claimCredit_paysThePlayerNeverTheCaller() public {
        stage(TIER_ONE);
        pickEveryCard(0);
        resolveAll(0);
        settleAll();
        arena.finalize(matchId);

        uint256 owed = arena.creditOf(creator);
        uint256 before = usd.balanceOf(creator);
        vm.prank(stranger);
        arena.claimCredit(creator);
        assertEq(usd.balanceOf(creator) - before, owed, "the player was paid");
        assertEq(usd.balanceOf(stranger), 0, "the crank was not");
        assertEq(arena.creditOf(creator), 0);
        assertEq(arena.credited(), 0);
        assertSolvent();
    }

    function test_tie_splitsThePot() public {
        stage(TIER_ONE);
        // Both seats take the same side of every card, so their measured PnL is identical.
        for (uint8 i = 0; i < uint8(cards.length); i++) {
            pick(creator, i, 0);
            pick(challenger, i, 0);
        }
        resolveAll(1);
        settleAll();
        arena.finalize(matchId);

        (int256 a, int256 b) = arena.pnlOf(matchId);
        assertEq(a, b, "identical decks, identical PnL");
        assertEq(arena.creditOf(creator), ONE, "creator half");
        assertEq(arena.creditOf(challenger), ONE, "challenger half");
        assertSolvent();
    }

    function test_forfeit_costsThePotAloneAndStillSettlesTheCardsPlayed() public {
        stage(TIER_ONE);
        for (uint8 i = 0; i < uint8(cards.length); i++) {
            pick(creator, i, 0);
        }
        pick(challenger, 0, 0); // one card only: the challenger runs out of time

        vm.warp(now_() + 200);
        arena.lockPicks(matchId);
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.FORFEITED));

        resolveAll(0);
        settleAll();
        arena.finalize(matchId);

        // The absent player keeps the payout of the card they did play — the forfeit is of the pot only.
        assertEq(arena.creditOf(challenger), arena.pickOf(matchId, 0, 1).payoutBase, "position survived the forfeit");
        assertEq(arena.creditOf(creator), _payouts(0) + 2 * ONE, "the pot went to the player who finished");
        assertSolvent();
    }

    function test_bothIncomplete_refundsBothPotsAndKeepsSettlingTheirCards() public {
        stage(TIER_ONE);
        pick(creator, 0, 0);
        pick(challenger, 0, 1);

        vm.warp(now_() + 200);
        arena.lockPicks(matchId);
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.REFUNDED), "nobody's win is nobody's fault");
        assertEq(arena.creditOf(creator), ONE);
        assertEq(arena.creditOf(challenger), ONE);
        assertEq(arena.escrowed(), 0);

        resolveAll(0);
        arena.settleCard(matchId, 0);
        assertEq(arena.creditOf(creator), ONE + arena.pickOf(matchId, 0, 0).payoutBase, "the card still paid");
        assertSolvent();
    }

    function test_aVoidedWindowPaysHalfToBothSidesAndTheBetterEntryWins() public {
        stage(TIER_ONE);
        pickEveryCard(0);
        resolveAll(2);
        settleAll();
        arena.finalize(matchId);

        // Half of one collateral unit per contract, to whoever holds it — so the side that bought more
        // contracts for its stake comes out ahead. NO cost 0.45 here, YES cost 0.60.
        (int256 creatorPnl, int256 challengerPnl) = arena.pnlOf(matchId);
        assertLt(creatorPnl, 0, "YES paid 0.60 for a 0.50 refund");
        assertGt(challengerPnl, 0, "NO paid 0.45 for the same 0.50");
        assertEq(arena.creditOf(challenger), _payouts(1) + 2 * ONE);
        assertSolvent();
    }

    function test_settleCard_isIdempotentByCard() public {
        stage(TIER_ONE);
        pickEveryCard(0);
        resolveAll(0);
        arena.settleCard(matchId, 0);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.AlreadySettled.selector, matchId, uint8(0)));
        arena.settleCard(matchId, 0);
    }

    function test_finalize_waitsForEveryCardThatWasPlayed() public {
        stage(TIER_ONE);
        pickEveryCard(0);
        resolveAll(0);
        arena.settleCard(matchId, 0);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.CardsOutstanding.selector, matchId));
        arena.finalize(matchId);
    }

    function test_freeTier_escrowsNothingButPlaysRealOrders() public {
        stage(TIER_FREE);
        pickEveryCard(0);
        assertEq(arena.escrowed(), 0, "free carries no pot");
        assertGt(arena.pickOf(matchId, 0, 0).costBase, 0, "the picks still cost real money");
        resolveAll(0);
        settleAll();
        arena.finalize(matchId);
        assertEq(arena.creditOf(creator), _payouts(0), "payouts only, no pot");
        assertSolvent();
    }

    function test_cancelMatch_returnsTheCreatorsPot() public {
        createAs(TIER_ONE);
        assertEq(arena.escrowed(), ONE);
        vm.prank(creator);
        arena.cancelMatch(matchId);
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.REFUNDED));
        assertEq(arena.creditOf(creator), ONE);
        assertEq(arena.escrowed(), 0);
    }

    function test_refundUnjoined_isPermissionlessOnceTheJoinWindowClosed() public {
        createAs(TIER_ONE);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.DeadlineNotPassed.selector, uint64(now_() + 120)));
        arena.refundUnjoined(matchId);
        vm.warp(now_() + 121);
        vm.prank(stranger);
        arena.refundUnjoined(matchId);
        assertEq(arena.creditOf(creator), ONE);
    }

    function test_refundUnrevealed_returnsBothPotsWhenTheDeckIsLost() public {
        createAs(TIER_ONE);
        join();
        vm.warp(now_() + 61);
        vm.prank(stranger);
        arena.refundUnrevealed(matchId);
        assertEq(uint8(statusOf()), uint8(IGameArena.Status.REFUNDED));
        assertEq(arena.creditOf(creator), ONE);
        assertEq(arena.creditOf(challenger), ONE);
        assertSolvent();
    }

    function test_joinMatch_refusesEveryoneButTheNamedChallenger() public {
        createAs(TIER_ONE);
        usd.mint(stranger, 10 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(arena), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAPlayer.selector, stranger));
        arena.joinMatch(matchId);
        vm.stopPrank();
    }

    function test_lockPicks_refusesBeforeTheDeadline() public {
        stage(TIER_ONE);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.DeadlineNotPassed.selector, arena.matchOf(matchId).pickDeadlineSec));
        arena.lockPicks(matchId);
    }

    /// @dev Sum of the payouts credited to one seat over the whole deck.
    function _payouts(uint8 seat) internal view returns (uint256 total) {
        for (uint8 i = 0; i < uint8(cards.length); i++) {
            total += arena.pickOf(matchId, i, seat).payoutBase;
        }
    }
}
