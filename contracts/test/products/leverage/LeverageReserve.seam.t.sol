// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {FairValue} from "../../../src/fair/FairValue.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {ILeverageReserve} from "../../../src/products/leverage/ILeverageReserve.sol";
import {LeverageReserve} from "../../../src/products/leverage/LeverageReserve.sol";
import {EngineSeam} from "../../../src/products/shared/EngineSeam.sol";
import {PayoutCheck} from "../../../src/products/shared/Payouts.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {LyingEngine} from "../harness/LyingEngine.sol";
import {LeverageTestBase} from "../harness/LeverageTestBase.sol";
import {KIND_BUY_NO, KIND_BUY_YES} from "../../../src/engine/EngineTypes.sol";

/// The Tempo seam of the leverage reserve (A.4.3): Agari's D-114 (healthy and sellable at birth, knock-out over rested
/// depth, pay-or-owe exits, the engine's report checked against the money) and D-116 (a void must repay the front),
/// the PD-2 fair-value ceiling on entry and second test on the knock-out, and construction.
contract LeverageReserveSeamTest is LeverageTestBase {
    // ------------------------------------------------------------------ D-114: healthy and sellable at birth

    function test_D114_aPositionBornUnderTheLineIsRefused() public {
        // Asks at 0.60 but the rested bids sit at 0.30: 32 contracts would mark 9.60 against a 12 line on the spot.
        clearSeeds(marketA);
        restOrder(marketA, KIND_BUY_NO, 600_000, LEVEL);
        restOrder(marketA, KIND_BUY_YES, 300_000, LEVEL);
        rest();
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.UnhealthyAtEntry.selector, 9_599_999, 12 * ONE));
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
        assertEq(reserve.positionCount(), 0);
    }

    function test_D114_aPositionTheRestedBookCannotTakeWholeIsRefused() public {
        clearSeeds(marketA);
        restOrder(marketA, KIND_BUY_NO, 600_000, LEVEL);
        restOrder(marketA, KIND_BUY_YES, 580_000, 20 * ONE);
        rest();
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.ThinBook.selector, marketA, 20 * ONE, 32 * ONE));
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
    }

    function test_D114_freshBidsDoNotMakeAPositionSellable() public {
        // Everything placed just now: the entry may take fresh asks, but the exit walk counts only rested bids.
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.ThinBook.selector, marketA, 0, 32 * ONE));
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
    }

    // ------------------------------------------------------------------ D-114: the knock-out, over rested depth

    function test_D114_aFreshLowballBidCannotKnockOut() public {
        (uint256 id,) = openFor(opener, marketA, 0, STAKE, TWO_X);
        // The maker pulls its bids and posts one lowball bid: until it rests there is no rested depth to judge on.
        setBids(marketA, 300_000, 300 * ONE);
        bytes memory proof = crashSpot();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.ThinBook.selector, marketA, 0, 32 * ONE));
        reserve.knockOut(id, proof);
        rest();
        (uint256 proceeds,,) = reserve.knockOut(id, crashSpot());
        assertEq(proceeds, 9_600_000, "sold into the rested bid at its limit");
        assertBooksBalance();
        assertConserved();
    }

    function test_D114_exitsNeverWaitOnTheOwnersReceivePolicy() public {
        (uint256 id,) = openFor(opener, marketA, 0, STAKE, TWO_X);
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, opener);
        setBids(marketA, 350_000, 300 * ONE);
        rest();
        uint256 before = usd.balanceOf(opener);
        vm.prank(stranger);
        (,, uint256 returned) = reserve.knockOut(id, crashSpot());
        assertEq(returned, 1_200_000);
        assertEq(usd.balanceOf(opener), before, "held, not pushed into the receive-policy guard");
        assertEq(reserve.owedOf(opener), 1_200_000);
        assertEq(uint8(reserve.positionOf(id).status), uint8(ILeverageReserve.PositionStatus.KNOCKED_OUT), "the exit happened anyway");
        assertBooksBalance();
        vm.prank(opener);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, opener);
        vm.prank(opener);
        assertEq(reserve.claimOwed(), 1_200_000);
        assertEq(usd.balanceOf(opener), before + 1_200_000);
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

    // ------------------------------------------------------------------ D-116: a void must repay the front

    function test_D116_threeXAbove71CentsWouldShortAVoid() public {
        setBook(marketA, 750_000, 760_000, 740_000, 730_000);
        rest();
        spotE8 = 36_560_000_000; // a spot the 0.75 book agrees with, so only the void bound decides
        // At 3x an 8% premium fronts 0.75 × 2 / 2.84 ≈ 0.528 a contract; a void returns 0.50.
        vm.expectPartialRevert(ILeverageReserve.VoidWouldShort.selector);
        reserve.sizeForStake(marketA, 0, STAKE, THREE_X);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.VoidWouldShort.selector);
        reserve.open(marketA, 0, STAKE, THREE_X, 0, proof);
        // 2x fronts 0.75 / 1.92 ≈ 0.39: under the half a void pays, so it opens — and a void repays the front.
        (uint256 id,) = openFor(opener, marketA, 0, STAKE, TWO_X);
        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertLe(p.fronted * 10_000_000, p.quantityRaw * 5_000_000);
        resolve(marketA, 2);
        (uint256 payout, uint256 reclaimed,) = reserve.settle(id);
        assertGe(payout, p.fronted);
        assertEq(reclaimed, p.fronted, "a void never costs the suppliers the front");
    }

    function test_D116_threeXAtSixtyCentsIsCovered() public view {
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, STAKE, THREE_X);
        assertLe(q.fronted * 10_000_000, q.quantityRaw * 5_000_000, "0.60 x 2 / 2.84 = 0.4225 < 0.50");
    }

    // ------------------------------------------------------------------ PD-2: the fair-value model, both ways

    function test_PD2_anEntryAboveTheModelIsRefused() public {
        // The spot has crashed (fair P(Up) ≈ 0.03) while stale asks still sell UP at 0.60.
        uint256 fair = guard.previewFairUpE6(marketA, int64(int256(CRASH_SPOT_E8)));
        bytes memory proof = crashSpot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.AboveFairValue.selector, marketA, 600_000, fair));
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
        // DOWN is cheap against the same model (0.42 vs ≈ 0.97): a ceiling, not a band.
        vm.prank(opener);
        (uint256 id,) = reserve.open(marketA, 1, STAKE, TWO_X, 0, proof);
        assertEq(id, 1);
    }

    function test_PD2_aKnockOutTheModelSaysIsHealthyIsRefused() public {
        (uint256 id,) = openFor(opener, marketA, 0, STAKE, TWO_X);
        // Lowball bids rest at 0.35 (the book says knock out) while the verified spot still prices UP near 0.59.
        setBids(marketA, 350_000, 300 * ONE);
        rest();
        uint256 up = guard.previewFairUpE6(marketA, int64(int256(BOOK_SPOT_E8)));
        uint256 fairMark = FairValue.sideProbE6(up, 0) * ONE / FairValue.P_ONE * (32 * ONE) / ONE;
        (uint256 viewMark, bool viewKnockable) = reserve.fairMarkOf(id, int64(int256(BOOK_SPOT_E8)));
        assertEq(viewMark, fairMark);
        assertFalse(viewKnockable);
        bytes memory proof = spot();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.FairValueHealthy.selector, id, fairMark, 12 * ONE));
        reserve.knockOut(id, proof);
        // Once the spot agrees with the book, anyone may knock it out.
        reserve.knockOut(id, crashSpot());
        assertEq(uint8(reserve.positionOf(id).status), uint8(ILeverageReserve.PositionStatus.KNOCKED_OUT));
    }

    function test_PD2_theProofMustBeFreshAndForTheWindowsFeed() public {
        bytes memory old = PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp() - 121);
        vm.prank(opener);
        vm.expectRevert(E.SpotTooOld.selector);
        reserve.open(marketA, 0, STAKE, TWO_X, 0, old);
        bytes memory other = PrintSigner.five(bytes32("BTC"), spotE8, vm.getBlockTimestamp());
        vm.prank(opener);
        vm.expectRevert(E.FeedIdMismatch.selector);
        reserve.open(marketA, 0, STAKE, TWO_X, 0, other);
        assertEq(reserve.positionCount(), 0);
    }

    // ------------------------------------------------------------------ D-114: the engine's report against the money

    function _lying() internal returns (LyingEngine lying, LeverageReserve r) {
        lying = new LyingEngine(IERC20(address(usd)));
        FairValueGuard g = new FairValueGuard(IEngineLens(address(lying)), address(this), 120);
        g.setSpotSource(1, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        g.setSigma(keccak256("lying-series"), SIGMA);
        r = new LeverageReserve(IERC20(address(usd)), IEventsEngine(address(lying)), IEngineLens(address(lying)), g, defaultParams());
        usd.mint(address(lying), 1_000_000 * ONE);
        vm.startPrank(house);
        usd.approve(address(r), type(uint256).max);
        r.supply(SUPPLY);
        vm.stopPrank();
        vm.prank(opener);
        usd.approve(address(r), type(uint256).max);
    }

    function _openOn(LeverageReserve r) internal returns (uint256 id) {
        bytes memory proof = PrintSigner.five(Policies.TSLA, 365e8, vm.getBlockTimestamp());
        vm.prank(opener);
        (id,) = r.open(bytes32("w"), 0, STAKE, TWO_X, 0, proof);
    }

    function test_D114_everyBuyIsMeasured() public {
        LyingEngine.Lie[5] memory lies =
            [LyingEngine.Lie.PhantomFill, LyingEngine.Lie.OverPull, LyingEngine.Lie.Rested, LyingEngine.Lie.WithdrawOnBuy, LyingEngine.Lie.CreditDrift];
        for (uint256 i; i < lies.length; ++i) {
            (LyingEngine lying, LeverageReserve r) = _lying();
            lying.setLie(lies[i]);
            bytes memory proof = PrintSigner.five(Policies.TSLA, 365e8, vm.getBlockTimestamp());
            vm.prank(opener);
            vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
            r.open(bytes32("w"), 0, STAKE, TWO_X, 0, proof);
        }
        // An honest engine opens: the lens's one-level book, the guard's model at even odds.
        (, LeverageReserve honest) = _lying();
        assertEq(_openOn(honest), 1);
    }

    function test_D114_everySaleAndRedemptionIsMeasured() public {
        (LyingEngine lying, LeverageReserve r) = _lying();
        uint256 id = _openOn(r);
        lying.setLie(LyingEngine.Lie.ShortPay);
        vm.prank(opener);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        r.close(id, 0);
        lying.setLie(LyingEngine.Lie.RedeemShort);
        lying.setStatus(4);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        r.settle(id);
        lying.setLie(LyingEngine.Lie.None);
        (uint256 payout,,) = r.settle(id);
        assertGt(payout, 0);
    }

    // ------------------------------------------------------------------ construction: the venue is structural

    function test_constructor_checksCollateralLensGuardApprovesAndOptsOut() public {
        assertTrue(lens.crankOptedOut(address(reserve)), "D-015");
        assertEq(usd.allowance(address(reserve), address(engine)), type(uint256).max, "approved once");
        ILeverageReserve.Params memory p = defaultParams();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.WrongCollateral.selector, address(usd)));
        new LeverageReserve(IERC20(makeAddr("other-usd")), IEventsEngine(address(engine)), lens, guard, p);
        EngineLens otherLens = new EngineLens(makeAddr("other-engine"));
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.WrongLens.selector, address(otherLens)));
        new LeverageReserve(IERC20(address(usd)), IEventsEngine(address(engine)), IEngineLens(address(otherLens)), guard, p);
        FairValueGuard otherGuard = new FairValueGuard(IEngineLens(address(otherLens)), address(this), 120);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.WrongGuard.selector, address(otherGuard)));
        new LeverageReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, otherGuard, p);
    }
}
