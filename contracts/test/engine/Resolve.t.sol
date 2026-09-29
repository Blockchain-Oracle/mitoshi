// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {TestPrintVerifier} from "./harness/TestPrintVerifier.sol";
import {Policies} from "./harness/Policies.sol";
import {ResolveLib} from "../../src/engine/libs/ResolveLib.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// resolve_rules.rs (tests) and resolve_window.rs.
/// E-50/E-51: settlement with the cross-check, the clock-only void, resolve-once, and PD-3 (ties go Up).
contract ResolveTest is EngineFixture {
    TestPrintVerifier internal attVerifier;

    function setUp() public override {
        super.setUp();
        attVerifier = new TestPrintVerifier(SOURCE_ATTESTED);
    }

    function _state(bytes32 id) internal view returns (uint8 state, uint32 py, uint32 pn, uint8 voidReason, uint8 flags) {
        uint256 s4 = uint256(engine.extsload(bytes32(uint256(keccak256(abi.encode(id, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS))) + 4)));
        py = uint32(s4 >> 144);
        pn = uint32(s4 >> 176);
        state = uint8(s4 >> 208);
        voidReason = uint8(s4 >> 216);
        flags = uint8(s4 >> 224);
    }

    /// A market on a Series whose version carries an attested check (120 s window, 25 bp).
    function _checkedMarket() internal returns (bytes32 id) {
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(900, BASIS_REGULAR, 300, 1000, 1000, 1, 20, 400_000, 32, 16));
        engine.addPolicyVersion(
            sid, 0, Policies.checked(Policies.launch(address(rsVerifier), 0, OPEN_ENDED), Policies.attested(address(attVerifier), 120))
        );
        vm.stopPrank();
        vm.prank(roller);
        id = engine.openWindow(OpenWindowArgs(sid, 0, START, LOCK, LOCK, 0, 2));
        markets.push(id);
    }

    function _print(bytes32 id, uint8 which, int256 e8) internal {
        engine.recordPrint(id, which, abi.encode(e8, int8(-8), uint8(1)));
    }

    function test_closeAtOrAboveOpenPaysUp() public {
        vm.warp(LOCK);
        recordClose(m, 36_500_000_000); // tie
        engine.settle(m);
        (uint8 state, uint32 py, uint32 pn,, uint8 flags) = _state(m);
        assertEq(state, STATE_RESOLVED);
        assertEq(py, PAYOUT_DENOMINATOR);
        assertEq(pn, 0);
        assertEq(flags & MARKET_FLAG_SINGLE_SOURCE, 0);
        bytes32 down = list(LOCK, LOCK + 300, true);
        vm.warp(LOCK + 300);
        recordClose(down, 36_499_999_999);
        vm.expectEmit(true, false, false, true, address(engine));
        emit Ev.WindowResolved(down, 4, STATE_RESOLVED, WINNER_NO, 0, PAYOUT_DENOMINATOR, VOID_NONE, false, 36_500_000_000, 36_499_999_999);
        engine.settle(down);
    }

    function test_settleNeedsBothPrints() public {
        vm.warp(LOCK);
        vm.expectRevert(E.PrintsMissing.selector);
        engine.settle(m);
        bytes32 noOpen = list(LOCK, LOCK + 300, false);
        vm.warp(LOCK + 300);
        recordClose(noOpen, 1e8);
        vm.expectRevert(E.PrintsMissing.selector);
        engine.settle(noOpen);
    }

    function test_crossCheckWaitsThenVoidsOnDivergenceOrSettlesSingleSource() public {
        bytes32 c = _checkedMarket();
        recordOpen(c, 10_000_000_000);
        vm.warp(LOCK);
        recordClose(c, 10_100_000_000);
        vm.warp(LOCK + 120);
        vm.expectRevert(E.CrossCheckPending.selector);
        engine.settle(c);
        // 25 bp exactly is within tolerance; 25.0001 bp voids even with the other check missing (checked separately).
        uint256 snap = vm.snapshotState();
        vm.warp(LOCK + 121);
        engine.settle(c);
        (uint8 state,,,, uint8 flags) = _state(c);
        assertEq(state, STATE_RESOLVED);
        assertEq(flags & MARKET_FLAG_SINGLE_SOURCE, MARKET_FLAG_SINGLE_SOURCE, "settled on the primary alone");
        vm.revertToState(snap);
        snap = vm.snapshotState();
        vm.warp(START + 10);
        _print(c, WHICH_CHECK_OPEN, 10_025_000_000);
        vm.warp(LOCK + 121);
        engine.settle(c);
        (state,,,, flags) = _state(c);
        assertEq(state, STATE_RESOLVED);
        vm.revertToState(snap);
        vm.warp(START + 10);
        _print(c, WHICH_CHECK_OPEN, 10_025_000_001);
        vm.warp(LOCK + 121);
        engine.settle(c);
        (uint8 st, uint32 py, uint32 pn, uint8 reason,) = _state(c);
        assertEq(st, STATE_VOIDED);
        assertEq(reason, VOID_CROSS_CHECK_DIVERGENCE);
        assertEq(py, PAYOUT_VOID);
        assertEq(pn, PAYOUT_VOID);
    }

    function test_bothChecksAgreeingSettleBeforeTheBound() public {
        bytes32 c = _checkedMarket();
        recordOpen(c, 10_000_000_000);
        vm.warp(START + 10);
        _print(c, WHICH_CHECK_OPEN, 10_000_000_000);
        vm.warp(LOCK + 10);
        recordClose(c, 10_100_000_000);
        _print(c, WHICH_CHECK_CLOSE, 10_099_000_000);
        engine.settle(c);
        (uint8 state,,,, uint8 flags) = _state(c);
        assertEq(state, STATE_RESOLVED);
        assertEq(flags & MARKET_FLAG_SINGLE_SOURCE, 0);
    }

    function test_voidOnlyAfterAMissedDeadline() public {
        vm.warp(LOCK + 900);
        vm.expectRevert(E.SettlementWindowOpen.selector);
        engine.voidExpired(m);
        vm.warp(LOCK + 901);
        engine.voidExpired(m);
        (uint8 state, uint32 py, uint32 pn, uint8 reason,) = _state(m);
        assertEq(state, STATE_VOIDED);
        assertEq(reason, VOID_MISSING_PRINT);
        assertEq(py, PAYOUT_VOID);
        assertEq(pn, PAYOUT_VOID);
        // A complete Window never voids by the clock.
        bytes32 done = list(LOCK + 900, LOCK + 1200, true);
        vm.warp(LOCK + 1200);
        recordClose(done, 1e8);
        vm.warp(LOCK + 50_000);
        vm.expectRevert(E.SettlementWindowOpen.selector);
        engine.voidExpired(done);
        // An open print missing past its deadline voids before lockAt.
        bytes32 noOpen = list(uint40(LOCK + 50_100), uint40(LOCK + 50_100 + 3_600), false);
        vm.warp(LOCK + 50_100 + 900);
        vm.expectRevert(E.SettlementWindowOpen.selector);
        engine.voidExpired(noOpen);
        vm.warp(LOCK + 50_100 + 901);
        engine.voidExpired(noOpen);
    }

    function test_settleOnce() public {
        vm.warp(LOCK);
        recordClose(m, 1e8);
        engine.settle(m);
        vm.expectRevert(E.MarketAlreadyTerminal.selector);
        engine.settle(m);
        vm.warp(LOCK + 10_000);
        vm.expectRevert(E.MarketAlreadyTerminal.selector);
        engine.voidExpired(m);
        vm.expectRevert(E.MarketAlreadyTerminal.selector);
        engine.recordPrint(m, WHICH_CLOSE, abi.encode(int256(1), int8(0), uint8(1)));
    }

    /// E-18: prints, settle and void are never blocked by an admin mode.
    function test_haltedNeverBlocksResolution() public {
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        vm.warp(LOCK);
        recordClose(m, 2e8);
        engine.settle(m);
        (uint8 state,,,,) = _state(m);
        assertEq(state, STATE_RESOLVED);
    }

    function test_divergenceIsExactIntegerMath() public pure {
        assertFalse(ResolveLib.diverges(10_000, 10_025, 25));
        assertTrue(ResolveLib.diverges(10_000, 10_026, 25));
        assertTrue(ResolveLib.diverges(10_000, 9_974, 25));
        assertFalse(ResolveLib.diverges(type(int64).max, type(int64).max, 0));
    }
}
