// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {EngineTestHook} from "./harness/EngineTestHook.sol";

/// E-06/E-20…E-23: a constructor-bound admin with a two-step transfer, roller grants, and an immutable collateral.
contract AdminRolesTest is EngineFixture {
    function test_roles() public {
        address roller = makeAddr("roller");
        vm.expectRevert(E.NotAdmin.selector);
        engine.setRoller(roller, true);
        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(engine));
        emit Ev.RollerSet(roller, true);
        engine.setRoller(roller, true);
        bytes32 slot = keccak256(abi.encode(roller, uint256(EngineStorage.SLOT) + EngineStorage.OFF_IS_ROLLER));
        assertEq(uint256(engine.extsload(slot)), 1);
        vm.prank(admin);
        engine.setRoller(roller, false);
        assertEq(uint256(engine.extsload(slot)), 0);
    }

    function test_twoStepAdmin() public {
        address next = makeAddr("next-admin");
        vm.prank(admin);
        engine.transferAdmin(next);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin();
        vm.prank(admin);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin();
        vm.prank(next);
        vm.expectEmit(true, true, false, false, address(engine));
        emit Ev.AdminTransferred(admin, next);
        engine.acceptAdmin();
        vm.prank(admin);
        vm.expectRevert(E.NotAdmin.selector);
        engine.setRoller(admin, true);
        vm.prank(next);
        engine.setRoller(admin, true);
        vm.prank(next);
        vm.expectRevert(E.NotAdmin.selector);
        engine.acceptAdmin(); // nothing pending
    }

    function test_constructorRefusesZeroes() public {
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EngineTestHook(address(0), admin, treasury);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EngineTestHook(address(usd), address(0), treasury);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        new EngineTestHook(address(usd), admin, address(0));
    }
}
