// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {LzTestBase} from "../../shared/LzTestBase.sol";
import {LzWiring} from "../../../script/lib/LzWiring.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {LzPing} from "../../../src/lz/LzPing.sol";

/// Owns the OApps and is their endpoint delegate, like the deployer key running EnsureLzConfig.
contract WiringHarness is LzWiring {
    function ensure(LzNetworks.Net memory local, LzNetworks.Net memory remote, Link memory l) external {
        ensureLink(local, remote, l);
    }

    function check(LzNetworks.Net memory local, LzNetworks.Net memory remote, Link memory l) external view returns (uint256) {
        return checkLink(local, remote, l);
    }
}

/// The EnsureLzConfig / CheckLzConfig logic against real EndpointV2 + ULN302 (devtools helper, eids 1 and 2).
contract LzWiringTest is LzTestBase {
    using OptionsBuilder for bytes;

    WiringHarness h;
    LzPing a;
    LzPing b;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        h = new WiringHarness();
        a = new LzPing(address(endpoints[1]), address(h));
        b = new LzPing(address(endpoints[2]), address(h));
    }

    function _net(uint32 eid, uint64 confirmations) internal view returns (LzNetworks.Net memory n) {
        uint32 other = eid == 1 ? 2 : 1;
        bytes memory cfg = ILayerZeroEndpointV2(endpoints[eid]).getConfig(address(0), endpointSetup.sendLibs[eid - 1], other, 2);
        UlnConfig memory u = abi.decode(cfg, (UlnConfig));
        bytes memory ex = ILayerZeroEndpointV2(endpoints[eid]).getConfig(address(0), endpointSetup.sendLibs[eid - 1], other, 1);
        (, address executor) = abi.decode(ex, (uint32, address));
        n = LzNetworks.Net(eid, block.chainid, endpoints[eid], endpointSetup.sendLibs[eid - 1],
            endpointSetup.receiveLibs[eid - 1], executor, u.requiredDVNs, confirmations, address(0));
    }

    function _link(address oapp, uint32 remote, address peer) internal pure returns (LzWiring.Link memory l) {
        l.label = "ping";
        l.oapp = oapp;
        l.remoteEid = remote;
        l.remotePeer = peer;
        l.sends = true;
        l.options = new EnforcedOptionParam[](1);
        l.options[0] = EnforcedOptionParam(remote, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(150_000, 0));
    }

    function test_ensureIsIdempotentAndCheckPasses() public {
        LzNetworks.Net memory n1 = _net(1, 20);
        LzNetworks.Net memory n2 = _net(2, 5);
        LzWiring.Link memory ab = _link(address(a), 2, address(b));
        LzWiring.Link memory ba = _link(address(b), 1, address(a));
        assertGt(h.check(n1, n2, ab), 0, "defaults fail: libraries not pinned, config not explicit, no peer");
        h.ensure(n1, n2, ab);
        h.ensure(n2, n1, ba);
        assertEq(h.check(n1, n2, ab), 0);
        assertEq(h.check(n2, n1, ba), 0);
        vm.recordLogs();
        h.ensure(n1, n2, ab); // re-run writes nothing
        assertEq(vm.getRecordedLogs().length, 0, "idempotent");
        // send confirmations are the local chain's, receive confirmations the remote's
        (, bytes memory got) = address(n1.sendLib).staticcall(abi.encodeWithSignature("getAppUlnConfig(address,uint32)", address(a), uint32(2)));
        assertEq(abi.decode(got, (UlnConfig)).confirmations, 20);
        (, got) = address(n1.receiveLib).staticcall(abi.encodeWithSignature("getAppUlnConfig(address,uint32)", address(a), uint32(2)));
        assertEq(abi.decode(got, (UlnConfig)).confirmations, 5);
        // and a message actually flows over the pinned config
        uint256 fee = a.quotePing(2, "").nativeFee;
        a.ping{value: fee}(2, "");
        verifyPackets(2, address(b));
        assertEq(b.landedCount(), 1);
    }

    function test_checkCatchesDrift() public {
        LzNetworks.Net memory n1 = _net(1, 1);
        LzNetworks.Net memory n2 = _net(2, 1);
        LzWiring.Link memory ab = _link(address(a), 2, address(b));
        h.ensure(n1, n2, ab);
        assertEq(h.check(n1, n2, ab), 0);
        vm.prank(address(h));
        a.setPeer(2, bytes32(uint256(1)));
        assertEq(h.check(n1, n2, ab), 1, "wrong peer");
        vm.prank(address(h));
        a.setPeer(2, bytes32(uint256(uint160(address(b)))));
        n1.confirmations = 7; // the table changed: config now differs
        assertEq(h.check(n1, n2, ab), 1);
    }
}
