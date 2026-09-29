// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DataStreamsPrintVerifier} from "../../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {DataStreamsProxyStub} from "../harness/DataStreamsProxyStub.sol";

/// A.5.2 against the proxy stub: the v11 decode order pinned from the archived SPY report, the exact-T window, the
/// market-status mask, the spread bound (T07), feed and version pins, v3, and `verifySpot`.
contract DataStreamsVerifierTest is Test {
    bytes32 internal constant SPY = 0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac;
    bytes32 internal constant ETH_V3 = 0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9;
    uint32 internal constant T = 1_788_976_800;

    DataStreamsProxyStub internal stub;
    DataStreamsPrintVerifier internal v;

    function setUp() public {
        stub = new DataStreamsProxyStub();
        v = new DataStreamsPrintVerifier(address(stub));
    }

    /// The archived SPY v11 report's fields (fixtures/prints/README.md), with overridable window, status and quotes.
    function spy(uint32 validFrom, uint32 obs, uint32 status, int192 bid, int192 ask) internal pure returns (bytes memory) {
        bytes memory report = abi.encode(
            SPY, validFrom, obs, uint192(128_346_108_383_556), uint192(26_675_873_177_397_016), uint32(1_791_568_800),
            int192(763_025e15), uint64(1_788_976_799_972_000_000), bid, int192(840e18), ask, int192(100e18),
            int192(763_025e15), status
        );
        return abi.encode(report);
    }

    function spyReal() internal pure returns (bytes memory) {
        return spy(T, T, 2, int192(762_990e15), int192(763_063_2e14));
    }

    function q(uint40 t, uint16 grace, uint8 mask, uint16 maxConf) internal pure returns (PrintQuery memory) {
        return PrintQuery(bytes32(0), 1, t, SPY, 0, grace, 0, 0, maxConf, mask);
    }

    function test_v11DecodesTheArchivedFieldOrder() public {
        (int256 price, int8 expo, uint40 ts, uint8 signers) = v.verifyPrint(spyReal(), q(T, 5, 1 << 2, 0));
        assertEq(price, 763_025e15);
        assertEq(expo, -18);
        assertEq(ts, T);
        assertEq(signers, 0);
        assertEq(stub.lastParams(), abi.encode(address(0)), "no fee token (no fee manager)");
    }

    function test_exactTWindow() public {
        // validFrom ≤ T ≤ observations ≤ T + grace
        v.verifyPrint(spy(T - 30, T + 5, 2, 1, 2), q(T, 5, 1 << 2, 0));
        vm.expectRevert(E.DataStreamsWindowMismatch.selector);
        v.verifyPrint(spy(T - 30, T + 6, 2, 1, 2), q(T, 5, 1 << 2, 0));
        vm.expectRevert(E.DataStreamsWindowMismatch.selector);
        v.verifyPrint(spy(T + 1, T + 1, 2, 1, 2), q(T, 5, 1 << 2, 0));
        vm.expectRevert(E.DataStreamsWindowMismatch.selector);
        v.verifyPrint(spy(T - 10, T - 1, 2, 1, 2), q(T, 5, 1 << 2, 0));
    }

    function test_marketStatusMask() public {
        vm.expectRevert(E.InsufficientVerification.selector); // 5 = Closed, only Regular (2) admitted
        v.verifyPrint(spy(T, T, 5, 1, 2), q(T, 5, 1 << 2, 0));
        v.verifyPrint(spy(T, T, 5, 1, 2), q(T, 5, (1 << 2) | (1 << 5), 0));
    }

    /// T07: `(ask − bid)·1e4 ≤ maxConfBps·mid`; the archived spread is 0.0732 / 763.025 ≈ 0.96 bp.
    function test_spreadConfidence() public {
        v.verifyPrint(spyReal(), q(T, 5, 1 << 2, 1));
        vm.expectRevert(E.ConfidenceTooWide.selector);
        v.verifyPrint(spy(T, T, 2, int192(760e18), int192(766e18)), q(T, 5, 1 << 2, 50)); // ≈ 78.6 bp
        vm.expectRevert(E.ConfidenceTooWide.selector);
        v.verifyPrint(spy(T, T, 2, int192(764e18), int192(763e18)), q(T, 5, 1 << 2, 50)); // crossed quote
    }

    function test_feedVersionAndValuePins() public {
        PrintQuery memory other = q(T, 5, 1 << 2, 0);
        other.feedId = bytes32(uint256(SPY) + 1);
        vm.expectRevert(E.FeedIdMismatch.selector);
        v.verifyPrint(spyReal(), other);
        other.feedId = bytes32(uint256(0x0004) << 240);
        vm.expectRevert(E.UnsupportedReportVersion.selector);
        v.verifyPrint(spyReal(), other);
        bytes memory zero = abi.encode(
            abi.encode(SPY, T, T, uint192(0), uint192(0), uint32(0), int192(0), uint64(0), int192(0), int192(0), int192(0), int192(0), int192(0), uint32(2))
        );
        vm.expectRevert(E.InvalidPrintValue.selector);
        v.verifyPrint(zero, q(T, 5, 1 << 2, 0));
    }

    function test_v3Decodes() public {
        bytes memory report = abi.encode(ETH_V3, T, T + 1, uint192(0), uint192(0), uint32(T + 86_400), int192(4_321e18), int192(4_320e18), int192(4_322e18));
        PrintQuery memory p = q(T, 5, 0, 10);
        p.feedId = ETH_V3;
        (int256 price,, uint40 ts,) = v.verifyPrint(abi.encode(report), p);
        assertEq(price, 4_321e18);
        assertEq(ts, T + 1);
    }

    function test_verifySpot() public {
        vm.warp(T + 30);
        (int256 price,, uint40 ts,) = v.verifySpot(spyReal(), SPY, 60);
        assertEq(price, 763_025e15);
        assertEq(ts, T);
        vm.warp(T + 61);
        vm.expectRevert(E.SpotTooOld.selector);
        v.verifySpot(spyReal(), SPY, 60);
    }

    function test_constructorNeedsAProxyContract() public {
        vm.expectRevert(E.BadSignerSet.selector);
        new DataStreamsPrintVerifier(makeAddr("eoa"));
        assertEq(v.source(), 5);
    }
}
