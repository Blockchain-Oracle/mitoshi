// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/LeverageReserve.fork.t.sol — the Shannon fork becomes a Moderato fork
// (A.6): a stake sized off a maker's book on the deployed engine, bought as the reserve's measured IOC, bounded by a
// guard verifying the archived RedStone packages, a lowball-bid knock-out the real spot refuses (PD-2), and settlement
// on the Window's real close print.

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {ILeverageReserve} from "../../src/products/leverage/ILeverageReserve.sol";
import {LeverageReserve} from "../../src/products/leverage/LeverageReserve.sol";
import {DeployLeverageReserve} from "../../script/products/DeployLeverageReserve.s.sol";
import "../../src/engine/EngineTypes.sol";

/// Run: `forge test --match-contract ModeratoLeverageReserveForkTest` (network; excluded from `contracts:test`).
contract ModeratoLeverageReserveForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint256 internal constant ONE = 1e6;
    uint64 internal constant DEPTH_LOTS = 60_000;
    uint64 internal constant BTC_SIGMA_E8 = 8_903; // fair.json sigmaE8.BTC-5m
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    FairValueGuard internal guard;
    LeverageReserve internal reserve;
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

        vm.warp(T - 60);
        vm.prank(roller);
        m = engine.openWindow(OpenWindowArgs(btc5, 0, T, T + 300, T + 300, 0, 0));
        vm.warp(T + 15);
        engine.recordPrint(m, WHICH_OPEN, _payload(T));

        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(lens.seriesOf(btc5).ticker, rs, bytes32("BTC"));
        guard.setSigma(btc5, BTC_SIGMA_E8);
        reserve = new LeverageReserve(usd, engine, lens, guard, new DeployLeverageReserve().launchParams());

        vm.startPrank(FUNDER);
        usd.transfer(house, 100 * ONE);
        usd.transfer(opener, 20 * ONE);
        usd.transfer(maker, 100 * ONE);
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

    function test_fork_boostOpensOnTheBookHoldsAgainstASpoofedBookAndSettlesOnTheRealClose() public {
        ILeverageReserve.Preview memory q = reserve.sizeForStake(m, 0, 10 * ONE, 20_000);
        assertEq(q.priceRaw, 520_000, "UP at the maker's rested 0.52 ask");
        console2.log("contracts for 10 at 2x", q.quantityRaw);
        vm.prank(opener);
        (uint256 id, uint256 charged) = reserve.open(m, 0, 10 * ONE, 20_000, q.quantityRaw, _payload(T));
        assertLe(charged, 10 * ONE);
        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertEq(p.quantityRaw, q.quantityRaw);
        assertEq(uint256(lens.positionOf(m, address(reserve)).yesFree) * 1000, p.quantityRaw, "held in the engine");

        // The maker pulls its bid and rests a lowball one: rested depth now says knock out, the real spot does not.
        vm.startPrank(maker);
        engine.cancelAll(m, 16, true);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 200, DEPTH_LOTS, T + 300, 16, 16, false, false, 3));
        vm.stopPrank();
        vm.warp(T + 60);
        (,,, bool bookSays) = reserve.markOf(id);
        assertTrue(bookSays, "the lowball bid puts the book mark under the line");
        (uint256 fairMark,) = reserve.fairMarkOf(id, lens.marketRef(m).openE8);
        bytes memory proof = _payload(T); // 60 s old: the spot sits on the open, fair P(Up) = 0.50
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.FairValueHealthy.selector, id, fairMark, p.fronted * 12_000 / 10_000));
        reserve.knockOut(id, proof);

        vm.warp(T + 315);
        engine.recordPrint(m, WHICH_CLOSE, _payload(T + 300)); // 83,168.48 → 83,220.17: Up
        engine.settle(m);
        uint256 before = usd.balanceOf(opener);
        vm.prank(makeAddr("fork-keeper"));
        (uint256 payout, uint256 reclaimed, uint256 returned) = reserve.settle(id);
        assertEq(payout, p.quantityRaw, "a winning contract pays a whole unit");
        assertEq(reclaimed, p.fronted);
        assertEq(returned, p.quantityRaw - p.fronted);
        assertEq(usd.balanceOf(opener), before + returned);
        assertEq(usd.balanceOf(address(reserve)), reserve.liquid());
        assertEq(reserve.outstanding(), 0);
    }
}
