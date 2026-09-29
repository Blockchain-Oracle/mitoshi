// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {SyncFixture} from "./SyncFixture.sol";
import {ScaledUIView} from "../../../src/stocks/ScaledUIView.sol";
import {SyncFlags} from "../../../src/common/BridgeTypes.sol";

contract ScaledUIViewTest is SyncFixture {
    function test_interfaceIdsLikeRobinhood() public view {
        assertTrue(uiView.supportsInterface(0x01ffc9a7));
        assertTrue(uiView.supportsInterface(0xa60bf13d));
        assertTrue(uiView.supportsInterface(0x4bd27648));
        assertTrue(uiView.supportsInterface(0xd890fd71));
        assertFalse(uiView.supportsInterface(0x57854fc3), "no Conversion extension, as on Robinhood");
        assertFalse(uiView.supportsInterface(0xffffffff));
    }

    /// The ERC-8056 interface IDs are the XOR of the function selectors.
    function test_idsMatchSelectors() public pure {
        assertEq(bytes4(keccak256("uiMultiplier()")), bytes4(0xa60bf13d));
        assertEq(bytes4(keccak256("newUIMultiplier()")) ^ bytes4(keccak256("effectiveAt()")), bytes4(0x4bd27648));
        assertEq(bytes4(keccak256("balanceOfUI(address)")) ^ bytes4(keccak256("totalSupplyUI()")), bytes4(0xd890fd71));
    }

    function test_uiBalancesMultiply() public {
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.ISSUER_ROLE(), address(this));
        mirror.mint(address(0xA11CE), 3e6);
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 4e18, 4e18, 0, SyncFlags.ORACLE_SUPPORTED));
        assertEq(uiView.uiMultiplier(), 4e18);
        assertEq(uiView.balanceOfUI(address(0xA11CE)), 12e6, "raw x multiplier, never divided");
        assertEq(uiView.totalSupplyUI(), 12e6);
        assertEq(uiView.flags(), SyncFlags.ORACLE_SUPPORTED);
    }

    function test_pendingView() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 1.00171799e18, 1_782_999_000, 0));
        assertEq(uiView.newUIMultiplier(), 1.00171799e18);
        assertEq(uiView.effectiveAt(), 1_782_999_000);
    }

    function test_onlyReceiverNotifies() public {
        vm.expectRevert(ScaledUIView.OnlyReceiver.selector);
        uiView.notifyUpdated(1, 2, 3);
        vm.expectRevert(ScaledUIView.OnlyReceiver.selector);
        uiView.notifyCancelled(1, 2);
    }
}
