// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/GameArena.picks.t.sol (R4-9, D-227) — on the real engine (ArenaTestBase).
// Engine substitutions: a thin book is a real maker's thin level; the venue's 0.1-contract minimum is the engine's one
// lot (an empty side is what now meets it); "stopped trading" is a card too close to its lock (`TooLate` at `lockAt`);
// the other-venue reveal becomes the constructor's own pins (`WrongCollateral`, `WrongLens`); the pool-address storage
// check is gone (the arena never sees one). Every other assertion is Masayume's, at the engine's 0.001 lot.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {ArenaTestBase} from "../harness/ArenaTestBase.sol";
import {ArenaCommitment} from "../../../src/products/arena/ArenaCommitment.sol";
import {GameArena} from "../../../src/products/arena/GameArena.sol";
import {IGameArena} from "../../../src/products/arena/IGameArena.sol";
import "../../../src/engine/EngineTypes.sol";

/// @notice What one pick is allowed to be. The arena never promises a fill and never books a quote —
///         every figure here is a delta it measured, and every refusal happens before money moves.
contract GameArenaPicksTest is ArenaTestBase {
    function test_placePick_booksWhatMovedAndSendsTheRestBack() public {
        stage(TIER_ONE);
        uint256 before = usd.balanceOf(creator);
        (uint256 quantity, uint256 cost) = pick(creator, 0, 0);

        IGameArena.PickRecord memory rec = arena.pickOf(matchId, 0, 0);
        assertEq(rec.quantity, quantity, "recorded the measured quantity");
        assertEq(rec.costBase, cost, "recorded the measured cost");
        assertTrue(rec.placed);
        assertEq(before - usd.balanceOf(creator), cost, "the player paid exactly the fill");
        assertLt(cost, ONE, "the unspent part of the cap went home");
        assertEq(rec.outcomeIdx, 0);
        assertSolvent();
    }

    /// @dev The quote the readiness screen shows and the order the pick places are the same walk.
    function test_sizeForStake_quotesTheSizeThePickThenTakes() public {
        stage(TIER_ONE);
        IGameArena.Quote memory q = arena.sizeForStake(cards[0], 0, ONE);
        (uint256 quantity, uint256 cost) = pick(creator, 0, 0);
        assertEq(quantity, q.quantityRaw, "quantity");
        assertEq(cost, q.costRaw, "cost");
    }

    /// @dev A book too thin for the whole cap fills what it can and records that, rather than reverting:
    ///      a partial fill is a real position, and pretending otherwise would lose the player the card.
    function test_placePick_recordsAPartialFillAsTheTruth() public {
        stage(TIER_ONE);
        clearSeeds(cards[0]);
        restOrder(cards[0], KIND_BUY_NO, 600_000, 200_000);
        restOrder(cards[0], KIND_BUY_YES, 550_000, 200_000);
        (uint256 quantity, uint256 cost) = pick(creator, 0, 0);
        assertEq(quantity, 200_000, "only what the book held");
        assertEq(cost, 120_000, "0.2 contracts at 0.60");
        assertEq(usd.balanceOf(address(arena)), 2 * ONE, "nothing but the two pots stayed behind");
    }

    function test_placePick_refusesABookThatCannotMeetTheVenuesMinimum() public {
        stage(TIER_ONE);
        // Only bids rest: a YES buy has nothing to take, so it cannot reach the engine's one lot.
        clearSeeds(cards[0]);
        restOrder(cards[0], KIND_BUY_YES, 550_000, DEPTH);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BelowMinQuantity.selector, 0, 1_000));
        arena.placePick(matchId, 0, 0, ONE, 0);
    }

    function test_placePick_refusesAMinimumTheBookCannotMeet() public {
        stage(TIER_ONE);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BelowMinQuantity.selector, 1_666_000, 5_000_000));
        arena.placePick(matchId, 0, 0, ONE, 5_000_000);
    }

    function test_placePick_capsOneCardAtTheTiersOwnCap() public {
        stage(TIER_ONE);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.StakeAboveCap.selector, 2 * ONE, uint128(ONE)));
        arena.placePick(matchId, 0, 0, 2 * ONE, 0);
    }

    function test_placePick_refusesASecondPickOnTheSameCard() public {
        stage(TIER_ONE);
        pick(creator, 0, 0);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.AlreadyPicked.selector, matchId, uint8(0), creator));
        arena.placePick(matchId, 0, 1, ONE, 0);
    }

    function test_placePick_refusesAnyoneWhoIsNotSeatedInTheMatch() public {
        stage(TIER_ONE);
        usd.mint(stranger, 10 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(arena), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.NotAPlayer.selector, stranger));
        arena.placePick(matchId, 0, 0, ONE, 0);
        vm.stopPrank();
    }

    function test_placePick_refusesACardOutsideTheDeck() public {
        stage(TIER_ONE);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BadCard.selector, uint8(9)));
        arena.placePick(matchId, 9, 0, ONE, 0);
    }

    function test_placePick_refusesOnceTheDeadlineHasPassed() public {
        stage(TIER_ONE);
        uint64 deadline = arena.matchOf(matchId).pickDeadlineSec;
        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.DeadlinePassed.selector, deadline));
        arena.placePick(matchId, 0, 0, ONE, 0);
    }

    /// @dev Inside the card's last `minCardLifeSec` before lock no pick is taken, though the pick window still runs.
    function test_placePick_refusesACardTooCloseToItsLock() public {
        stage(TIER_ONE);
        vm.warp(LOCK - 239);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.TooLate.selector, cards[0], uint64(LOCK)));
        arena.placePick(matchId, 0, 0, ONE, 0);
    }

    /// @dev Pausing must never trap a position or a pot: it stops new risk and nothing else.
    function test_pause_stopsNewPicksAndLetsEverySettlementThrough() public {
        stage(TIER_ONE);
        pickEveryCard(0);
        arena.setPaused(true);

        vm.prank(creator);
        vm.expectRevert(IGameArena.IsPaused.selector);
        arena.createMatch(bytes32(uint256(2)), challenger, TIER_ONE, deckHash(), DECK, POLICY);

        resolveAll(0);
        settleAll();
        arena.finalize(matchId);
        vm.prank(stranger);
        arena.claimCredit(creator);
        assertGt(usd.balanceOf(creator), 0, "the paused arena still paid out");
    }

    function test_revealDeck_refusesADeckThatIsNotTheOneCommitted() public {
        createAs(TIER_ONE);
        join();
        bytes32[] memory swapped = new bytes32[](3);
        swapped[0] = cards[1];
        swapped[1] = cards[0];
        swapped[2] = cards[2];
        bytes32 got = ArenaCommitment.hash(block.chainid, address(arena), matchId, POLICY, serverSeed, clientSeeds, swapped);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.DeckMismatch.selector, deckHash(), got));
        arena.revealDeck(matchId, serverSeed, clientSeeds, swapped);
    }

    function test_revealDeck_refusesADeckOfTheWrongSize() public {
        createAs(TIER_ONE);
        join();
        bytes32[] memory two = new bytes32[](2);
        two[0] = cards[0];
        two[1] = cards[1];
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BadDeckSize.selector, uint8(2)));
        arena.revealDeck(matchId, serverSeed, clientSeeds, two);
    }

    /// @dev A deck whose Windows are about to lock is a deck nobody can play, so it is refused before the
    ///      pick deadline starts running against two players who have no move.
    function test_revealDeck_refusesAWindowWithNoLifeLeft() public {
        IGameArena.Params memory p = launchParams();
        p.revealWindowSec = 120;
        arena.setParams(p);
        createAs(TIER_ONE);
        join();
        vm.warp(LOCK - 239);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.TooLate.selector, cards[0], uint64(LOCK)));
        reveal();
    }

    /// @dev Two cards on one Window settle on one print, so a player who reads it right is paid twice
    ///      for a single call — the deck stops measuring anything.
    function test_revealDeck_refusesTheSameWindowTwice() public {
        bytes32 repeated = cards[1];
        cards[2] = repeated;
        createAs(TIER_ONE);
        join();
        vm.expectRevert(abi.encodeWithSelector(IGameArena.DuplicateCard.selector, repeated));
        reveal();
    }

    /// @dev Parameters that let the pick window outlast the cards would forfeit players for a deadline
    ///      the arena itself made impossible to meet.
    function test_setParams_refusesAPickWindowLongerThanTheCardsMustLive() public {
        IGameArena.Params memory bad = launchParams();
        bad.minCardLifeSec = bad.pickWindowSec;
        vm.expectRevert(IGameArena.BadParams.selector);
        arena.setParams(bad);
    }

    /// @dev The arena only ever trades the engine it was built on, in that engine's own collateral.
    function test_constructor_refusesAnotherCollateralOrLens() public {
        vm.expectRevert(abi.encodeWithSelector(IGameArena.WrongCollateral.selector, address(usd)));
        new GameArena(IERC20(address(0xBEEF)), IEventsEngine(address(engine)), lens, launchParams());
        IEngineLens otherLens = IEngineLens(address(new EngineLens(address(0xBEEF))));
        vm.expectRevert(abi.encodeWithSelector(IGameArena.WrongLens.selector, address(otherLens)));
        new GameArena(IERC20(address(usd)), IEventsEngine(address(engine)), otherLens, launchParams());
    }

    function test_createMatch_refusesADisabledTier() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.UnknownTier.selector, uint8(7)));
        arena.createMatch(matchId, challenger, 7, deckHash(), DECK, POLICY);
    }

    function test_createMatch_refusesADuplicateMatchIdAndSelfPlay() public {
        createAs(TIER_ONE);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.MatchExists.selector, matchId));
        arena.createMatch(matchId, challenger, TIER_ONE, deckHash(), DECK, POLICY);

        vm.prank(creator);
        vm.expectRevert(IGameArena.SelfJoin.selector);
        arena.createMatch(bytes32(uint256(9)), creator, TIER_ONE, deckHash(), DECK, POLICY);
    }

    function test_createMatch_refusesADeckOutsideThePolicysSize() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IGameArena.BadDeckSize.selector, uint8(2)));
        arena.createMatch(matchId, challenger, TIER_ONE, deckHash(), 2, POLICY);
    }

}
