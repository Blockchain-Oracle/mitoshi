// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LzTestBase} from "../helpers/LzTestBase.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {StockSyncSender} from "../../../src/robinhood/StockSyncSender.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {SyncFlags} from "../../../src/common/BridgeTypes.sol";

/// Records what arrived and how much gas the executor handed over.
contract SyncSink is OApp {
    bytes public last;
    uint256 public gasAtEntry;

    constructor(address ep, address o) OApp(ep, o) Ownable(o) {}

    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        gasAtEntry = gasleft();
        last = m;
    }

    function decode(bytes calldata m) external pure returns (C.Header memory h, C.Multiplier memory mul, C.Status memory st) {
        h = C.validate(m);
        mul = C.decodeMultiplier(m, C.HEADER_LEN);
        st = C.decodeStatus(m, C.HEADER_LEN + C.MULTIPLIER_LEN);
    }
}

contract StockSyncSenderTest is LzTestBase {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant TEMPO = 2;
    StockSyncSender sender;
    SyncSink sink;
    MockStockToken tsla;
    MockStockToken crwd;
    address lockbox = makeAddr("lockbox");

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        sender = new StockSyncSender(address(endpoints[RH]), address(this));
        sink = new SyncSink(address(endpoints[TEMPO]), address(this));
        address[] memory oapps = new address[](2);
        oapps[0] = address(sender);
        oapps[1] = address(sink);
        this.wireOApps(oapps);
        EnforcedOptionParam[] memory e = new EnforcedOptionParam[](1);
        e[0] = EnforcedOptionParam(TEMPO, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(sender.GAS_BASE(), 0));
        sender.setEnforcedOptions(e);
        tsla = new MockStockToken("TSLA");
        crwd = new MockStockToken("CRWD");
        sender.registerToken(address(tsla), lockbox);
        sender.registerToken(address(crwd), lockbox);
        vm.warp(1_782_900_000);
    }

    function _one(address s) internal pure returns (address[] memory a) {
        a = new address[](1);
        a[0] = s;
    }

    function test_readStateTestnetShape() public {
        tsla.setOracle(false, false); // testnet Stock: oraclePaused() reverts with empty data
        (C.Multiplier memory m, C.Status memory s) = sender.readState(address(tsla));
        assertEq(m.current, 1e18);
        assertEq(m.pending, 1e18);
        assertEq(s.flags, SyncFlags.TOKEN_PAUSED_SUPPORTED, "no oracle bit, nothing paused");
    }

    function test_readStateFlags() public {
        tsla.setTokenPaused(true);
        tsla.setOracle(true, true);
        tsla.ACCESS_CONTROLLED_REGISTRY().setPaused(true);
        tsla.ACCESS_CONTROLLED_REGISTRY().setBlocked(lockbox, true);
        (, C.Status memory s) = sender.readState(address(tsla));
        assertEq(
            s.flags,
            SyncFlags.TOKEN_PAUSED | SyncFlags.TOKEN_PAUSED_SUPPORTED | SyncFlags.ORACLE_SUPPORTED | SyncFlags.ORACLE_PAUSED
                | SyncFlags.REGISTRY_PAUSED | SyncFlags.LOCKBOX_BLOCKED
        );
        assertTrue(SyncFlags.isPaused(s.flags));
    }

    /// CRWD's 4-for-1 split scheduled 12.5 h ahead (context/tempo/14 §3.3).
    function test_scheduledMultiplier() public {
        crwd.updateMultiplier(4e18, 1_782_999_000);
        (C.Multiplier memory m,) = sender.readState(address(crwd));
        assertEq(m.current, 1e18);
        assertEq(m.pending, 4e18);
        assertEq(m.effectiveAt, 1_782_999_000);
        vm.warp(1_782_999_000);
        (m,) = sender.readState(address(crwd));
        assertEq(m.current, 4e18, "Robinhood's uiMultiplier switches at effectiveAt");
    }

    function test_syncDeliversSnapshot() public {
        crwd.updateMultiplier(4e18, 1_782_999_000);
        MessagingFee memory fee = sender.quoteSync(_one(address(crwd)), TEMPO);
        address anyone = makeAddr("anyone");
        vm.deal(anyone, 1 ether);
        vm.prank(anyone);
        sender.sync{value: fee.nativeFee + 1 gwei}(_one(address(crwd)), TEMPO);
        assertEq(anyone.balance, 1 ether - fee.nativeFee, "excess refunded");
        verifyPackets(TEMPO, address(sink));
        (C.Header memory h, C.Multiplier memory m, C.Status memory s) = sink.decode(sink.last());
        assertEq(h.srcChainId, block.chainid);
        assertEq(h.srcTimestamp, vm.getBlockTimestamp());
        assertEq(h.seq, 1);
        assertEq(h.count, 2);
        assertEq(m.rhToken, address(crwd));
        assertEq(m.pending, 4e18);
        assertEq(s.rhToken, address(crwd));
        assertGe(sink.gasAtEntry(), 150_000, "base + per-token gas reached the receiver");
    }

    function test_seqIncrementsAndPerTokenGas() public {
        address[] memory both = new address[](2);
        both[0] = address(tsla);
        both[1] = address(crwd);
        MessagingFee memory f1 = sender.quoteSync(_one(address(tsla)), TEMPO);
        MessagingFee memory f2 = sender.quoteSync(both, TEMPO);
        assertGt(f2.nativeFee, f1.nativeFee, "more tokens, more gas");
        sender.sync{value: f1.nativeFee}(_one(address(tsla)), TEMPO);
        sender.sync{value: f2.nativeFee}(both, TEMPO);
        assertEq(sender.seq(), 2);
    }

    function test_unregisteredReverts() public {
        vm.expectRevert(abi.encodeWithSelector(StockSyncSender.UnknownStock.selector, address(0xdead)));
        sender.readState(address(0xdead));
    }

    function test_underpaidReverts() public {
        MessagingFee memory fee = sender.quoteSync(_one(address(tsla)), TEMPO);
        vm.expectRevert();
        sender.sync{value: fee.nativeFee - 1}(_one(address(tsla)), TEMPO);
    }

    function test_noEnforcedOptionsReverts() public {
        vm.expectRevert(abi.encodeWithSelector(StockSyncSender.NoEnforcedOptions.selector, uint32(99)));
        sender.quoteSync(_one(address(tsla)), 99);
    }

    function test_onlyOwnerRegisters() public {
        vm.prank(makeAddr("x"));
        vm.expectRevert();
        sender.registerToken(address(tsla), lockbox);
    }
}
