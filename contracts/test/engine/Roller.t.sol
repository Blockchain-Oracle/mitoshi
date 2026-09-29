// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {EventsEngine} from "../../src/engine/EventsEngine.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {RedStonePrintVerifier} from "../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {PrintSigner} from "./harness/PrintSigner.sol";
import {Policies} from "./harness/Policies.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// window_rules.rs (tests) and roller_open_window.rs.
/// E-26: the roller lists Windows index by index, back to back at most, clock-aligned, within the horizon, on the
/// highest policy version covering both boundaries, with admission deadlines frozen at listing.
contract RollerTest is Test {
    /// Fri 2026-09-25 19:50:00Z and that day's 16:00 ET close.
    uint40 internal constant NOW = 1_790_365_800;
    uint40 internal constant CLOSE_0925 = 1_790_366_400;

    EventsEngine internal engine;
    RedStonePrintVerifier internal rs;
    address internal admin = makeAddr("admin");
    address internal roller = makeAddr("roller");

    function setUp() public {
        vm.warp(NOW);
        engine = new EventsEngine(address(StdTokens.PATH_USD), admin, makeAddr("treasury"));
        rs = new RedStonePrintVerifier(PrintSigner.signers(5), 3);
        vm.prank(admin);
        engine.setRoller(roller, true);
    }

    function _series(uint8 basis, uint32 cadence, uint40[2][] memory versions) internal returns (bytes32 sid) {
        vm.startPrank(admin);
        sid = engine.registerSeries(RegisterSeriesArgs(uint16(cadence) + basis, basis, cadence, 1000, 1000, 1000, 20, 86_400, 16, 16));
        for (uint256 i; i < versions.length; ++i) {
            PolicyVersion memory v = Policies.launch(address(rs), versions[i][0], versions[i][1]);
            if (basis == BASIS_GAP) v.primary.openAdmissionSec = ADMIT_UNTIL_LOCK;
            engine.addPolicyVersion(sid, uint8(i), v);
        }
        vm.stopPrank();
    }

    function _open(bytes32 sid, uint64 index, uint40 start, uint40 lock, uint40 expiry) internal returns (bytes32) {
        vm.prank(roller);
        return engine.openWindow(OpenWindowArgs(sid, index, start, lock, expiry, 0, 2));
    }

    function _expectOpen(bytes4 err, bytes32 sid, uint64 index, uint40 start, uint40 lock, uint40 expiry) internal {
        vm.prank(roller);
        vm.expectRevert(err);
        engine.openWindow(OpenWindowArgs(sid, index, start, lock, expiry, 0, 2));
    }

    function _two(uint40 a0, uint40 a1, uint40 b0, uint40 b1) internal pure returns (uint40[2][] memory v) {
        v = new uint40[2][](2);
        (v[0], v[1]) = ([a0, a1], [b0, b1]);
    }

    function _one(uint40 a0, uint40 a1) internal pure returns (uint40[2][] memory v) {
        v = new uint40[2][](1);
        v[0] = [a0, a1];
    }

    function _market(bytes32 m) internal view returns (uint256 s0, uint256 s4, uint256 s5) {
        uint256 base = uint256(keccak256(abi.encode(m, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS)));
        s0 = uint256(engine.extsload(bytes32(base)));
        s4 = uint256(engine.extsload(bytes32(base + 4)));
        s5 = uint256(engine.extsload(bytes32(base + 5)));
    }

    function test_highestCoveringVersion() public {
        bytes32 tsla = _series(BASIS_REGULAR, 300, _two(1_789_084_800, CLOSE_0925, CLOSE_0925, OPEN_ENDED));
        // Friday's last 5m Window [15:55, 16:00] ET: v2 starts at CLOSE_0925, so only v1 covers both boundaries.
        bytes32 m = _open(tsla, 0, CLOSE_0925 - 300, CLOSE_0925, CLOSE_0925);
        (uint256 s0,,) = _market(m);
        assertEq(uint8(s0 >> 232), 0, "policyVersion v1");
        bytes32 gap = _series(BASIS_GAP, GAP_CADENCE_SEC, _two(1_789_084_800, CLOSE_0925, CLOSE_0925, OPEN_ENDED));
        (uint40 lock, uint40 mondayOpen) = (CLOSE_0925 + 187_200, CLOSE_0925 + 235_800);
        bytes32 g = _open(gap, 0, CLOSE_0925, lock, mondayOpen);
        (s0,,) = _market(g);
        assertEq(uint8(s0 >> 232), 1, "the 09-25 Gap is v2 only");
        bytes32 qqq = _series(BASIS_REGULAR, 60, _one(1_789_084_800, CLOSE_0925));
        _expectOpen(E.SourceNotCovered.selector, qqq, 0, CLOSE_0925, CLOSE_0925 + 60, CLOSE_0925 + 60);
    }

    function test_refusesPartialMisalignedAndOverlongWindows() public {
        bytes32 hourly = _series(BASIS_REGULAR, 3_600, _one(0, OPEN_ENDED));
        uint40 open1330 = 1_790_602_200; // Mon 2026-09-28 13:30Z
        vm.warp(open1330 - 60);
        _expectOpen(E.BadAlignment.selector, hourly, 0, open1330, open1330 + 1_800, open1330 + 1_800);
        bytes32 five = _series(BASIS_REGULAR, 300, _one(0, OPEN_ENDED));
        vm.warp(open1330);
        _expectOpen(E.BadAlignment.selector, five, 0, open1330 + 60, open1330 + 360, open1330 + 360);
        vm.warp(open1330 - 60);
        _expectOpen(E.BadAlignment.selector, five, 0, open1330, open1330 + 300, open1330 + 600);
        bytes32 gap = _series(BASIS_GAP, GAP_CADENCE_SEC, _one(0, OPEN_ENDED));
        vm.warp(NOW);
        _expectOpen(E.BadHorizon.selector, gap, 0, CLOSE_0925, CLOSE_0925 + 3_600, CLOSE_0925 + MAX_GAP_DURATION_SEC + 1);
    }

    function test_refusesIndexHorizonOverlapAndKindsInOrder() public {
        bytes32 five = _series(BASIS_REGULAR, 300, _one(0, OPEN_ENDED));
        (uint40 s, uint40 e) = (CLOSE_0925 - 300, CLOSE_0925);
        _expectOpen(E.BadWindowIndex.selector, five, 1, s, e, e);
        vm.warp(CLOSE_0925);
        _expectOpen(E.BadHorizon.selector, five, 0, s, e, e); // lockAt must be ahead of now
        vm.warp(NOW);
        _open(five, 0, s, e, e);
        _expectOpen(E.WindowOverlap.selector, five, 1, s, e, e);
        _expectOpen(E.BadHorizon.selector, five, 1, e + 86_400, e + 86_700, e + 86_700); // beyond maxLead
        vm.prank(roller);
        vm.expectRevert(E.BadAlignment.selector);
        engine.openWindow(OpenWindowArgs(five, 1, e, e + 300, e + 300, 0, 3));
        vm.expectRevert(E.NotRoller.selector);
        engine.openWindow(OpenWindowArgs(five, 1, e, e + 300, e + 300, 0, 2));
        vm.prank(roller);
        vm.expectRevert(E.UnknownSeries.selector);
        engine.openWindow(OpenWindowArgs(keccak256("nope"), 0, e, e + 300, e + 300, 0, 2));
        vm.prank(admin);
        engine.setMode(MODE_REDUCE_ONLY);
        _expectOpen(E.InvalidMode.selector, five, 1, e, e + 300, e + 300);
    }

    /// Effects: identity, frozen deadlines (PD-6), sequencing, and the event.
    function test_openWindowFreezesDeadlines() public {
        bytes32 five = _series(BASIS_REGULAR, 300, _one(0, OPEN_ENDED));
        (uint40 s, uint40 e) = (CLOSE_0925 - 300, CLOSE_0925);
        bytes32 expected = keccak256(abi.encode(five, uint64(0)));
        vm.expectEmit(true, true, false, true, address(engine));
        emit Ev.WindowOpened(expected, 1, five, 0, 1, s, e, e, s + 900, e + 900, 0, 0, 2, BASIS_REGULAR);
        bytes32 m = _open(five, 0, s, e, e);
        assertEq(m, expected);
        (uint256 s0, uint256 s4, uint256 s5) = _market(m);
        assertEq(uint40(s0), s);
        assertEq(uint40(s0 >> 40), e);
        assertEq(uint40(s0 >> 80), e);
        assertEq(uint40(s0 >> 120), s + 900, "openDeadline = start + openAdmission");
        assertEq(uint40(s0 >> 160), e + 900, "closeDeadline = expiry + closeAdmission");
        assertEq(uint48(s4 >> 56), 1, "eventSeq taken by WindowOpened");
        assertEq(uint32(s5 >> 64), 1, "mIdx");
        // Back to back: the next index starts at the previous expiry.
        _open(five, 1, e, e + 300, e + 300);
        // The Gap's open deadline is lockAt (ADMIT_UNTIL_LOCK).
        bytes32 gap = _series(BASIS_GAP, GAP_CADENCE_SEC, _one(0, OPEN_ENDED));
        bytes32 g = _open(gap, 0, CLOSE_0925, CLOSE_0925 + 187_200, CLOSE_0925 + 235_800);
        (s0,,) = _market(g);
        assertEq(uint40(s0 >> 120), CLOSE_0925 + 187_200);
    }
}
