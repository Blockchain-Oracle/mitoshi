// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ParlayReserve.fork.t.sol — the Shannon fork becomes a Moderato fork (A.6):
// legs priced off the deployed engine's rested book inside the open, bounded by a guard reading the real RedStone
// packages, the escrow, a leg settled on the real close print, and a void through the engine's permissionless
// `voidExpired` refunding the stake. Masayume scanned the venue for two live markets; a replay at a pinned block has
// one archived boundary pair (BTC 06:10Z → 06:15Z), so the second leg is a 10-minute BTC Series the test registers as
// the engine admin on the fork — both open on the same real print, only the 5-minute one has a real close.

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {IParlayReserve} from "../../src/products/parlay/IParlayReserve.sol";
import {ParlayReserve} from "../../src/products/parlay/ParlayReserve.sol";
import {DeployParlayReserve} from "../../script/products/DeployParlayReserve.s.sol";
import "../../src/engine/EngineTypes.sol";

/// Run: `forge test --match-contract ModeratoParlayReserveForkTest` (network; excluded from `contracts:test`).
contract ModeratoParlayReserveForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint256 internal constant ONE = 1e6;
    uint256 internal constant PAYOUT = 20 * ONE;
    uint64 internal constant DEPTH_LOTS = 25_000; // 25 contracts a side, over the 20-contract pricing floor
    uint64 internal constant BTC_SIGMA_E8 = 8_903; // fair.json sigmaE8.BTC-5m
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    FairValueGuard internal guard;
    ParlayReserve internal reserve;
    IERC20 internal usd = IERC20(address(StdTokens.PATH_USD));
    address internal admin;
    address internal roller;
    bytes32 internal a5; // BTC-5m, T → T+300 (real close)
    bytes32 internal b10; // BTC-10m (fork-registered), T → T+600
    address internal house = makeAddr("fork-house");
    address internal opener = makeAddr("fork-opener");
    address internal maker = makeAddr("fork-maker");

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        IPrintVerifier rs = IPrintVerifier(vm.parseJsonAddress(j, ".contracts.RedStonePrintVerifier.address"));
        bytes32 btc5 = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        admin = vm.parseJsonAddress(j, ".roles.ADMIN");
        roller = vm.parseJsonAddress(j, ".roles.ROLLER");

        // A 10-minute BTC Series on the same launch policy (feed, verifier, admission) as the deployed 5-minute one.
        uint16 ticker = lens.seriesOf(btc5).ticker;
        vm.startPrank(admin);
        bytes32 btc10 = engine.registerSeries(RegisterSeriesArgs(ticker, BASIS_REGULAR, 600, 1000, 1000, 1000, 20, 400_000, 16, 16));
        engine.addPolicyVersion(btc10, 0, lens.policyOf(btc5, 0));
        vm.stopPrank();

        vm.warp(T - 60);
        vm.startPrank(roller);
        a5 = engine.openWindow(OpenWindowArgs(btc5, 0, T, T + 300, T + 300, 0, 0));
        b10 = engine.openWindow(OpenWindowArgs(btc10, 0, T, T + 600, T + 600, 0, 0));
        vm.stopPrank();
        vm.warp(T + 15);
        engine.recordPrint(a5, WHICH_OPEN, _payload(T));
        engine.recordPrint(b10, WHICH_OPEN, _payload(T));

        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(ticker, rs, bytes32("BTC"));
        guard.setSigma(btc5, BTC_SIGMA_E8);
        guard.setSigma(btc10, BTC_SIGMA_E8);
        reserve = new ParlayReserve(usd, engine, lens, guard, new DeployParlayReserve().launchParams());

        vm.startPrank(FUNDER);
        usd.transfer(house, 50 * ONE);
        usd.transfer(opener, 20 * ONE);
        usd.transfer(maker, 50 * ONE);
        vm.stopPrank();
        vm.prank(house);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(house);
        reserve.supply(50 * ONE);
        vm.prank(opener);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(maker);
        usd.approve(address(engine), type(uint256).max);

        // A maker's depth on both Windows around even odds: YES asks at 0.52 (BUY_NO), YES bids at 0.48.
        _quote(a5, T + 300);
        _quote(b10, T + 600);
        vm.warp(T + 35); // rested 20 s (D-109); the spot proof is 35 s old
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function _quote(bytes32 m, uint40 lockAt) internal {
        vm.startPrank(maker);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 520, DEPTH_LOTS, lockAt, 16, 16, false, false, 1));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 480, DEPTH_LOTS, lockAt, 16, 16, false, false, 2));
        vm.stopPrank();
    }

    function test_fork_opensOnTheRestedBookBoundedByTheRealSpotThenWinsALegAndVoids() public {
        IParlayReserve.LegInput[] memory legs = new IParlayReserve.LegInput[](2);
        legs[0] = IParlayReserve.LegInput(b10, 0); // closes second
        legs[1] = IParlayReserve.LegInput(a5, 0);
        (uint256 previewStake, uint256 combined, uint256[] memory prices,) = reserve.previewOpen(legs, PAYOUT);
        assertEq(prices[0], 520_000, "UP = the maker's rested 0.52 ask");
        assertEq(prices[1], 520_000);
        assertEq(combined, 270_400);
        assertEq(previewStake, 6_056_960, "ceil(20 x 0.2704) x 1.12");
        // The guard's model on the real packages: spot = the open print, so fair P(Up) is even.
        assertEq(guard.previewFairUpE6(a5, lens.marketRef(a5).openE8), 500_000);

        bytes[] memory proofs = new bytes[](2);
        proofs[0] = _payload(T);
        proofs[1] = _payload(T);
        uint256 before = usd.balanceOf(opener);
        vm.prank(opener);
        (uint256 id, uint256 stake) = reserve.openParlay(legs, PAYOUT, type(uint256).max, proofs);
        assertEq(stake, previewStake);
        assertEq(usd.balanceOf(opener), before - stake);
        assertEq(usd.balanceOf(address(reserve)), 50 * ONE + stake);
        console2.log("stake for a 20 payout", stake);

        // D-108: the 5-minute leg decides first; the 10-minute leg waits its turn even once both are terminal.
        vm.warp(T + 315);
        engine.recordPrint(a5, WHICH_CLOSE, _payload(T + 300)); // 83,168.48 → 83,220.17: Up
        engine.settle(a5);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.LegOutOfOrder.selector, id, 0, 1));
        reserve.resolveLeg(id, 0);
        reserve.resolveLeg(id, 1);
        assertEq(uint8(reserve.legsOf(id)[1].status), uint8(IParlayReserve.LegStatus.WON));
        assertEq(reserve.lockedByExpiry(T + 300), 0, "L-38: the 06:15Z print is decided");
        assertEq(reserve.lockedByExpiry(T + 600), PAYOUT - stake);

        // No 06:20Z close in the archive: the Window voids for anyone after its admission deadline; the stake comes back.
        vm.warp(T + 600 + 901);
        engine.voidExpired(b10);
        vm.prank(makeAddr("fork-cranker"));
        reserve.resolveLeg(id, 0);
        assertEq(uint8(reserve.parlayOf(id).status), uint8(IParlayReserve.ParlayStatus.VOID));
        assertEq(usd.balanceOf(opener), before, "refunded to the base unit");
        assertEq(reserve.locked(), 0);
        assertEq(reserve.liquid(), 50 * ONE);
        assertEq(usd.balanceOf(address(reserve)), 50 * ONE);
    }
}
