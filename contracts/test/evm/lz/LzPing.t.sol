// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {LzPing} from "../../../src/lz/LzPing.sol";

/// Spike X1 unit proof: a ping crosses a LayerZero V2 endpoint pair (real EndpointV2 + ULN302 from the devtools
/// helper) and the receiving side records the landing.
contract LzPingTest is TestHelperOz5 {
    using OptionsBuilder for bytes;

    uint32 constant A = 1;
    uint32 constant B = 2;
    LzPing a;
    LzPing b;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        a = new LzPing(address(endpoints[A]), address(this));
        b = new LzPing(address(endpoints[B]), address(this));
        address[] memory oapps = new address[](2);
        oapps[0] = address(a);
        oapps[1] = address(b);
        this.wireOApps(oapps);
    }

    function test_pingLandsAndRecordsLatency() public {
        bytes memory opts = OptionsBuilder.newOptions().addExecutorLzReceiveOption(100_000, 0);
        MessagingFee memory fee = a.quotePing(B, opts);
        assertGt(fee.nativeFee, 0);
        vm.warp(1000);
        a.ping{value: fee.nativeFee}(B, opts);
        vm.warp(1007);
        verifyPackets(B, address(b));
        (uint64 id, uint64 sentAt, uint64 receivedAt, uint32 srcChainId, uint32 srcEid) = b.lastLanding(A);
        assertEq(id, 1);
        assertEq(sentAt, 1000);
        assertEq(receivedAt, 1007);
        assertEq(srcChainId, block.chainid);
        assertEq(srcEid, A);
        assertEq(b.landedCount(), 1);
    }

    function test_underpaidPingReverts() public {
        bytes memory opts = OptionsBuilder.newOptions().addExecutorLzReceiveOption(100_000, 0);
        MessagingFee memory fee = a.quotePing(B, opts);
        vm.expectRevert();
        a.ping{value: fee.nativeFee - 1}(B, opts);
    }

}
