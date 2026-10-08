// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/PrivateDesk.fork.t.sol — the Shannon fork becomes a Moderato fork (A.6):
// an owner's budget, the desk's three-transaction open buying off a maker's book on the deployed engine, the slot
// settled on the Window's real RedStone close, swept and credited home, and the owner's own withdrawal.

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {IPrivateDesk} from "../../src/products/private/IPrivateDesk.sol";
import {PrivateDesk} from "../../src/products/private/PrivateDesk.sol";
import {DeployPrivateDesk} from "../../script/products/DeployPrivateDesk.s.sol";
import "../../src/engine/EngineTypes.sol";

/// Run: `forge test --match-contract ModeratoPrivateDeskForkTest` (network; excluded from `contracts:test`).
contract ModeratoPrivateDeskForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint256 internal constant ONE = 1e6;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    PrivateDesk internal deskContract;
    IERC20 internal usd = IERC20(address(StdTokens.PATH_USD));
    bytes32 internal m;
    address internal desk = makeAddr("fork-desk");
    address internal owner = makeAddr("fork-owner");
    address internal maker = makeAddr("fork-maker");

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        bytes32 btc5 = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        vm.warp(T - 60);
        vm.prank(vm.parseJsonAddress(j, ".roles.ROLLER"));
        m = engine.openWindow(OpenWindowArgs(btc5, 0, T, T + 300, T + 300, 0, 0));
        vm.warp(T + 15);
        engine.recordPrint(m, WHICH_OPEN, _payload(T));
        deskContract = new PrivateDesk(usd, engine, lens, desk, new DeployPrivateDesk().launchParams());

        vm.startPrank(FUNDER);
        usd.transfer(owner, 20 * ONE);
        usd.transfer(maker, 50 * ONE);
        vm.stopPrank();
        vm.startPrank(maker);
        usd.approve(address(engine), type(uint256).max);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 520, 40_000, T + 300, 16, 16, false, false, 1));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 480, 40_000, T + 300, 16, 16, false, false, 2));
        vm.stopPrank();
        vm.warp(T + 35);
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function test_fork_aPrivateBetOpensInThreeStepsSettlesOnTheRealCloseAndComesHome() public {
        vm.startPrank(owner);
        usd.approve(address(deskContract), type(uint256).max);
        deskContract.depositAndAllow(20 * ONE, 10 * ONE);
        vm.stopPrank();
        bytes32 slot = keccak256("fork-slot");
        IPrivateDesk.Preview memory q = deskContract.sizeForStake(m, 0, 10 * ONE);
        assertEq(q.limitYesRaw, 520_000, "UP at the maker's 0.52 ask");
        console2.log("contracts for 10", q.quantityRaw);

        vm.startPrank(desk);
        deskContract.chargeToPool(owner, 10 * ONE, keccak256("fork-charge"));
        deskContract.fundSlot(slot, 10 * ONE);
        (uint256 quantity, uint256 cost) = deskContract.mintInSlot(slot, m, 0, q.quantityRaw);
        vm.stopPrank();
        assertEq(quantity, q.quantityRaw);
        assertEq(cost, q.costRaw);
        assertEq(uint256(lens.positionOf(m, address(deskContract)).yesFree) * 1000, quantity, "held in the engine");
        assertEq(usd.balanceOf(address(deskContract)), deskContract.totalOwed());

        vm.warp(T + 315);
        engine.recordPrint(m, WHICH_CLOSE, _payload(T + 300)); // 83,168.48 → 83,220.17: Up
        engine.settle(m);
        vm.prank(makeAddr("fork-cranker"));
        uint256 payout = deskContract.settleSlot(slot);
        assertEq(payout, quantity, "a winning contract pays a whole unit");
        vm.startPrank(desk);
        uint256 swept = deskContract.sweepSlotToPool(slot);
        deskContract.creditFromPool(owner, swept, keccak256("fork-credit"));
        vm.stopPrank();
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 10 * ONE + swept);
        uint256 before = usd.balanceOf(owner);
        vm.prank(owner);
        deskContract.withdraw(balance);
        assertEq(usd.balanceOf(owner), before + balance);
        assertEq(deskContract.totalOwed(), 0);
        assertEq(usd.balanceOf(address(deskContract)), 0);
    }
}
