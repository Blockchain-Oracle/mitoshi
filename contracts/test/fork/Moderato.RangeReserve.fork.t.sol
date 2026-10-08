// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeReserve.fork.t.sol — the Shannon fork (OracleHub questions) becomes a
// Moderato fork (A.6): a band priced on the deployed engine's recorded open, a maker's rested book and the house's σ,
// bounded by a guard verifying the archived RedStone packages, and settled on the Window's real close print.

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {IRangeReserve} from "../../src/products/range/IRangeReserve.sol";
import {RangeReserve} from "../../src/products/range/RangeReserve.sol";
import {DeployRangeReserve} from "../../script/products/DeployRangeReserve.s.sol";
import "../../src/engine/EngineTypes.sol";

/// Run: `forge test --match-contract ModeratoRangeReserveForkTest` (network; excluded from `contracts:test`).
contract ModeratoRangeReserveForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint256 internal constant ONE = 1e6;
    uint64 internal constant DEPTH_LOTS = 25_000;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    FairValueGuard internal guard;
    RangeReserve internal reserve;
    IERC20 internal usd = IERC20(address(StdTokens.PATH_USD));
    bytes32 internal m;
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
        address roller = vm.parseJsonAddress(j, ".roles.ROLLER");
        uint16 ticker = lens.seriesOf(btc5).ticker;

        vm.warp(T - 60);
        vm.prank(roller);
        m = engine.openWindow(OpenWindowArgs(btc5, 0, T, T + 300, T + 300, 0, 0));
        vm.warp(T + 15);
        engine.recordPrint(m, WHICH_OPEN, _payload(T));

        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(ticker, rs, bytes32("BTC"));
        DeployRangeReserve script = new DeployRangeReserve();
        reserve = new RangeReserve(usd, engine, lens, guard, script.launchParams());
        (string[3] memory assets, uint64[3] memory sigmas) = script.launchVolatility();
        reserve.setVolatility(assets[0], sigmas[0]);
        reserve.setAssetTicker("BTC", ticker);
        assertEq(script.tickerOf("BTC-5m"), ticker, "venue-spec agrees with the deployed Series");

        vm.startPrank(FUNDER);
        usd.transfer(house, 100 * ONE);
        usd.transfer(opener, 40 * ONE);
        usd.transfer(maker, 50 * ONE);
        vm.stopPrank();
        vm.startPrank(house);
        usd.approve(address(reserve), type(uint256).max);
        reserve.supply(100 * ONE);
        vm.stopPrank();
        vm.prank(opener);
        usd.approve(address(reserve), type(uint256).max);
        vm.startPrank(maker);
        usd.approve(address(engine), type(uint256).max);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 520, DEPTH_LOTS, T + 300, 16, 16, false, false, 1));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 480, DEPTH_LOTS, T + 300, 16, 16, false, false, 2));
        vm.stopPrank();
        vm.warp(T + 35); // rested 20 s; the spot proof is 35 s old
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function test_fork_bandPricedOnTheEnginesOpenBoundedByTheRealSpotSettlesOnTheRealClose() public {
        int256 open = int256(lens.marketRef(m).openE8) / 1e6; // 83,168.48 in cents
        assertEq(open, 8_316_848);
        (int256 low, int256 high) = (open - 10_000, open + 10_000); // ± $100
        (uint256 stake, uint256 probRaw, int256 openingPrint, IRangeReserve.Basis memory basis) =
            reserve.previewOpen(m, "BTC", IRangeReserve.Side.INSIDE, low, high, 20 * ONE);
        assertEq(openingPrint, open);
        assertEq(basis.centerQE6, 500_000, "the maker's 0.48/0.52 mid");
        assertEq(basis.tauSec, 265);
        console2.log("P(inside +/-$100) x1e6", probRaw);
        console2.log("stake for 20", stake);
        assertEq(reserve.previewDriftE4(m, "BTC", lens.marketRef(m).openE8), 0, "spot = open: no drift");

        vm.prank(opener);
        (uint256 idIn, uint256 paid) =
            reserve.openRange(m, "BTC", IRangeReserve.Side.INSIDE, low, high, 20 * ONE, type(uint256).max, _payload(T));
        assertEq(paid, stake);
        vm.prank(opener);
        (uint256 idOut,) = reserve.openRange(m, "BTC", IRangeReserve.Side.OUTSIDE, low, high, 20 * ONE, type(uint256).max, _payload(T));

        vm.warp(T + 315);
        engine.recordPrint(m, WHICH_CLOSE, _payload(T + 300)); // 83,220.17: +$51.69, inside ± $100
        engine.settle(m);
        vm.prank(makeAddr("fork-cranker"));
        reserve.settle(idIn);
        reserve.settle(idOut);
        assertEq(reserve.roundOf(idIn).closingPrint, 8_322_017);
        assertEq(uint8(reserve.roundOf(idIn).status), uint8(IRangeReserve.RoundStatus.WON));
        assertEq(uint8(reserve.roundOf(idOut).status), uint8(IRangeReserve.RoundStatus.LOST));
        uint256 before = usd.balanceOf(opener);
        reserve.claim(idIn);
        assertEq(usd.balanceOf(opener), before + 20 * ONE);
        assertEq(reserve.locked(), 0);
        assertEq(usd.balanceOf(address(reserve)), reserve.liquid());
    }
}
