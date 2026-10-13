// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// R4-9 (D-227): the arena on Moderato. Two checks over the network, in the shape of Masayume 68f7a09's
// contracts/test/GameArena.fork.t.sol: the deployed GameArena is wired to the live engine as DeployGameArena says, and a
// whole duel runs on the live engine — a real BTC-5m Window opened by the roller, a maker's real book, both seats' picks
// as measured IOCs, the card settled on the Window's real RedStone close, the pot awarded and claimed.
// Run: `forge test --match-contract ModeratoGameArenaForkTest` (network; excluded from `contracts:test`).

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {ArenaCommitment} from "../../src/products/arena/ArenaCommitment.sol";
import {GameArena} from "../../src/products/arena/GameArena.sol";
import {IGameArena} from "../../src/products/arena/IGameArena.sol";
import {DeployGameArena} from "../../script/products/DeployGameArena.s.sol";
import "../../src/engine/EngineTypes.sol";

contract ModeratoGameArenaForkTest is Test {
    /// The PrivateDesk fork's block and Window (acceptance/S2.md): the repo holds that Window's real open and close prints.
    uint256 internal constant BLOCK = 37_370_209;
    uint40 internal constant T = 1_790_658_600;
    uint256 internal constant ONE = 1e6;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IERC20 internal usd = IERC20(address(StdTokens.PATH_USD));
    address internal creator = makeAddr("fork-creator");
    address internal challenger = makeAddr("fork-challenger");
    address internal maker = makeAddr("fork-maker");

    function _engine() internal view returns (IEventsEngine engine, EngineLens lens, string memory j) {
        j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    /// The deployed arena, read at the chain's head: the engine, lens and collateral it trades, its windows and tiers.
    function test_fork_theDeployedArenaIsWiredAsTheScriptSays() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz");
        (IEventsEngine engine, EngineLens lens,) = _engine();
        GameArena arena = GameArena(vm.parseJsonAddress(vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/arena.json")), ".contracts.GameArena.address"));
        assertEq(address(arena.engine()), address(engine));
        assertEq(address(arena.lens()), address(lens));
        assertEq(address(arena.collateral()), engine.collateral());
        assertTrue(lens.crankOptedOut(address(arena)), "opted out of third-party cranks");
        DeployGameArena script = new DeployGameArena();
        IGameArena.Params memory want = script.launchParams();
        (uint32 join, uint32 reveal, uint32 pickWin, uint8 minDeck, uint8 maxDeck, uint32 life) = arena.params();
        assertEq(abi.encode(join, reveal, pickWin, minDeck, maxDeck, life), abi.encode(want.joinWindowSec, want.revealWindowSec, want.pickWindowSec, want.minDeckSize, want.maxDeckSize, want.minCardLifeSec));
        IGameArena.Tier[4] memory tiers = script.launchTiers();
        for (uint8 i = 0; i < 4; i++) {
            (uint128 pot, uint128 cap, bool enabled) = arena.tierOf(i);
            assertEq(abi.encode(pot, cap, enabled), abi.encode(tiers[i].potBase, tiers[i].perCardCapBase, tiers[i].enabled));
        }
    }

    /// A whole $1 duel on the live engine: one real BTC-5m card, UP against DOWN, settled on its real close (Up).
    function test_fork_aDuelPlaysOnALiveWindowAndTheRealCloseDecidesThePot() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        (IEventsEngine engine, EngineLens lens, string memory j) = _engine();
        bytes32 btc5 = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        vm.warp(T - 60);
        vm.prank(vm.parseJsonAddress(j, ".roles.ROLLER"));
        bytes32 m = engine.openWindow(OpenWindowArgs(btc5, 0, T, T + 300, T + 300, 0, 0));
        vm.warp(T + 15);
        engine.recordPrint(m, WHICH_OPEN, _payload(T));

        // One card is enough here (the deployed arena deals 2–5); the windows are the deployed ones.
        IGameArena.Params memory p = new DeployGameArena().launchParams();
        p.minDeckSize = 1;
        GameArena arena = new GameArena(usd, engine, lens, p);
        arena.setTier(1, IGameArena.Tier({potBase: uint128(ONE), perCardCapBase: uint128(ONE), enabled: true}));

        vm.startPrank(FUNDER);
        usd.transfer(creator, 10 * ONE);
        usd.transfer(challenger, 10 * ONE);
        usd.transfer(maker, 50 * ONE);
        vm.stopPrank();
        vm.startPrank(maker);
        usd.approve(address(engine), type(uint256).max);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 520, 40_000, T + 300, 16, 16, false, false, 1));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 480, 40_000, T + 300, 16, 16, false, false, 2));
        vm.stopPrank();
        vm.warp(T + 35);

        bytes32 matchId = keccak256("fork-duel");
        bytes32 serverSeed = keccak256("fork-server-seed");
        bytes32[] memory seeds = new bytes32[](2);
        seeds[0] = keccak256("creator-seed");
        seeds[1] = keccak256("challenger-seed");
        bytes32[] memory cards = new bytes32[](1);
        cards[0] = m;
        bytes32 deckHash = ArenaCommitment.hash(block.chainid, address(arena), matchId, 2, serverSeed, seeds, cards);

        vm.startPrank(creator);
        usd.approve(address(arena), type(uint256).max);
        arena.createMatch(matchId, challenger, 1, deckHash, 1, 2);
        vm.stopPrank();
        vm.startPrank(challenger);
        usd.approve(address(arena), type(uint256).max);
        arena.joinMatch(matchId);
        vm.stopPrank();
        arena.revealDeck(matchId, serverSeed, seeds, cards);

        vm.prank(creator);
        (uint256 upQty, uint256 upCost) = arena.placePick(matchId, 0, 0, ONE, 0);
        vm.prank(challenger);
        (uint256 downQty, uint256 downCost) = arena.placePick(matchId, 0, 1, ONE, 0);
        assertEq(uint8(arena.matchOf(matchId).status), uint8(IGameArena.Status.SETTLING), "the last pick locks the match");
        assertGt(upQty, 0);
        assertGt(downQty, 0);
        assertLe(upCost, ONE);
        assertLe(downCost, ONE);
        assertEq(uint256(lens.positionOf(m, address(arena)).yesFree) * 1000, upQty, "UP held in the engine for the creator");
        assertEq(uint256(lens.positionOf(m, address(arena)).noFree) * 1000, downQty, "DOWN held in the engine for the challenger");

        vm.warp(T + 315);
        engine.recordPrint(m, WHICH_CLOSE, _payload(T + 300)); // 83,168.48 → 83,220.17: Up
        engine.settle(m);
        arena.settleCard(matchId, 0);
        arena.finalize(matchId);
        assertEq(uint8(arena.matchOf(matchId).status), uint8(IGameArena.Status.FINALIZED));
        assertEq(arena.creditOf(creator), upQty + 2 * ONE, "the winning side's payout and both pots");
        assertEq(arena.creditOf(challenger), 0);
        uint256 before = usd.balanceOf(creator);
        vm.prank(makeAddr("fork-cranker"));
        arena.claimCredit(creator);
        assertEq(usd.balanceOf(creator), before + upQty + 2 * ONE, "paid to the player, whoever cranked");
        assertGe(usd.balanceOf(address(arena)), arena.escrowed() + arena.credited());
    }
}
