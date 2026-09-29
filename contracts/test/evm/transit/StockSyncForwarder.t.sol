// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {LzTestBase} from "../helpers/LzTestBase.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {SyncSink} from "../robinhood/StockSyncSender.t.sol";
import {StockSyncSender} from "../../../src/robinhood/StockSyncSender.sol";
import {StockSyncForwarder} from "../../../src/transit/StockSyncForwarder.sol";

/// RH sender (1) → Base forwarder (2) → Tempo sink (3); the payload must arrive byte-identical.
contract StockSyncForwarderTest is LzTestBase {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant BASE = 2;
    uint32 constant TEMPO = 3;
    StockSyncSender sender;
    StockSyncForwarder fwd;
    SyncSink sink;
    MockStockToken crwd;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(3, LibraryType.UltraLightNode);
        sender = new StockSyncSender(address(endpoints[RH]), address(this));
        fwd = new StockSyncForwarder(address(endpoints[BASE]), address(this), RH, TEMPO);
        sink = new SyncSink(address(endpoints[TEMPO]), address(this));
        sender.setPeer(BASE, _b32(address(fwd)));
        fwd.setPeer(RH, _b32(address(sender)));
        fwd.setPeer(TEMPO, _b32(address(sink)));
        sink.setPeer(BASE, _b32(address(fwd)));
        EnforcedOptionParam[] memory e = new EnforcedOptionParam[](1);
        e[0] = EnforcedOptionParam(BASE, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(1_500_000, 0));
        sender.setEnforcedOptions(e);
        e[0] = EnforcedOptionParam(TEMPO, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(150_000, 0));
        fwd.setEnforcedOptions(e);
        crwd = new MockStockToken("CRWD");
        crwd.updateMultiplier(4e18, block.timestamp + 45_000);
        sender.registerToken(address(crwd), makeAddr("lockbox"));
    }

    function _sync() internal returns (bytes memory payload) {
        address[] memory a = new address[](1);
        a[0] = address(crwd);
        payload = sender.buildMessage(a, sender.seq() + 1);
        MessagingFee memory fee = sender.quoteSync(a, BASE);
        sender.sync{value: fee.nativeFee}(a, BASE);
    }

    function test_forwardsIdenticalPayload() public {
        vm.deal(address(fwd), 1 ether);
        bytes memory payload = _sync();
        deliver(BASE, address(fwd));
        deliver(TEMPO, address(sink));
        assertEq(sink.last(), payload);
    }

    function test_underfundedDefersThenRetry() public {
        bytes memory payload = _sync();
        Delivery memory d = commitNext(BASE, address(fwd));
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok, "a received sync never reverts");
        assertFalse(isRetryable(d));
        assertEq(fwd.pending(d.guid), payload);
        MessagingFee memory fee = fwd.quoteForward(payload);
        address anyone = makeAddr("anyone");
        vm.deal(anyone, 1 ether);
        vm.prank(anyone);
        fwd.retryForward{value: fee.nativeFee}(d.guid);
        assertEq(fwd.pending(d.guid).length, 0);
        deliver(TEMPO, address(sink));
        assertEq(sink.last(), payload);
    }

    function test_retryUnknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(StockSyncForwarder.NothingPending.selector, bytes32(uint256(1))));
        fwd.retryForward(bytes32(uint256(1)));
    }

    function test_forwardNowOnlySelf() public {
        vm.expectRevert(StockSyncForwarder.OnlySelf.selector);
        fwd.forwardNow("");
    }
}
