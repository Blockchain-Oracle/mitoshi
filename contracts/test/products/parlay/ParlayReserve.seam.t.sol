// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {FairValue} from "../../../src/fair/FairValue.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {IParlayReserve} from "../../../src/products/parlay/IParlayReserve.sol";
import {ParlayReserve} from "../../../src/products/parlay/ParlayReserve.sol";
import {PayoutCheck, Payouts} from "../../../src/products/shared/Payouts.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {ParlayTestBase} from "../harness/ParlayTestBase.sol";

/// The Tempo seam of the parlay reserve (A.4.6): D-108 close order, L-38 per-boundary release, D-109 rested-only
/// pricing, the PD-2 fair-value floor on a same-call signed spot, P12 pay-or-owe, and the constructor's venue checks.
contract ParlayReserveSeamTest is ParlayTestBase {
    uint256 internal constant PAYOUT = 100 * ONE;

    // ------------------------------------------------------------------ D-108: legs decided in close order

    function test_D108_onlyTheEarliestPendingLegMayBeDecided() public {
        // Leg 0 settles later (B) than leg 1 (A): A must be decided first.
        (uint256 id,) = openAs(opener, legs2(marketB, 0, marketA, 0), PAYOUT);
        assertEq(reserve.nextLegOf(id), 1);
        resolve(marketA, 0);
        resolve(marketB, 0);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.LegOutOfOrder.selector, id, 0, 1));
        reserve.resolveLeg(id, 0);
        reserve.resolveLeg(id, 1);
        assertEq(reserve.nextLegOf(id), 0);
        reserve.resolveLeg(id, 0);
        assertEq(uint8(reserve.parlayOf(id).status), uint8(IParlayReserve.ParlayStatus.WON));
        assertEq(reserve.nextLegOf(id), 2, "none pending: legCount");
    }

    function test_D108_aTieGoesToTheLowestIndex() public {
        (uint256 id,) = openAs(opener, legs2(marketC, 0, marketB, 0), PAYOUT);
        resolve(marketB, 0);
        resolve(marketC, 0);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.LegOutOfOrder.selector, id, 1, 0));
        reserve.resolveLeg(id, 1);
        reserve.resolveLeg(id, 0);
        reserve.resolveLeg(id, 1);
        assertEq(uint8(reserve.parlayOf(id).status), uint8(IParlayReserve.ParlayStatus.WON));
    }

    /// The reference let whoever cranks first choose between a lost leg and a voided one; the earlier close decides.
    function test_D108_aLostLegBeforeAVoidedOneLosesWhoeverCranks() public {
        (uint256 id, uint256 stake) = openAs(opener, legs2(marketB, 1, marketA, 0), PAYOUT);
        resolve(marketA, 1); // A (leg 1, earlier) lost: DOWN won, the ticket had UP
        resolve(marketB, 2); // B (leg 0) voided
        uint256 before = usd.balanceOf(opener);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.LegOutOfOrder.selector, id, 0, 1));
        reserve.resolveLeg(id, 0); // the owner reaching for the refund first is refused
        reserve.resolveLeg(id, 1);
        assertEq(uint8(reserve.parlayOf(id).status), uint8(IParlayReserve.ParlayStatus.LOST));
        reserve.resolveLeg(id, 0); // finished: a no-op
        assertEq(usd.balanceOf(opener), before, "no refund");
        assertEq(reserve.liquid(), SUPPLY + stake);
        assertBooksBalance();
    }

    // ------------------------------------------------------------------ L-38: a decided boundary releases at once

    function test_L38_aWonLegReleasesItsBoundaryImmediately() public {
        (uint256 id, uint256 stake) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        uint256 h = PAYOUT - stake;
        assertEq(reserve.lockedByExpiry(EXP_A), h);
        resolve(marketA, 0);
        vm.expectEmit(address(reserve));
        emit IParlayReserve.ExpiryReleased(id, EXP_A, h);
        reserve.resolveLeg(id, 0);
        assertEq(reserve.lockedByExpiry(EXP_A), 0, "nothing more rides on A's print");
        assertEq(reserve.lockedByExpiry(EXP_B), h, "B's still does");
        assertEq(reserve.locked(), h, "the aggregate waits for the ticket's end");
        // A new ticket on A's instant is no longer counted against the old one's lock.
        resolve(marketB, 1);
        reserve.resolveLeg(id, 1);
        assertEq(reserve.lockedByExpiry(EXP_B), 0);
        assertEq(reserve.locked(), 0);
        assertBooksBalance();
    }

    function test_L38_aSharedBoundaryReleasesOnlyWithItsLastPendingLeg() public {
        (uint256 id, uint256 stake) = openAs(opener, legs3(marketA, marketB, marketC), 50 * ONE);
        uint256 h = 50 * ONE - stake;
        resolve(marketA, 0);
        resolve(marketB, 0);
        resolve(marketC, 0);
        reserve.resolveLeg(id, 0);
        reserve.resolveLeg(id, 1);
        assertEq(reserve.lockedByExpiry(EXP_B), h, "C still pending on B's instant");
        reserve.resolveLeg(id, 2);
        assertEq(reserve.lockedByExpiry(EXP_B), 0);
        assertEq(reserve.locked(), h, "until claimed");
        reserve.claim(id);
        assertEq(reserve.locked(), 0);
        assertEq(reserve.lockedByExpiry(EXP_A), 0);
        assertBooksBalance();
    }

    function test_L38_aLossAfterAReleaseDoesNotReleaseTwice() public {
        // A second ticket shares A's instant so a double release would show as an underflowed sub-cap.
        (uint256 id,) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        (, uint256 stake2) = openAs(opener, legs2(marketA, 1, marketC, 0), 20 * ONE);
        uint256 h2 = 20 * ONE - stake2;
        resolve(marketA, 0);
        reserve.resolveLeg(id, 0); // won: A released for ticket 1
        resolve(marketB, 1);
        reserve.resolveLeg(id, 1); // lost: B released, A skipped
        assertEq(reserve.lockedByExpiry(EXP_A), h2, "only ticket 2's lock on A remains");
        assertEq(reserve.lockedByExpiry(EXP_B), h2, "B and C share an instant: ticket 2's lock");
        assertBooksBalance();
    }

    // ------------------------------------------------------------------ D-109: rested depth only

    function test_D109_aFreshOrderPricesNothingUntilItRests() public {
        setBook(marketA, 600_000, 620_000, 580_000, 550_000); // replaced just now
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.ThinBook.selector, marketA, 0, PAYOUT));
        reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        vm.warp(vm.getBlockTimestamp() + REST - 1);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.ThinBook.selector, marketA, 0, PAYOUT));
        reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        vm.warp(vm.getBlockTimestamp() + 1);
        (,, uint256[] memory prices,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        assertEq(prices[0], 600_000);
    }

    /// A spoof just placed under the ask cannot cheapen a leg: the walk skips it until it has sat takeable.
    function test_D109_aSpoofedCheapAskIsIgnored() public {
        _rest(marketA, 2, 590_000, 400 * ONE); // a YES ask at 0.59 (inside the spread), 400 deep, just placed
        (,, uint256[] memory prices,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        assertEq(prices[0], 600_000, "priced over the rested 0.60, not the fresh 0.59");
        (uint256 p0,) = reserve.previewLegPrice(marketA, 0, PAYOUT);
        assertEq(p0, 600_000);
    }

    /// The reserve's own rest floor applies when it is stricter than the Series'.
    function test_D109_theStricterOfSeriesAndParamsRestApplies() public {
        IParlayReserve.Params memory p = defaultParams();
        p.minRestSec = 60;
        reserve.setParams(p);
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        rest(); // 20 s: enough for the Series, not for the reserve
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.ThinBook.selector, marketA, 0, PAYOUT));
        reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        vm.warp(vm.getBlockTimestamp() + 40);
        (,, uint256[] memory prices,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), PAYOUT);
        assertEq(prices[0], 600_000);
    }

    // ------------------------------------------------------------------ PD-2: the fair-value floor per leg

    function test_PD2_aLegTheBookUnderpricesIsRefused() public {
        spotE8 = 36_700_000_000; // spot 367 vs open 365: P(Up) ≈ 0.96
        uint256 fair = guard.previewFairUpE6(marketA, int64(int256(spotE8)));
        assertGt(fair, 900_000);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BelowFairValue.selector, marketA, 600_000, fair));
        openAs(opener, legs2(marketA, 0, marketB, 1), PAYOUT);
    }

    function test_PD2_theFloorIsOneSided() public {
        // Spot far below the open: DOWN is near-certain (fair Down ≈ 0.96) and the book sells it at 0.42 — refused …
        spotE8 = 36_300_000_000;
        uint256 fairDownA = FairValue.P_ONE - guard.previewFairUpE6(marketA, int64(int256(spotE8)));
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BelowFairValue.selector, marketA, 420_000, fairDownA));
        openAs(opener, legs2(marketA, 1, marketB, 1), PAYOUT);
        // … while UP legs priced far above their fair value (0.60 vs ≈ 0.04) are the house's gain, not a refusal.
        (uint256 id,) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        assertEq(id, 1);
    }

    function test_PD2_theSlackIsTheOnlyTolerance() public {
        spotE8 = 36_530_000_000; // fair P(Up) on A just over the 0.60 ask
        uint256 fairUp = guard.previewFairUpE6(marketA, int64(int256(spotE8)));
        assertGt(fairUp, 600_000);
        assertLt(fairUp, 650_000);
        IParlayReserve.Params memory p = defaultParams();
        p.fairSlackRaw = 0;
        reserve.setParams(p);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BelowFairValue.selector, marketA, 600_000, fairUp));
        openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        reserve.setParams(defaultParams()); // 0.05 of slack: the same book and spot open
        (uint256 id,) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        assertEq(id, 1);
    }

    function test_PD2_everyLegNeedsItsOwnVerifiedSpot() public {
        IParlayReserve.LegInput[] memory legs = legs2(marketA, 0, marketB, 0);
        bytes[] memory one = spots(1);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BadProofCount.selector, 1, 2));
        reserve.openParlay(legs, PAYOUT, type(uint256).max, one);

        bytes[] memory proofs = spots(2);
        proofs[1] = PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp() - 121); // older than the guard's 120 s
        vm.prank(opener);
        vm.expectRevert(E.SpotTooOld.selector);
        reserve.openParlay(legs, PAYOUT, type(uint256).max, proofs);

        proofs[1] = PrintSigner.five(bytes32("BTC"), spotE8, vm.getBlockTimestamp()); // another feed
        vm.prank(opener);
        vm.expectRevert(E.FeedIdMismatch.selector);
        reserve.openParlay(legs, PAYOUT, type(uint256).max, proofs);

        guard.setSigma(lens.marketRef(marketB).seriesId, 0); // a Series the guard has no model for refuses by name
        proofs = spots(2);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(FairValueGuard.SigmaNotSet.selector, lens.marketRef(marketB).seriesId));
        reserve.openParlay(legs, PAYOUT, type(uint256).max, proofs);
        assertEq(reserve.parlayCount(), 0, "nothing opened, nothing taken");
    }

    // ------------------------------------------------------------------ P12: payouts to a blocking receiver are held

    function test_P12_aBlockedOwnersRefundAndClaimAreHeldAsOwed() public {
        (uint256 idVoid, uint256 stakeVoid) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        (uint256 id2,) = openAs(opener, legs2(marketA, 1, marketC, 0), 20 * ONE);
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, opener); // policy 0: reject every inbound
        resolve(marketA, 2); // A voids: ticket 1 refunds, ticket 2 voids too
        uint256 before = usd.balanceOf(opener);
        reserve.resolveLeg(idVoid, 0);
        assertEq(usd.balanceOf(opener), before, "not pushed into the receive-policy guard");
        assertEq(reserve.owedOf(opener), stakeVoid);
        assertBooksBalance();
        reserve.resolveLeg(id2, 0);
        uint256 owed = reserve.owedOf(opener);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, opener));
        reserve.claimOwed();
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, opener);
        vm.prank(stranger);
        vm.expectRevert(Payouts.NothingOwed.selector);
        reserve.claimOwed();
        vm.prank(opener);
        assertEq(reserve.claimOwed(), owed);
        assertEq(usd.balanceOf(opener), before + owed);
        assertEq(reserve.totalOwedPayouts(), 0);
        assertBooksBalance();
    }

    function test_P12_aWonTicketsClaimIsHeldThenCollected() public {
        (uint256 id,) = openAs(opener, legs2(marketA, 0, marketB, 0), PAYOUT);
        resolve(marketA, 0);
        reserve.resolveLeg(id, 0);
        resolve(marketB, 0);
        reserve.resolveLeg(id, 1);
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, opener);
        vm.prank(stranger);
        reserve.claim(id);
        assertEq(uint8(reserve.parlayOf(id).status), uint8(IParlayReserve.ParlayStatus.CLAIMED));
        assertEq(reserve.owedOf(opener), PAYOUT);
        assertEq(reserve.locked(), 0);
        assertBooksBalance();
    }

    function test_P12_aSuppliersWithdrawRefusesWhileBlocked() public {
        uint256 shares = reserve.sharesOf(house);
        vm.startPrank(house);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, house);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, house));
        reserve.withdraw(shares);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, house);
        assertEq(reserve.withdraw(shares), SUPPLY);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ construction: the venue is structural

    function test_constructor_checksCollateralLensGuardAndOptsOut() public {
        assertTrue(lens.crankOptedOut(address(reserve)), "D-015: no third-party redeem into the reserve");
        IParlayReserve.Params memory p = defaultParams();
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.WrongCollateral.selector, address(usd)));
        new ParlayReserve(IERC20(makeAddr("other-usd")), IEventsEngine(address(engine)), lens, guard, p);
        EngineLens otherLens = new EngineLens(makeAddr("other-engine"));
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.WrongLens.selector, address(otherLens)));
        new ParlayReserve(IERC20(address(usd)), IEventsEngine(address(engine)), IEngineLens(address(otherLens)), guard, p);
        FairValueGuard otherGuard = new FairValueGuard(IEngineLens(address(otherLens)), address(this), 120);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.WrongGuard.selector, address(otherGuard)));
        new ParlayReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, otherGuard, p);
    }
}
