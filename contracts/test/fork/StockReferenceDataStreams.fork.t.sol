// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {PrintSigner as S} from "../engine/harness/PrintSigner.sol";
import {RedStonePrintVerifier} from "../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {IDataStreamsVerifierProxy} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {StockReference} from "../../src/stocks/StockReference.sol";
import {Ref, RefSource, SessionState} from "../../src/stocks/interfaces/IStockReference.sol";

/// B.6 `StockReference.t.sol` "SPY v11 fork": the archived SPY RegularHours v11 report (fixtures/prints) pushed through
/// the real Tempo mainnet VerifierProxy: mid 763.025 becomes the reference, `observationsTimestamp` its observation
/// time, and `marketStatus` 2 drives `currentSession()` = REGULAR while under 120 s old. Pinned block (see
/// Mainnet.DataStreams.fork.t.sol). Run: `forge test --match-contract StockReferenceDataStreamsFork`.
contract StockReferenceDataStreamsForkTest is Test {
    uint256 internal constant BLOCK = 41_742_739;
    address internal constant PROXY = 0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7;
    bytes32 internal constant SPY = 0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac;
    uint64 internal constant OBS = 1_788_976_800;
    address internal constant MIRROR = address(0x5959);

    StockReference internal ref;
    bytes internal report;

    function setUp() public {
        vm.createSelectFork(vm.envOr("TEMPO_MAINNET_RPC_HTTP_URL", string("https://rpc.tempo.xyz")), BLOCK);
        ref = new StockReference(address(this), IPrintVerifier(address(new RedStonePrintVerifier(S.signers(5), 3))), IDataStreamsVerifierProxy(PROXY));
        ref.setFeeds(MIRROR, bytes32(0), SPY);
        report = vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/prints/datastreams-spy-v11-1788976800.hex")))));
    }

    function test_realSpyV11BecomesTheReference() public {
        bytes[] memory rs = new bytes[](1);
        rs[0] = report;
        ref.pushDataStreams(rs);
        Ref memory r = ref.read(MIRROR);
        assertEq(r.priceE18, 763.025e18);
        assertEq(r.observedAt, OBS);
        assertEq(uint8(r.source), uint8(RefSource.DATASTREAMS));
        assertEq(ref.dsMarketStatus(), 2);
        assertEq(ref.dsMarketStatusAt(), OBS);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN), "the status is days old at the fork block");
        vm.warp(OBS + 60);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.REGULAR));
        vm.warp(OBS + 121);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN));
        // re-pushing the same report is ignored (not newer), never a revert
        ref.pushDataStreams(rs);
        assertEq(ref.read(MIRROR).observedAt, OBS);
    }

    function test_unpinnedStreamRefused_tamperedRefused() public {
        ref.setFeeds(MIRROR, bytes32(0), bytes32(0));
        bytes[] memory rs = new bytes[](1);
        rs[0] = report;
        vm.expectRevert(abi.encodeWithSelector(StockReference.UnknownStream.selector, SPY));
        ref.pushDataStreams(rs);
        ref.setFeeds(MIRROR, bytes32(0), SPY);
        bytes memory bad = bytes.concat(report);
        bad[400] = bytes1(uint8(bad[400]) ^ 1);
        rs[0] = bad;
        vm.expectRevert();
        ref.pushDataStreams(rs);
    }
}
