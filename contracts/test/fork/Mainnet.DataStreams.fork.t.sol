// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DataStreamsPrintVerifier} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {PrintQuery} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";

/// A.5.2 / A.6: the real Tempo mainnet VerifierProxy verifies the archived SPY v11 RegularHours report (taken from Robinhood
/// Chain tx 0x9bf9d7e6…f7f1; fixtures/prints/README.md) and our verifier prints mid 763.025 at T 1788976800, status 2.
/// Pinned fork block (the report expires 2026-10-09; the pin keeps the replay valid forever).
/// Run: `forge test --match-contract MainnetDataStreamsForkTest` (network; excluded from `contracts:test`).
contract MainnetDataStreamsForkTest is Test {
    uint256 internal constant BLOCK = 41_742_739;
    address internal constant PROXY = 0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7;
    bytes32 internal constant SPY = 0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac;
    uint40 internal constant T = 1_788_976_800;

    DataStreamsPrintVerifier internal v;
    bytes internal report;

    function setUp() public {
        vm.createSelectFork("https://rpc.tempo.xyz", BLOCK);
        v = new DataStreamsPrintVerifier(PROXY);
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/datastreams-spy-v11-1788976800.hex");
        report = vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function test_realSpyV11ReportPrintsTheMid() public {
        assertEq(report.length, 1_152);
        PrintQuery memory q = PrintQuery(bytes32(0), 1, T, SPY, 0, 5, 0, 0, 1, uint8(1 << 2));
        (int256 price, int8 expo, uint40 ts,) = v.verifyPrint(report, q);
        assertEq(price, 763_025e15);
        assertEq(expo, -18);
        assertEq(ts, T);
    }

    function test_theRealReportIsPinnedToItsBoundary() public {
        PrintQuery memory q = PrintQuery(bytes32(0), 1, T + 60, SPY, 0, 5, 0, 0, 0, uint8(1 << 2));
        vm.expectRevert(E.DataStreamsWindowMismatch.selector);
        v.verifyPrint(report, q);
        q.t = T;
        q.statusMask = uint8(1 << 5); // Closed only
        vm.expectRevert(E.InsufficientVerification.selector);
        v.verifyPrint(report, q);
    }

    function test_aTamperedReportFailsTheDonSignatures() public {
        bytes memory bad = bytes.concat(report);
        bad[400] = bytes1(uint8(bad[400]) ^ 1);
        PrintQuery memory q = PrintQuery(bytes32(0), 1, T, SPY, 0, 5, 0, 0, 0, uint8(1 << 2));
        vm.expectRevert();
        v.verifyPrint(bad, q);
    }
}
