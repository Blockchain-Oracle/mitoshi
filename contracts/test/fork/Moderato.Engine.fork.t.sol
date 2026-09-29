// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {EventsEngine} from "../../src/engine/EventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {PositionView} from "../../src/engine/interfaces/IEngineLens.sol";
import "../../src/engine/EngineTypes.sol";

/// S2.12: the deployed Moderato venue (contracts/deployments/42431/engine.json) on a fork pinned right after the deploy
/// (before the live drive), replaying the drive's Window with the same real RedStone BTC packages it posted
/// (fixtures/prints/redstone-btc-<T>.hex): roller listing, pre-open PostOnly quotes, open print, two takers, a TIP-1028
/// receive-policy hold on the crank, close print, settle, redeems, and exact accounting on the real engine.
/// Run: `forge test --match-contract ModeratoEngineForkTest` (network; excluded from `contracts:test`).
contract ModeratoEngineForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600; // the live drive's Window (06:10:00Z)
    uint40 internal constant LOCK = T + 300;

    EventsEngine internal engine;
    EngineLens internal lens;
    bytes32 internal btcSeries;
    address internal roller;
    address internal maker = makeAddr("fork-maker");
    address internal keeper = makeAddr("fork-keeper");
    address internal desk = makeAddr("fork-desk");
    /// A Moderato address holding test pathUSD at BLOCK (the deployer, funded by the faucet in S0.10).
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = EventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        btcSeries = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        roller = vm.parseJsonAddress(j, ".roles.ROLLER");
        address[3] memory who = [maker, keeper, desk];
        for (uint256 i; i < 3; ++i) {
            vm.prank(FUNDER);
            StdTokens.PATH_USD.transfer(who[i], 100e6);
            vm.prank(who[i]);
            StdTokens.PATH_USD.approve(address(engine), type(uint256).max);
        }
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function _order(bytes32 m, uint8 kind, uint8 orderType, uint16 price, uint64 lots) internal pure returns (PlaceArgs memory) {
        return PlaceArgs(m, kind, orderType, 0, price, lots, LOCK, 16, 16, false, false, 0);
    }

    function test_theDeployedVenueRunsAWindowEndToEnd() public {
        assertEq(engine.collateral(), address(StdTokens.PATH_USD));
        assertEq(lens.seriesOf(btcSeries).minLots, 1_000);
        vm.warp(T - 60);
        vm.prank(roller);
        bytes32 m = engine.openWindow(OpenWindowArgs(btcSeries, 0, T, LOCK, LOCK, 0, 0));
        assertEq(lens.status(m), STATUS_LISTED);
        vm.startPrank(maker);
        engine.placeOrder(_order(m, KIND_BUY_YES, ORDER_POST_ONLY, 500, 2_000));
        engine.placeOrder(_order(m, KIND_BUY_NO, ORDER_POST_ONLY, 520, 2_000));
        vm.stopPrank();
        vm.prank(keeper);
        vm.expectRevert(bytes4(keccak256("PreOpenTakerRefused()")));
        engine.placeOrder(_order(m, KIND_BUY_YES, ORDER_IOC, 530, 1_000));

        vm.warp(T + 15);
        vm.prank(keeper);
        vm.expectRevert(bytes4(keccak256("OpenPrintMissing()")));
        engine.placeOrder(_order(m, KIND_BUY_YES, ORDER_IOC, 530, 1_000));
        engine.recordPrint(m, WHICH_OPEN, _payload(T));
        assertGt(lens.marketRef(m).openE8, 0);
        vm.prank(keeper);
        assertEq(engine.placeOrder(_order(m, KIND_BUY_YES, ORDER_IOC, 530, 1_000)).filledLots, 1_000);
        vm.startPrank(desk);
        engine.placeOrder(_order(m, KIND_BUY_NO, ORDER_IOC, 500, 1_000));
        engine.mintSet(m, 1_000, false);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, desk);
        vm.stopPrank();
        assertEq(StdTokens.PATH_USD.balanceOf(address(engine)), lens.config().totalOwed, "balance == ledger");

        vm.warp(LOCK + 15);
        engine.recordPrint(m, WHICH_CLOSE, _payload(LOCK));
        engine.settle(m);
        assertTrue(lens.isResolved(m));
        (uint64 paid, bool held) = engine.redeemFor(m, keeper);
        assertFalse(held);
        (uint64 deskPaid, bool deskHeld) = engine.redeemFor(m, desk);
        assertEq(deskPaid, 0);
        assertTrue(deskHeld, "the desk's receive policy holds its payout as credit");
        PositionView memory d = lens.positionOf(m, desk);
        assertGt(d.credit, 0);
        vm.prank(maker);
        engine.redeem(m); // drains the maker's remaining quotes first (T05)
        vm.prank(desk);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, desk);
        vm.prank(desk);
        engine.withdrawCredit(m, d.credit);
        assertEq(lens.config().totalOwed, 0, "every base unit of the Window paid");
        assertEq(StdTokens.PATH_USD.balanceOf(address(engine)), 0);
        paid; // keeper paid only when YES won; either way the ledger closed at zero
    }
}
