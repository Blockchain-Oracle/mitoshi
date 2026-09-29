// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MatchTestBase} from "./harness/MatchTestBase.sol";
import {MatchHarness} from "./harness/MatchHarness.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import "../../src/engine/EngineTypes.sol";

/// E-19 / T01 (Q-006 "enforced"): no order may take before the Window's open print is recorded on chain; PostOnly may
/// still rest (Agari only refused this in the web, `packages/core/src/lifecycle/phase.ts:30-38`).
contract OpenPrintGateTest is MatchTestBase {
    function setUp() public override {
        vm.warp(START);
        h = new MatchHarness();
        m = h.openTestMarket(START, START + 100_000, false);
    }

    function test_takersRefusedUntilTheOpenPrint() public {
        uint8[3] memory takers = [ORDER_NORMAL, ORDER_FOK, ORDER_IOC];
        for (uint256 i; i < 3; ++i) {
            placeRevert(2, order(KIND_BUY_NO, 700, 100, takers[i]), E.OpenPrintMissing.selector);
        }
    }

    function test_postOnlyRestsWithoutTheOpenPrint() public {
        PlaceResult memory r = place(1, order(KIND_BUY_YES, 400, 100, ORDER_POST_ONLY));
        assertEq(r.restedLots, 100);
        assertEq(r.stopReason, STOP_POST_ONLY_RESTED);
    }

    function test_afterTheOpenPrintTakersFill() public {
        place(1, order(KIND_BUY_YES, 400, 100, ORDER_POST_ONLY));
        h.setOpenPrint(m);
        PlaceResult memory r = place(2, order(KIND_BUY_NO, 400, 100, ORDER_IOC));
        assertEq(r.filledLots, 100);
    }

    /// The gate sits after the status check: a Listed Window still answers PreOpenTakerRefused first.
    function test_statusIsCheckedFirst() public {
        vm.warp(START - 10);
        placeRevert(2, order(KIND_BUY_NO, 700, 100, ORDER_IOC), E.PreOpenTakerRefused.selector);
    }
}
