// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {TestPrintVerifier} from "./harness/TestPrintVerifier.sol";
import {Policies} from "./harness/Policies.sol";
import {ResolveLib} from "../../src/engine/libs/ResolveLib.sol";
import {PrintLib} from "../../src/engine/libs/PrintLib.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// {print_rules.rs,copy_open_from_prev.rs} and anchor/crates/agari-common/src/print/normalize.rs (tests).
/// E-43 (PD-6 admission order), E-48 (copy open from prev) and E-49 (normalization to 1e-8).
contract PrintsTest is EngineFixture {
    function normalize(int256 p, int8 e) external pure returns (int64) {
        return ResolveLib.normalize(p, e);
    }

    function _print(bytes32 id, uint8 which) internal view returns (Print memory) {
        uint256 base = uint256(keccak256(abi.encode(id, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS)));
        uint256 slot = uint256(engine.extsload(bytes32(base + 1 + which / 2)));
        return PrintLib.unpack(uint128(which % 2 == 0 ? slot : slot >> 128));
    }

    function _proof(int256 price, int8 expo) internal pure returns (bytes memory) {
        return abi.encode(price, expo, uint8(5));
    }

    function test_admissionOrder() public {
        bytes32 fresh = list(LOCK, LOCK + 300, false);
        vm.expectRevert(E.UnknownMarket.selector);
        engine.recordPrint(keccak256("nope"), WHICH_OPEN, _proof(1, 0));
        vm.expectRevert(E.BadPrintSlot.selector);
        engine.recordPrint(fresh, 4, _proof(1, 0));
        vm.expectRevert(E.WrongPrintSource.selector); // no check source on the launch version
        engine.recordPrint(fresh, WHICH_CHECK_OPEN, _proof(1, 0));
        vm.expectRevert(E.PrintTooEarly.selector); // T = LOCK is still ahead
        engine.recordPrint(fresh, WHICH_OPEN, _proof(1, 0));
        vm.warp(LOCK);
        engine.recordPrint(fresh, WHICH_OPEN, _proof(36_547_600, -5));
        assertEq(_print(fresh, WHICH_OPEN).priceE8, 36_547_600_000);
        assertEq(_print(fresh, WHICH_OPEN).source, SOURCE_REDSTONE);
        assertEq(_print(fresh, WHICH_OPEN).sourceTs, LOCK);
        vm.expectRevert(E.PrintAlreadyRecorded.selector); // the first valid print wins
        engine.recordPrint(fresh, WHICH_OPEN, _proof(2, 0));
        vm.expectRevert(E.PrintTooEarly.selector);
        engine.recordPrint(fresh, WHICH_CLOSE, _proof(1, 0));
        vm.warp(LOCK + 300 + 900); // the close deadline itself is still admissible
        engine.recordPrint(fresh, WHICH_CLOSE, _proof(1, 0));
        bytes32 late = list(LOCK + 1200, LOCK + 1500, false);
        vm.warp(LOCK + 1500 + 901);
        vm.expectRevert(E.PrintTooLate.selector);
        engine.recordPrint(late, WHICH_CLOSE, _proof(1, 0));
        vm.expectRevert(E.PrintTooLate.selector);
        engine.recordPrint(late, WHICH_OPEN, _proof(1, 0));
        engine.voidExpired(late);
        vm.expectRevert(E.MarketAlreadyTerminal.selector);
        engine.recordPrint(late, WHICH_CLOSE, _proof(1, 0));
    }

    /// An attested source waits `minDelaySec` after T (the bar must be complete); a check slot's deadline is
    /// `T + checkAdmissionSec`.
    function test_minDelayAndCheckDeadline() public {
        TestPrintVerifier att = new TestPrintVerifier(SOURCE_ATTESTED);
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(901, BASIS_REGULAR, 300, 1000, 1000, 1, 20, 400_000, 32, 16));
        engine.addPolicyVersion(sid, 0, Policies.checked(Policies.launch(address(rsVerifier), 0, OPEN_ENDED), Policies.attested(address(att), 120)));
        vm.stopPrank();
        vm.prank(roller);
        bytes32 c = engine.openWindow(OpenWindowArgs(sid, 0, LOCK, LOCK + 300, LOCK + 300, 0, 2));
        vm.warp(LOCK + 9);
        vm.expectRevert(E.PrintTooEarly.selector);
        engine.recordPrint(c, WHICH_CHECK_OPEN, _proof(1, 0));
        vm.warp(LOCK + 10);
        vm.expectEmit(true, false, false, true, address(engine));
        emit Ev.PrintRecorded(c, 2, WHICH_CHECK_OPEN, SOURCE_ATTESTED, 100_000_000, LOCK, 5, false);
        engine.recordPrint(c, WHICH_CHECK_OPEN, _proof(1, 0));
        vm.warp(LOCK + 300 + 121);
        vm.expectRevert(E.PrintTooLate.selector);
        engine.recordPrint(c, WHICH_CHECK_CLOSE, _proof(1, 0));
    }

    function test_normalize() public view {
        // Archived TSLA 2026-09-11 20:00:00Z: 36,547,600 × 1e-5 = 365.476.
        assertEq(this.normalize(36_547_600, -5), 36_547_600_000);
        assertEq(this.normalize(365, 0), 36_500_000_000);
        assertEq(this.normalize(36_547_600_000, -8), 36_547_600_000);
        // Finer sources floor: 365.4760000009 at 1e-18 → 365.47600000.
        assertEq(this.normalize(365_476_000_000_900_000_000, -18), 36_547_600_000);
        assertEq(this.normalize(19, -9), 1);
        assertEq(this.normalize(type(int64).max / 100_000_000, 0), type(int64).max / 100_000_000 * 100_000_000);
    }

    function test_normalizeRefusals() public {
        int256[7] memory prices = [int256(9), 0, -1, 1, 1, type(int64).max, type(int256).max];
        int8[7] memory expos = [int8(-9), -5, -5, 1, -19, 0, -1];
        for (uint256 i; i < 7; ++i) {
            vm.expectRevert(E.InvalidPrintValue.selector);
            this.normalize(prices[i], expos[i]);
        }
    }

    function test_copyOpenFromPrev() public {
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(902, BASIS_REGULAR, 300, 1000, 1000, 1, 20, 400_000, 32, 16));
        engine.addPolicyVersion(sid, 0, Policies.launch(address(rsVerifier), 0, OPEN_ENDED));
        vm.stopPrank();
        vm.startPrank(roller);
        bytes32 a = engine.openWindow(OpenWindowArgs(sid, 0, START, LOCK, LOCK, 0, 2));
        bytes32 b = engine.openWindow(OpenWindowArgs(sid, 1, LOCK, LOCK + 300, LOCK + 300, 0, 2));
        bytes32 gapped = engine.openWindow(OpenWindowArgs(sid, 2, LOCK + 600, LOCK + 900, LOCK + 900, 0, 2));
        vm.stopPrank();
        vm.expectRevert(E.PrintNotAdjacent.selector);
        engine.copyOpenFromPrev(b, b);
        vm.expectRevert(E.PrintNotAdjacent.selector);
        engine.copyOpenFromPrev(b, m); // another Series
        vm.expectRevert(E.PrintsMissing.selector);
        engine.copyOpenFromPrev(b, a); // a's close not yet recorded
        vm.warp(LOCK);
        recordClose(a, 36_600_000_000);
        vm.expectRevert(E.PrintNotAdjacent.selector);
        engine.copyOpenFromPrev(gapped, b);
        engine.copyOpenFromPrev(b, a);
        Print memory open = _print(b, WHICH_OPEN);
        assertEq(open.priceE8, 36_600_000_000);
        assertEq(open.flags & PRINT_FLAG_COPIED_FROM_PREV, PRINT_FLAG_COPIED_FROM_PREV);
        vm.expectRevert(E.PrintAlreadyRecorded.selector);
        engine.copyOpenFromPrev(b, a);
        // After the open deadline the copy is refused like any print.
        vm.warp(LOCK + 300);
        recordClose(b, 1e8);
        vm.warp(LOCK + 600 + 901);
        vm.expectRevert(E.PrintTooLate.selector); // Agari's order: the deadline is checked before adjacency
        engine.copyOpenFromPrev(gapped, b);
    }

    /// E-48: the predecessor's check close is copied too, but only inside the check window.
    function test_copyAlsoCopiesTheCheckInsideItsWindow() public {
        TestPrintVerifier att = new TestPrintVerifier(SOURCE_ATTESTED);
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(903, BASIS_REGULAR, 300, 1000, 1000, 1, 20, 400_000, 32, 16));
        engine.addPolicyVersion(sid, 0, Policies.checked(Policies.launch(address(rsVerifier), 0, OPEN_ENDED), Policies.attested(address(att), 120)));
        vm.stopPrank();
        vm.startPrank(roller);
        bytes32 a = engine.openWindow(OpenWindowArgs(sid, 0, START, LOCK, LOCK, 0, 2));
        bytes32 b = engine.openWindow(OpenWindowArgs(sid, 1, LOCK, LOCK + 300, LOCK + 300, 0, 2));
        bytes32 c = engine.openWindow(OpenWindowArgs(sid, 2, LOCK + 300, LOCK + 600, LOCK + 600, 0, 2));
        vm.stopPrank();
        vm.warp(LOCK + 10);
        recordClose(a, 36_600_000_000);
        engine.recordPrint(a, WHICH_CHECK_CLOSE, _proof(366, 0));
        engine.copyOpenFromPrev(b, a);
        assertEq(_print(b, WHICH_CHECK_OPEN).priceE8, 36_600_000_000);
        assertEq(_print(b, WHICH_CHECK_OPEN).flags, PRINT_FLAG_COPIED_FROM_PREV);
        vm.warp(LOCK + 310);
        recordClose(b, 36_700_000_000);
        engine.recordPrint(b, WHICH_CHECK_CLOSE, _proof(367, 0));
        vm.warp(LOCK + 300 + 121); // past c's check window, inside its open deadline
        engine.copyOpenFromPrev(c, b);
        assertEq(_print(c, WHICH_OPEN).priceE8, 36_700_000_000);
        assertEq(_print(c, WHICH_CHECK_OPEN).source, SOURCE_NONE, "the check is not copied late");
    }
}
