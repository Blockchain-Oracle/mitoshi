// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {IRangeReserve} from "../../../src/products/range/IRangeReserve.sol";
import {RangeReserve} from "../../../src/products/range/RangeReserve.sol";
import {RangeMath} from "../../../src/products/range/RangeMath.sol";
import {PayoutCheck, Payouts} from "../../../src/products/shared/Payouts.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {RangeTestBase} from "../harness/RangeTestBase.sol";
import {PAIR_TICKS, KIND_BUY_NO} from "../../../src/engine/EngineTypes.sol";

/// The Tempo seam of the range reserve (A.4.7): the engine's verdict and `MustSettle`, the PD-2/D-119 drift bound on a
/// same-call signed spot, the grid-derived centre over rested depth, the cents seam of the band, P12 and construction.
contract RangeReserveSeamTest is RangeTestBase {
    uint256 internal constant PAYOUT = 100 * ONE;
    IRangeReserve.Side internal constant INSIDE = IRangeReserve.Side.INSIDE;
    IRangeReserve.Side internal constant OUTSIDE = IRangeReserve.Side.OUTSIDE;

    // ------------------------------------------------------------------ D-108 (Agari): a stale void never beats a verdict

    function test_mustSettle() public {
        (int256 low, int256 high) = band(30);
        (uint256 id,) = openAs(opener, INSIDE, low, high, PAYOUT);
        (uint256 id2, uint256 stake2) = openAs(opener, OUTSIDE, low, high, PAYOUT);
        closeAt(P0 + 5_000); // the engine answers: outside the band
        vm.warp(EXPIRY + 6 hours);
        // A losing INSIDE round's owner (or anyone) reaching for the refund is refused: it must be settled.
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.MustSettle.selector, id));
        reserve.voidStale(id);
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.LOST));
        reserve.settle(id2);
        assertEq(uint8(reserve.roundOf(id2).status), uint8(IRangeReserve.RoundStatus.WON));
        assertGt(PAYOUT, stake2);
        assertBooksBalance();
    }

    function test_mustSettle_aVoidedWindowRefundsThroughSettleNotTheStaleSweep() public {
        (int256 low, int256 high) = band(30);
        (uint256 id, uint256 stake) = openAs(opener, INSIDE, low, high, PAYOUT);
        voidWindow();
        vm.warp(EXPIRY + 6 hours);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.MustSettle.selector, id));
        reserve.voidStale(id);
        uint256 before = usd.balanceOf(opener);
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.VOID));
        assertEq(usd.balanceOf(opener), before + stake);
    }

    // ------------------------------------------------------------------ PD-2 / D-119: the centre against the spot

    function test_staleBasis_driftAbove2Sigma() public {
        (int256 low, int256 high) = band(30);
        // The book still says even odds (a quiet book), while the verified spot has run 0.3 % above the open: ≈ 3.1σ
        // over the 240 s left at BTC's σ. Every band priced around the book's centre would be knowably wrong.
        spotE8 = uint256(P0 * CENT_E8) * 1_003 / 1_000;
        int256 drift = reserve.previewDriftE4(marketA, BTC, int64(int256(spotE8)));
        assertLt(drift, -20_000);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.StaleBasis.selector, marketA, drift, uint32(20_000)));
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, proof);
        // Two-sided: the same run below the open is refused too.
        spotE8 = uint256(P0 * CENT_E8) * 997 / 1_000;
        proof = spot();
        int256 below = reserve.previewDriftE4(marketA, BTC, int64(int256(spotE8)));
        assertGt(below, 20_000);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.StaleBasis.selector, marketA, below, uint32(20_000)));
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, proof);
        // Inside 2σ (a 0.1 % move ≈ 1σ) the round opens and keeps the spot and drift it was checked on.
        spotE8 = uint256(P0 * CENT_E8) * 1_001 / 1_000;
        (uint256 id,) = openAs(opener, INSIDE, low, high, PAYOUT);
        IRangeReserve.Basis memory b = reserve.basisOf(id);
        assertEq(b.spotE8, int64(int256(spotE8)));
        assertEq(int256(b.driftE4), reserve.previewDriftE4(marketA, BTC, int64(int256(spotE8))));
        assertLt(b.driftE4, 0);
        assertGt(b.driftE4, -20_000);
    }

    /// When the book has followed the spot, the same 0.3 % run is no drift at all.
    function test_staleBasis_aBookThatFollowedTheSpotPrices() public {
        // Φ(3.12) ≈ 0.9991 is past the reserve's 97 % "decided" cap, so move the spot less: 0.15 % ≈ 1.56σ, Φ ≈ 0.94.
        spotE8 = uint256(P0 * CENT_E8) * 10_015 / 10_000;
        setBook(marketA, 941_000, 945_000, 939_000, 935_000);
        rest();
        int256 drift = reserve.previewDriftE4(marketA, BTC, int64(int256(spotE8)));
        assertLt(drift < 0 ? -drift : drift, 1_000, "the book and the spot agree to a tenth of a sigma");
        (int256 low, int256 high) = (P0, P0 + 20_000);
        (uint256 id,) = openAs(opener, INSIDE, low, high, PAYOUT);
        assertEq(id, 1);
    }

    function test_staleBasis_theProofIsVerifiedForTheWindowsOwnTicker() public {
        (int256 low, int256 high) = band(30);
        bytes memory old = PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp() - 121);
        vm.prank(opener);
        vm.expectRevert(E.SpotTooOld.selector);
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, old);
        bytes memory other = PrintSigner.five(bytes32("BTC"), spotE8, vm.getBlockTimestamp());
        vm.prank(opener);
        vm.expectRevert(E.FeedIdMismatch.selector);
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, other);
        guard.setSpotSource(tickerA, IPrintVerifier(address(0)), bytes32(0)); // a ticker the guard has no spot source for
        bytes memory fresh = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(FairValueGuard.NoSpotSource.selector, tickerA));
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, fresh);
        assertEq(reserve.roundCount(), 0, "nothing opened, nothing taken");
    }

    // ------------------------------------------------------------------ the centre: grid-derived, rested only

    function test_centerScale_derivesFromGrid() public {
        // A whole contract is PAIR_TICKS × tickBase raw (the engine's grid rule makes that `one`), so a YES mid of
        // 650 ticks is P = 0.650, i.e. 650,000 — Agari once restated the factor as 100 and read 65,000.
        (uint256 tickSize,,) = lens.grid(marketA);
        assertEq(uint256(PAIR_TICKS) * tickSize, ONE);
        uint16[4] memory asks = [uint16(501), 651, 32, 969];
        uint16[4] memory bids = [uint16(499), 649, 30, 967];
        for (uint256 i; i < 4; ++i) {
            setBook(marketA, uint256(asks[i]) * 1000, uint256(asks[i]) * 1000 + 1000, uint256(bids[i]) * 1000, uint256(bids[i]) * 1000 - 1000);
            rest();
            (, uint256 centerQE6,) = reserve.previewBasis(marketA, BTC);
            assertEq(centerQE6, (uint256(asks[i]) + bids[i]) * RangeMath.P_ONE / (2 * PAIR_TICKS), "mid ticks x (1e6 / PAIR_TICKS)");
        }
    }

    function test_center_readsRestedDepthOnly() public {
        // A fresh, far-off-centre ask placed just now does not move the centre until it has rested (D-109).
        restOrder(marketA, KIND_BUY_NO, 490_000, 400 * ONE);
        (, uint256 centerQE6,) = reserve.previewBasis(marketA, BTC);
        assertEq(centerQE6, 500_000);
        rest();
        (, centerQE6,) = reserve.previewBasis(marketA, BTC);
        assertEq(centerQE6, 485_000, "rested: the 0.49 ask is now the top");
    }

    // ------------------------------------------------------------------ the cents seam

    function test_bandInclusiveCentsAtSeam() public {
        (int256 low, int256 high) = band(30);
        (uint256 idIn,) = openAs(opener, INSIDE, low, high, PAYOUT);
        // The close's sub-cent remainder floors away: 999,999 e-8 above the top edge still reads as the top edge.
        closeAtE8(high * CENT_E8 + 999_999);
        reserve.settle(idIn);
        IRangeReserve.Round memory r = reserve.roundOf(idIn);
        assertEq(r.closingPrint, high);
        assertEq(uint8(r.status), uint8(IRangeReserve.RoundStatus.WON), "an edge in cents is inside");
    }

    function test_bandInclusiveCentsAtSeam_oneCentOverIsOutside() public {
        (int256 low, int256 high) = band(30);
        (uint256 idIn,) = openAs(opener, INSIDE, low, high, PAYOUT);
        closeAtE8((high + 1) * CENT_E8);
        reserve.settle(idIn);
        assertEq(uint8(reserve.roundOf(idIn).status), uint8(IRangeReserve.RoundStatus.LOST));
    }

    function test_bandInclusiveCentsAtSeam_lowEdge() public {
        (int256 low, int256 high) = band(30);
        (uint256 idOut,) = openAs(opener, OUTSIDE, low, high, PAYOUT);
        closeAtE8(low * CENT_E8); // exactly the low edge: inside, so OUTSIDE loses
        reserve.settle(idOut);
        assertEq(uint8(reserve.roundOf(idOut).status), uint8(IRangeReserve.RoundStatus.LOST));
        assertEq(reserve.roundOf(idOut).closingPrint, low);
    }

    function test_bandInclusiveCentsAtSeam_justUnderTheLowEdge() public {
        (int256 low, int256 high) = band(30);
        (uint256 idOut,) = openAs(opener, OUTSIDE, low, high, PAYOUT);
        closeAtE8(low * CENT_E8 - 1); // floors to one cent under: outside
        reserve.settle(idOut);
        assertEq(uint8(reserve.roundOf(idOut).status), uint8(IRangeReserve.RoundStatus.WON));
        assertEq(reserve.roundOf(idOut).closingPrint, low - 1);
    }

    // ------------------------------------------------------------------ Moonshot: a saturated band on the same reserve

    function test_moonshot_aSaturatedBandOpensAndPays() public {
        int256 strike = P0 + 10_000; // +$100
        (uint256 stake, uint256 probRaw,,) = reserve.previewOpen(marketA, BTC, INSIDE, strike, P0 * 4, 20 * ONE);
        assertGt(probRaw, 20_000);
        (uint256 id, uint256 paid) = openAs(opener, INSIDE, strike, P0 * 4, 20 * ONE);
        assertEq(paid, stake);
        closeAt(strike + 1);
        reserve.settle(id);
        uint256 before = usd.balanceOf(opener);
        reserve.claim(id);
        assertEq(usd.balanceOf(opener), before + 20 * ONE);
        assertBooksBalance();
    }

    // ------------------------------------------------------------------ P12: payouts to a blocking receiver are held

    function test_P12_aBlockedOwnersClaimAndRefundAreHeldAsOwed() public {
        (int256 low, int256 high) = band(30);
        (uint256 idWin,) = openAs(opener, INSIDE, low, high, PAYOUT);
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, opener);
        closeAt(P0);
        reserve.settle(idWin);
        uint256 before = usd.balanceOf(opener);
        vm.prank(stranger);
        reserve.claim(idWin);
        assertEq(usd.balanceOf(opener), before, "not pushed into the receive-policy guard");
        assertEq(reserve.owedOf(opener), PAYOUT);
        assertBooksBalance();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, opener));
        reserve.claimOwed();
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, opener);
        vm.prank(stranger);
        vm.expectRevert(Payouts.NothingOwed.selector);
        reserve.claimOwed();
        vm.prank(opener);
        assertEq(reserve.claimOwed(), PAYOUT);
        assertEq(reserve.totalOwedPayouts(), 0);
        assertBooksBalance();
    }

    function test_P12_aBlockedOwnersVoidRefundIsHeld() public {
        (int256 low, int256 high) = band(30);
        (uint256 id, uint256 stake) = openAs(opener, INSIDE, low, high, PAYOUT);
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, opener);
        voidWindow();
        reserve.settle(id);
        assertEq(reserve.owedOf(opener), stake);
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

    // ------------------------------------------------------------------ R4-5 (D-227): σ falls back to the guard's

    /// An asset with a ticker and no reserve σ (a stock) prices on the guard's σ for the Window's Series; a measured
    /// reserve σ, where set, still wins.
    function test_sigma_fallsBackToTheGuardsSeriesSigma() public {
        (int256 low, int256 high) = band(30);
        reserve.setVolatility(BTC, 0);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoVolatility.selector, BTC));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        guard.setSigma(lens.marketRef(marketA).seriesId, 9_000);
        (,,, IRangeReserve.Basis memory b) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        assertEq(b.sigmaE8, 9_000, "the guard's Series sigma");
        (,, uint64 shown) = reserve.previewBasis(marketA, BTC);
        assertEq(shown, 9_000);
        (uint256 id,) = openAs(opener, INSIDE, low, high, PAYOUT);
        assertEq(reserve.basisOf(id).sigmaE8, 9_000, "the round keeps the sigma it was priced on");
        reserve.setVolatility(BTC, 6_200);
        (,,, b) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        assertEq(b.sigmaE8, 6_200, "a measured reserve sigma wins");
    }

    // ------------------------------------------------------------------ construction: the venue is structural

    function test_constructor_checksCollateralLensGuardAndOptsOut() public {
        assertTrue(lens.crankOptedOut(address(reserve)), "D-015: no third-party redeem into the reserve");
        IRangeReserve.Params memory p = defaultParams();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WrongCollateral.selector, address(usd)));
        new RangeReserve(IERC20(makeAddr("other-usd")), IEventsEngine(address(engine)), lens, guard, p);
        EngineLens otherLens = new EngineLens(makeAddr("other-engine"));
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WrongLens.selector, address(otherLens)));
        new RangeReserve(IERC20(address(usd)), IEventsEngine(address(engine)), IEngineLens(address(otherLens)), guard, p);
        FairValueGuard otherGuard = new FairValueGuard(IEngineLens(address(otherLens)), address(this), 120);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WrongGuard.selector, address(otherGuard)));
        new RangeReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, otherGuard, p);
    }
}
