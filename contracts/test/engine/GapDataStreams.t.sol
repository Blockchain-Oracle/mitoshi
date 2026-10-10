// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {DataStreamsPrintVerifier} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {DataStreamsProxyStub} from "./harness/DataStreamsProxyStub.sol";
import {GapPolicy} from "../../script/lib/GapPolicy.sol";
import {EngineCheck} from "../../script/lib/EngineCheck.sol";
import "../../src/engine/EngineTypes.sol";

/// S6 (G-03, D-217): the mainnet Gap's version 0 — Data Streams primary admitting its Friday open until the lock, RedStone
/// checked inside the spec's window — is a policy the engine accepts on a Gap Series and refuses on any other lane.
contract GapDataStreamsTest is EngineFixture {
    DataStreamsPrintVerifier internal ds;

    function setUp() public override {
        super.setUp();
        ds = new DataStreamsPrintVerifier(address(new DataStreamsProxyStub()));
    }

    /// The venue spec's values: RedStone `admissionSec` 900, the check's 120 s window, 60 s strict, 25 bp; grace 5 s.
    function _params() internal view returns (GapPolicy.Params memory) {
        return GapPolicy.Params({
            dataStreams: address(ds),
            dataStreamsFeed: 0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d, // TSLA RegularHours v11
            graceSec: 5,
            redstone: address(rsVerifier),
            redstoneFeed: bytes32("TSLA"),
            strictSec: 60,
            admissionSec: 900,
            checkAdmissionSec: 120,
            maxDivergenceBps: 25
        });
    }

    function _series(uint8 basis, uint32 cadence) internal returns (bytes32 sid) {
        vm.prank(admin);
        sid = engine.registerSeries(RegisterSeriesArgs(1, basis, cadence, 1000, 1000, 1000, 20, 400_000, 16, 16));
    }

    function test_theGapTakesDataStreamsWithARedStoneCheck() public {
        bytes32 gap = _series(BASIS_GAP, GAP_CADENCE_SEC);
        PolicyVersion memory v = GapPolicy.dataStreamsPrimary(_params());
        assertEq(v.primary.statusMask, uint8(1 << 2 | 1 << 5), "Open or Closed, never Unknown");
        assertEq(v.primary.openAdmissionSec, ADMIT_UNTIL_LOCK, "Friday's report admitted until the lock");
        vm.prank(admin);
        engine.addPolicyVersion(gap, 0, v);
    }

    function test_onlyTheGapMayAdmitUntilTheLock() public {
        bytes32 regular = _series(BASIS_REGULAR, 900);
        PolicyVersion memory v = GapPolicy.dataStreamsPrimary(_params());
        vm.prank(admin);
        vm.expectRevert(E.BadPolicy.selector);
        engine.addPolicyVersion(regular, 0, v);
    }

    function test_theRedStoneCheckMustBeStrictInsideItsWindow() public {
        bytes32 gap = _series(BASIS_GAP, GAP_CADENCE_SEC);
        GapPolicy.Params memory p = _params();
        p.strictSec = 300; // the spec's primary strictSec would leave the check's window before all signers are due
        PolicyVersion memory v = GapPolicy.dataStreamsPrimary(p);
        vm.prank(admin);
        vm.expectRevert(E.BadPolicy.selector);
        engine.addPolicyVersion(gap, 0, v);
    }
}

/// The same policy read from the real `venue-spec.json` through `EngineCheck.seriesPolicy`: Tempo mainnet's TSLA Gap takes
/// Data Streams on TSLA's RegularHours v11 stream; on Moderato it stays RedStone primary (Q-011), unchanged.
contract GapSpecTest is EngineFixture, EngineCheck {
    function test_theSpecPicksDataStreamsOnMainnetOnly() public {
        DataStreamsPrintVerifier dsv = new DataStreamsPrintVerifier(address(new DataStreamsProxyStub()));
        Deployed memory d;
        d.rs = rsVerifier;
        d.ds = dsv;
        SeriesSpec memory gap = SeriesSpec("TSLA-gap", 1, BASIS_GAP, GAP_CADENCE_SEC, bytes32("TSLA"), "TSLA");
        vm.chainId(4217);
        Spec memory s = spec();
        assertTrue(s.gapOnDataStreams);
        PolicyVersion memory v = seriesPolicy(d, gap, s);
        assertEq(v.primary.source, SOURCE_DATA_STREAMS);
        assertEq(v.primary.feedId, 0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d);
        assertEq(v.check.source, SOURCE_REDSTONE);
        vm.prank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(1, BASIS_GAP, GAP_CADENCE_SEC, 1000, 1000, 1000, 20, 400_000, 16, 16));
        vm.prank(admin);
        engine.addPolicyVersion(sid, 0, v);
        SeriesSpec memory regular = SeriesSpec("TSLA-15m", 1, BASIS_REGULAR, 900, bytes32("TSLA"), "TSLA");
        assertEq(seriesPolicy(d, regular, s).primary.source, SOURCE_REDSTONE);
        vm.chainId(42431);
        Spec memory t = spec();
        assertFalse(t.gapOnDataStreams);
        PolicyVersion memory testnet = seriesPolicy(d, gap, t);
        assertEq(testnet.primary.source, SOURCE_REDSTONE);
        assertEq(testnet.check.source, SOURCE_NONE);
    }
}
