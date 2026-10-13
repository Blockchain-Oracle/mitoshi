// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ArenaTestBase.sol (R4-9, D-227) — the mock venue is retired (A.6,
// D-018): each card is a real Window on the real engine over a real TIP-20, its book a real maker's PostOnly levels
// (`BookSeeder`), settled on a real RedStone close or a missed close. Same constants: three cards, YES asks at 0.60 and
// YES bids at 0.55 (so a NO buy costs 0.45), $1 pots and a $1 per-card cap, 120 / 60 / 180 / 240 s windows.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {ArenaCommitment} from "../../../src/products/arena/ArenaCommitment.sol";
import {GameArena} from "../../../src/products/arena/GameArena.sol";
import {IGameArena} from "../../../src/products/arena/IGameArena.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract ArenaTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint8 internal constant DECK = 3;
    uint8 internal constant TIER_FREE = 0;
    uint8 internal constant TIER_ONE = 1;
    uint32 internal constant POLICY = 1;
    /// 5,000 contracts a side: deep enough that no $1 pick walks past the first level.
    uint256 internal constant DEPTH = 5_000 * ONE;

    GameArena internal arena;

    address internal creator = makeAddr("creator");
    address internal challenger = makeAddr("challenger");
    address internal stranger = makeAddr("stranger");

    bytes32 internal matchId = bytes32(uint256(0xD0E1));
    bytes32 internal serverSeed = bytes32(uint256(0x5EED));
    bytes32[] internal clientSeeds;
    bytes32[] internal cards;

    function setUp() public virtual override {
        super.setUp();
        arena = new GameArena(IERC20(address(usd)), IEventsEngine(address(engine)), lens, launchParams());
        // The arena is an engine holder like any other: the fixture's exact-conservation check covers it.
        actors.push(address(arena));
        arena.setTier(TIER_FREE, IGameArena.Tier({potBase: 0, perCardCapBase: uint128(ONE), enabled: true}));
        arena.setTier(TIER_ONE, IGameArena.Tier({potBase: uint128(ONE), perCardCapBase: uint128(ONE), enabled: true}));

        clientSeeds.push(bytes32(uint256(0xC1)));
        clientSeeds.push(bytes32(uint256(0xC2)));
        addCard(m);
        for (uint256 i = 1; i < DECK; i++) addCard(list(START, LOCK, true));

        usd.mint(creator, 1_000 * ONE);
        usd.mint(challenger, 1_000 * ONE);
        vm.prank(creator);
        usd.approve(address(arena), type(uint256).max);
        vm.prank(challenger);
        usd.approve(address(arena), type(uint256).max);
    }

    function launchParams() internal pure returns (IGameArena.Params memory) {
        return IGameArena.Params({joinWindowSec: 120, revealWindowSec: 60, pickWindowSec: 180, minDeckSize: 3, maxDeckSize: 5, minCardLifeSec: 240});
    }

    /// @dev A Window with a two-sided book: YES asks at 0.60, YES bids at 0.55 — so a NO buy costs 0.45.
    function addCard(bytes32 mk) internal {
        clearSeeds(mk);
        restOrder(mk, KIND_BUY_NO, 600_000, DEPTH);
        restOrder(mk, KIND_BUY_YES, 550_000, DEPTH);
        cards.push(mk);
    }

    function restOrder(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(who(MAKER));
        engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_POST_ONLY, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, false, 0)
        );
    }

    function now_() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function deckHash() internal view returns (bytes32) {
        return ArenaCommitment.hash(block.chainid, address(arena), matchId, POLICY, serverSeed, clientSeeds, cards);
    }

    function createAs(uint8 tier) internal {
        vm.prank(creator);
        arena.createMatch(matchId, challenger, tier, deckHash(), uint8(cards.length), POLICY);
    }

    function join() internal {
        vm.prank(challenger);
        arena.joinMatch(matchId);
    }

    function reveal() internal {
        arena.revealDeck(matchId, serverSeed, clientSeeds, cards);
    }

    /// @dev Create, join and open the deck — the state every pick test starts from.
    function stage(uint8 tier) internal {
        createAs(tier);
        join();
        reveal();
    }

    function pick(address player, uint8 cardIndex, uint8 outcomeIdx) internal returns (uint256 quantity, uint256 cost) {
        vm.prank(player);
        (quantity, cost) = arena.placePick(matchId, cardIndex, outcomeIdx, ONE, 0);
        assertConserved();
    }

    /// @dev Both seats play every card: `creatorSide` for one, the other side for the opponent.
    function pickEveryCard(uint8 creatorSide) internal {
        for (uint8 i = 0; i < uint8(cards.length); i++) {
            pick(creator, i, creatorSide);
            pick(challenger, i, creatorSide == 0 ? 1 : 0);
        }
    }

    /// @dev Every card settles the production way: a real RedStone close above (0) or below (1) the open, then
    ///      `settle`; or (2) no close at all, so the Window voids once the grace has passed.
    function resolveAll(uint8 outcome) internal {
        for (uint256 i = 0; i < cards.length; i++) {
            (, uint40 expiry) = times(cards[i]);
            if (outcome == 2) {
                if (now_() < uint256(expiry) + 901) vm.warp(uint256(expiry) + 901);
                engine.voidExpired(cards[i]);
            } else {
                if (now_() < expiry) vm.warp(expiry);
                recordClose(cards[i], outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
                engine.settle(cards[i]);
            }
        }
    }

    function settleAll() internal {
        for (uint8 i = 0; i < uint8(cards.length); i++) {
            arena.settleCard(matchId, i);
        }
        assertConserved();
    }

    function statusOf() internal view returns (IGameArena.Status) {
        return arena.matchOf(matchId).status;
    }

    /// @dev The arena must always hold at least the pots it has not decided plus the credits it owes.
    function assertSolvent() internal view {
        assertGe(usd.balanceOf(address(arena)), arena.escrowed() + arena.credited(), "arena cannot cover pots and credits");
    }
}
