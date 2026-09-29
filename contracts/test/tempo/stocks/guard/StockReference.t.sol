// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PrintSigner as S} from "../../../engine/harness/PrintSigner.sol";
import {RedStonePrintVerifier} from "../../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {IPrintVerifier} from "../../../../src/engine/interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../../../../src/engine/EngineErrors.sol";
import {IDataStreamsVerifierProxy} from "../../../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {StockReference} from "../../../../src/stocks/StockReference.sol";
import {Ref, RefSource, SessionState} from "../../../../src/stocks/interfaces/IStockReference.sol";

/// B.6 `StockReference.t.sol`: the RedStone archive fixture against the production signers (X12), signed synthetic
/// pushes, keeper prices labelled, older ignored, future/zero refused, session expiry and the v11 status map. The SPY
/// v11 path runs on a Tempo mainnet fork in `test/fork/StockReferenceDataStreams.fork.t.sol`.
contract StockReferenceTest is Test {
    address internal constant TSLA = 0x20c000000000000000000000a81E861906820FB7; // Moderato bTSLA
    address internal constant AMD = 0x20C000000000000000000000b21134EaB38DfecC;
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    StockReference internal ref;

    function _deploy(IPrintVerifier v) internal {
        ref = new StockReference(admin, v, IDataStreamsVerifierProxy(address(0)));
        vm.startPrank(admin);
        ref.grantRole(ref.KEEPER_ROLE(), keeper);
        ref.setFeeds(TSLA, bytes32("TSLA"), bytes32(0));
        ref.setFeeds(AMD, bytes32("AMD"), bytes32(0));
        vm.stopPrank();
    }

    function setUp() public {
        _deploy(IPrintVerifier(address(new RedStonePrintVerifier(S.signers(5), 3))));
    }

    function _push(address m, bytes memory payload) internal {
        address[] memory ms = new address[](1);
        ms[0] = m;
        bytes[] memory ps = new bytes[](1);
        ps[0] = payload;
        ref.pushRedStone(ms, ps);
    }

    /// The real 2026-09-29 TSLA---24_7 gateway packages (5 production signers) become the TSLA reference.
    function test_realRedStoneArchivePayloadAgainstProductionSigners() public {
        address[] memory prod = new address[](5);
        prod[0] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;
        prod[1] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        prod[2] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        prod[3] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        prod[4] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        _deploy(IPrintVerifier(address(new RedStonePrintVerifier(prod, 3))));
        vm.prank(admin);
        ref.setFeeds(TSLA, bytes32("TSLA---24_7"), bytes32(0));
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-tsla-24_7-latest-1790656530.hex");
        bytes memory payload = vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
        vm.warp(1_790_656_530 + 30);
        _push(TSLA, payload);
        Ref memory r = ref.read(TSLA);
        assertEq(r.priceE18, 356.83185257e18);
        assertEq(r.observedAt, 1_790_656_530);
        assertEq(r.writtenAt, 1_790_656_560);
        assertEq(uint8(r.source), uint8(RefSource.REDSTONE));
        // the same payload pinned to the wrong feed is refused by the verifier
        vm.prank(admin);
        ref.setFeeds(TSLA, bytes32("TSLA"), bytes32(0));
        vm.expectRevert(E.FeedIdMismatch.selector);
        _push(TSLA, payload);
    }

    function test_batchAndOlderIgnored() public {
        vm.warp(1_790_000_100);
        address[] memory ms = new address[](2);
        (ms[0], ms[1]) = (TSLA, AMD);
        bytes[] memory ps = new bytes[](2);
        ps[0] = S.five(bytes32("TSLA"), 35_000_000_000, 1_790_000_090);
        ps[1] = S.five(bytes32("AMD"), 55_965_430_000, 1_790_000_090);
        ref.pushRedStone(ms, ps);
        assertEq(ref.read(TSLA).priceE18, 350e18);
        assertEq(ref.read(AMD).priceE18, 559.6543e18);
        // an older (or equal) observation is ignored without reverting — racing writers never block each other
        _push(TSLA, S.five(bytes32("TSLA"), 30_000_000_000, 1_790_000_080));
        _push(TSLA, S.five(bytes32("TSLA"), 30_000_000_000, 1_790_000_090));
        assertEq(ref.read(TSLA).priceE18, 350e18);
        _push(TSLA, S.five(bytes32("TSLA"), 36_000_000_000, 1_790_000_095));
        assertEq(ref.read(TSLA).priceE18, 360e18);
        assertEq(ref.read(TSLA).observedAt, 1_790_000_095);
    }

    function test_refusals() public {
        vm.warp(1_790_000_100);
        address[] memory ms = new address[](1);
        ms[0] = makeAddr("unpriced");
        bytes[] memory ps = new bytes[](1);
        ps[0] = S.five(bytes32("TSLA"), 35_000_000_000, 1_790_000_090);
        vm.expectRevert(abi.encodeWithSelector(StockReference.NoFeed.selector, ms[0]));
        ref.pushRedStone(ms, ps);
        vm.expectRevert(StockReference.LengthMismatch.selector);
        ref.pushRedStone(new address[](2), ps);
        vm.expectRevert(E.InsufficientRedStoneSigners.selector); // two signers < threshold 3
        uint256[] memory two = new uint256[](2);
        (two[0], two[1]) = (35_000_000_000, 35_000_000_000);
        _push(TSLA, S.prices(bytes32("TSLA"), two, 1_790_000_090));
        vm.expectRevert(E.SpotTooOld.selector); // the verifier's own ≤ 60 s future bound
        _push(TSLA, S.five(bytes32("TSLA"), 35_000_000_000, 1_790_000_161));
        vm.startPrank(keeper);
        vm.expectRevert(abi.encodeWithSelector(StockReference.FromTheFuture.selector, uint64(1_790_000_161)));
        ref.pushKeeper(TSLA, 1e18, 1_790_000_161);
        vm.expectRevert(StockReference.BadPrice.selector);
        ref.pushKeeper(TSLA, 0, 1_790_000_100);
        vm.stopPrank();
    }

    function test_keeperPricesAreLabelledAndRoleGated() public {
        vm.warp(1_790_000_100);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), ref.KEEPER_ROLE()));
        ref.pushKeeper(TSLA, 350e18, 1_790_000_100);
        vm.prank(keeper);
        ref.pushKeeper(TSLA, 350e18, 1_790_000_100);
        assertEq(uint8(ref.read(TSLA).source), uint8(RefSource.KEEPER));
        _push(TSLA, S.five(bytes32("TSLA"), 35_100_000_000, 1_790_000_101));
        assertEq(uint8(ref.read(TSLA).source), uint8(RefSource.REDSTONE));
    }

    function test_sessionExpiresToUnknown_haltByKeeperOrAdmin() public {
        vm.warp(1_790_000_000);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN));
        vm.startPrank(keeper);
        vm.expectRevert(StockReference.BadSessionTtl.selector);
        ref.setSession(SessionState.REGULAR, 1_790_000_000);
        vm.expectRevert(StockReference.BadSessionTtl.selector);
        ref.setSession(SessionState.REGULAR, 1_790_000_000 + 1 days + 1);
        ref.setSession(SessionState.EXTENDED, 1_790_000_600);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.EXTENDED));
        ref.setHalted(TSLA, true);
        vm.stopPrank();
        assertTrue(ref.read(TSLA).halted);
        vm.prank(admin);
        ref.setHalted(TSLA, false);
        vm.expectRevert(StockReference.NotKeeperOrAdmin.selector);
        ref.setHalted(TSLA, true);
        vm.warp(1_790_000_601);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN));
    }

    function test_marketStatusMap() public view {
        assertEq(uint8(ref.sessionOfMarketStatus(2)), uint8(SessionState.REGULAR));
        assertEq(uint8(ref.sessionOfMarketStatus(1)), uint8(SessionState.EXTENDED));
        assertEq(uint8(ref.sessionOfMarketStatus(3)), uint8(SessionState.EXTENDED));
        assertEq(uint8(ref.sessionOfMarketStatus(4)), uint8(SessionState.EXTENDED));
        assertEq(uint8(ref.sessionOfMarketStatus(5)), uint8(SessionState.CLOSED));
        assertEq(uint8(ref.sessionOfMarketStatus(0)), uint8(SessionState.UNKNOWN));
        assertEq(uint8(ref.sessionOfMarketStatus(9)), uint8(SessionState.UNKNOWN));
    }

    function test_setFeedsAdminOnly_streamsMustBeV11_noStreamsWithoutProxy() public {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), bytes32(0)));
        ref.setFeeds(TSLA, bytes32("TSLA"), bytes32(0));
        bytes32 v3 = 0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StockReference.UnsupportedStream.selector, v3));
        ref.setFeeds(TSLA, bytes32("TSLA"), v3);
        vm.expectRevert(abi.encodeWithSelector(StockReference.UnsupportedStream.selector, bytes32(0)));
        ref.pushDataStreams(new bytes[](1));
    }

    function test_constructorRefusesANonRedStoneVerifier() public {
        vm.expectRevert(StockReference.BadVerifier.selector);
        new StockReference(admin, IPrintVerifier(makeAddr("nothing")), IDataStreamsVerifierProxy(address(0)));
    }
}
