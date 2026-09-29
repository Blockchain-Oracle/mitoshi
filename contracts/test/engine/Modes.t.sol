// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/place.rs
// (`check_mode`) and events-engine.md §7 (D-008: exits are never blocked by an admin mode).
/// E-18: ReduceOnly blocks buys and minting; Halted blocks every placement and minting. Neither blocks cancel, reduce,
/// cancel-all, sweep, merge, withdraw (nor prints, settle, void, redeem — proven in Resolve/Redeem).
contract ModesTest is EngineFixture {
    uint128 internal restedBuy;

    function setUp() public override {
        super.setUp();
        mint(1, 2_000);
        restedBuy = place(2, order(KIND_BUY_YES, 400, 500, ORDER_NORMAL)).restedOrderId;
        place(2, order(KIND_BUY_YES, 390, 500, ORDER_NORMAL));
        vm.prank(admin);
        engine.setMode(MODE_REDUCE_ONLY);
    }

    function test_reduceOnlyRefusesBuysAndMint() public {
        vm.startPrank(who(3));
        vm.expectRevert(E.InvalidMode.selector);
        engine.placeOrder(order(KIND_BUY_YES, 400, 10, ORDER_NORMAL));
        vm.expectRevert(E.InvalidMode.selector);
        engine.placeOrder(order(KIND_BUY_NO, 400, 10, ORDER_NORMAL));
        vm.expectRevert(E.InvalidMode.selector);
        engine.mintSet(m, 10, false);
        vm.stopPrank();
        // Sells are how holders reduce.
        PlaceResult memory r = place(1, order(KIND_SELL_YES, 400, 500, ORDER_IOC));
        assertEq(r.filledLots, 500);
    }

    function test_haltedRefusesEveryPlacement() public {
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        vm.startPrank(who(1));
        vm.expectRevert(E.InvalidMode.selector);
        engine.placeOrder(order(KIND_SELL_YES, 400, 10, ORDER_IOC));
        vm.expectRevert(E.InvalidMode.selector);
        engine.placeOrder(order(KIND_SELL_YES, 900, 10, ORDER_POST_ONLY));
        vm.stopPrank();
    }

    function test_exitsNeverBlocked() public {
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        vm.startPrank(who(2));
        engine.reduceOrder(m, restedBuy, 100);
        uint128[] memory ids = new uint128[](1);
        ids[0] = restedBuy;
        (uint256 removed,) = engine.cancelOrders(m, ids, false);
        assertEq(removed, 1);
        (removed,) = engine.cancelAll(m, 16, true);
        assertEq(removed, 1);
        vm.stopPrank();
        vm.startPrank(who(1));
        engine.mergeSet(m, 1_000, false);
        engine.withdrawCredit(m, 1_000_000);
        vm.stopPrank();
        vm.warp(LOCK);
        engine.sweepExpired(m, 32);
        assertConserved();
    }

    function test_modeIsAdminOnlyAndBounded() public {
        vm.expectRevert(E.NotAdmin.selector);
        engine.setMode(MODE_NORMAL);
        vm.prank(admin);
        vm.expectRevert(E.InvalidMode.selector);
        engine.setMode(3);
        vm.prank(admin);
        engine.setMode(MODE_NORMAL);
        place(3, order(KIND_BUY_YES, 300, 10, ORDER_NORMAL));
    }
}
