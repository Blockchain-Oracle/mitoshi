// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {SyncFixture} from "./SyncFixture.sol";
import {StockSyncReceiver} from "../../../src/stocks/StockSyncReceiver.sol";
import {ScaledUIView} from "../../../src/stocks/ScaledUIView.sol";
import {SyncFlags} from "../../../src/common/BridgeTypes.sol";

contract StockSyncReceiverTest is SyncFixture {
    uint64 constant SPLIT_AT = 1_782_999_000;

    function _countLogs(address emitter, bytes32 topic0) internal returns (uint256 n) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) if (logs[i].emitter == emitter && logs[i].topics[0] == topic0) n++;
    }

    function test_appliesNewerSnapshot() public {
        vm.expectEmit(address(uiView));
        emit ScaledUIView.UIMultiplierUpdated(1e18, 4e18, SPLIT_AT);
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, SyncFlags.TOKEN_PAUSED_SUPPORTED));
        StockSyncReceiver.TokenSync memory s = receiver.syncOf(address(mirror));
        assertEq(s.pending, 4e18);
        assertEq(s.effectiveAt, SPLIT_AT);
        assertEq(s.syncedAt, 100);
        assertEq(s.flags, SyncFlags.TOKEN_PAUSED_SUPPORTED);
        assertEq(receiver.uiMultiplierOf(address(mirror)), 1e18, "not yet effective");
    }

    function test_switchAtEffectiveAt() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, 0));
        vm.warp(SPLIT_AT - 1);
        assertEq(uiView.uiMultiplier(), 1e18);
        vm.warp(SPLIT_AT);
        assertEq(uiView.uiMultiplier(), 4e18);
    }

    function test_staleAndDuplicateIgnored() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 200, 5, 1e18, 4e18, SPLIT_AT, 0));
        vm.recordLogs();
        _deliver(_msg(RH_TESTNET_CHAIN, 200, 5, 1e18, 2e18, SPLIT_AT, 1)); // duplicate key
        _deliver(_msg(RH_TESTNET_CHAIN, 199, 9, 1e18, 3e18, SPLIT_AT, 1)); // older timestamp, higher seq
        assertEq(_countLogs(address(receiver), StockSyncReceiver.SyncIgnored.selector), 4, "2 records x 2 messages");
        StockSyncReceiver.TokenSync memory s = receiver.syncOf(address(mirror));
        assertEq(s.pending, 4e18);
        assertEq(s.flags, 0);
    }

    /// Robinhood re-sent CRWD's split with the same values (context/tempo/14 §3.3): applied, but no ERC-8056 event.
    function test_crwdResendNoEvent() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, 0));
        vm.recordLogs();
        _deliver(_msg(RH_TESTNET_CHAIN, 140, 2, 1e18, 4e18, SPLIT_AT, 0));
        assertEq(_countLogs(address(uiView), ScaledUIView.UIMultiplierUpdated.selector), 0);
        assertEq(receiver.syncOf(address(mirror)).syncedAt, 140, "freshness still advances");
    }

    function test_supersededPendingEmitsCancelled() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, 0));
        vm.expectEmit(address(uiView));
        emit ScaledUIView.UIMultiplierUpdateCancelled(4e18, SPLIT_AT);
        vm.expectEmit(address(uiView));
        emit ScaledUIView.UIMultiplierUpdated(1e18, 5e18, SPLIT_AT + 60);
        _deliver(_msg(RH_TESTNET_CHAIN, 101, 2, 1e18, 5e18, SPLIT_AT + 60, 0));
    }

    function test_unknownTokenIgnored() public {
        address other = address(0xBEEF);
        bytes memory m = _msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, 0);
        assembly {
            mstore(add(m, add(32, 24)), or(and(mload(add(m, add(32, 24))), not(shl(96, sub(shl(160, 1), 1)))), shl(96, other)))
        }
        vm.expectEmit(address(receiver));
        emit StockSyncReceiver.SyncIgnored(keccak256(abi.encode(uint64(1))), other, StockSyncReceiver.Ignore.UNKNOWN_TOKEN);
        _deliver(m);
    }

    function test_wrongChainIgnored() public {
        vm.expectEmit(address(receiver));
        emit StockSyncReceiver.SyncIgnored(keccak256(abi.encode(uint64(1))), address(0), StockSyncReceiver.Ignore.WRONG_CHAIN);
        _deliver(_msg(4663, 100, 1, 1e18, 4e18, SPLIT_AT, 0));
        assertFalse(receiver.isSynced(address(mirror), type(uint64).max));
    }

    function test_malformedIgnoredNeverReverts() public {
        _deliver(hex"01deadbeef");
        assertEq(receiver.syncOf(address(mirror)).syncedAt, 1);
    }

    function test_onlyEndpointAndPeer() public {
        bytes memory m = _msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 4e18, SPLIT_AT, 0);
        vm.expectRevert();
        receiver.lzReceive(Origin(FORWARDER_EID, PEER, 1), bytes32(0), m, address(0), "");
        vm.prank(address(endpoint));
        vm.expectRevert();
        receiver.lzReceive(Origin(FORWARDER_EID, bytes32(uint256(1)), 1), bytes32(0), m, address(0), "");
    }

    function test_prewarmedSyncGasUnder60k() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 1e18, 0, 0)); // first: events + view call
        uint256 g = _deliver(_msg(RH_TESTNET_CHAIN, 101, 2, 1e18, 1e18, 0, 0)); // routine keep-alive sync
        assertLt(g, 60_000, "pre-warmed slots: no 250k state-creation writes");
    }

    function test_isSynced() public {
        _deliver(_msg(RH_TESTNET_CHAIN, uint64(vm.getBlockTimestamp()) - 10, 1, 1e18, 1e18, 0, 0));
        assertTrue(receiver.isSynced(address(mirror), 26 hours));
        vm.warp(vm.getBlockTimestamp() + 26 hours);
        assertFalse(receiver.isSynced(address(mirror), 26 hours));
    }

    function test_autoPauseDefaultOffAndNeverReverts() public {
        _deliver(_msg(RH_TESTNET_CHAIN, 100, 1, 1e18, 1e18, 0, SyncFlags.TOKEN_PAUSED));
        assertFalse(mirror.paused(), "Q-010 default: display only");
        receiver.setAutoPause(true);
        _deliver(_msg(RH_TESTNET_CHAIN, 101, 2, 1e18, 1e18, 0, SyncFlags.REGISTRY_PAUSED)); // no PAUSE_ROLE yet
        assertFalse(mirror.paused());
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.PAUSE_ROLE(), address(receiver));
        _deliver(_msg(RH_TESTNET_CHAIN, 102, 3, 1e18, 1e18, 0, SyncFlags.TOKEN_PAUSED));
        assertTrue(mirror.paused());
    }
}
