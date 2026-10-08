// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/LeverageReserve.lifecycle.t.sol — on the real engine (A.6, D-018):
// `poolA.resolve/voidIt` → a real RedStone close + `settle`, or a missed close + `voidExpired`; `setBids` → a real
// maker's rested bids; every knock-out carries a signed spot the fair-value model agrees with (PD-2). Two tests change
// with Agari's D-114, recorded in F-S10-11: a knock-out on a book too thin to take the whole position now refuses
// (`ThinBook`) instead of selling what it can, and the pool's "refund as credit" knob is the engine's `sweep` (the real
// engine never leaves the reserve a credit: IOC + `withdrawProceeds`). Every money figure is Masayume's.

import {ILeverageReserve} from "../../../src/products/leverage/ILeverageReserve.sol";
import {LeverageTestBase} from "../harness/LeverageTestBase.sol";

/// @notice Every way a position leaves: settlement on the engine's verdict, the owner's cash-out, the knock-out anyone
///         may trigger at the maintenance line, and the supplier accounting around all of it.
contract LeverageReserveLifecycleTest is LeverageTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        (id,) = openFor(opener, marketA, 0, STAKE, TWO_X);
    }

    function test_settle_aWinPaysTheOwnerTheContractsLessTheFront() public {
        resolve(marketA, 0);
        uint256 ownerBefore = usd.balanceOf(opener);
        vm.prank(stranger);
        (uint256 payout, uint256 reclaimed, uint256 returned) = reserve.settle(id);
        assertEq(payout, 32 * ONE);
        assertEq(reclaimed, 10 * ONE);
        assertEq(returned, 22 * ONE);
        assertEq(usd.balanceOf(opener), ownerBefore + 22 * ONE, "the owner is paid, whoever cranked");
        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertEq(uint8(p.status), uint8(ILeverageReserve.PositionStatus.SETTLED));
        assertEq(p.quantityRaw, 0);
        assertEq(p.fronted, 0);
        assertEq(p.returned, 22 * ONE);
        assertEq(reserve.liquid(), SUPPLY + 800_000, "the front is back and the premium stays");
        assertEq(reserve.outstanding(), 0);
        assertEq(reserve.openPositions().length, 0);
        assertEq(heldRaw(marketA, 0), 0, "nothing left in the engine");
        assertBooksBalance();
        assertConserved();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.NotLive.selector, id, ILeverageReserve.PositionStatus.SETTLED));
        reserve.settle(id);
    }

    function test_settle_aLossCostsTheOwnerTheStakeAndTheReserveTheFront() public {
        resolve(marketA, 1);
        uint256 ownerBefore = usd.balanceOf(opener);
        (uint256 payout,, uint256 returned) = reserve.settle(id);
        assertEq(payout, 0);
        assertEq(returned, 0);
        assertEq(usd.balanceOf(opener), ownerBefore, "nothing more leaves the owner");
        assertEq(reserve.liquid(), SUPPLY - 10 * ONE + 800_000, "the reserve lost its front, kept the premium");
        assertEq(reserve.totalValue(), SUPPLY - 10 * ONE + 800_000);
        assertEq(reserve.outstanding(), 0);
        assertBooksBalance();
        // Suppliers carry it.
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        assertEq(reserve.withdraw(shares), SUPPLY - 10 * ONE + 800_000);
    }

    function test_settle_aVoidPaysHalfAContract() public {
        resolve(marketA, 2);
        (uint256 payout, uint256 reclaimed, uint256 returned) = reserve.settle(id);
        assertEq(payout, 16 * ONE);
        assertEq(reclaimed, 10 * ONE);
        assertEq(returned, 6 * ONE);
        assertBooksBalance();
    }

    function test_settle_refusesAnUnsettledWindow() public {
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.MarketNotSettled.selector, marketA));
        reserve.settle(id);
    }

    function test_close_theOwnerCashesOutAtTheBids() public {
        // 32 sold at the 0.58 bid: 18.56; the reserve takes 10; 8.56 back — the spread and the premium lost.
        uint256 ownerBefore = usd.balanceOf(opener);
        vm.prank(opener);
        (uint256 proceeds, uint256 returned) = reserve.close(id, 18 * ONE);
        assertEq(proceeds, 18_560_000);
        assertEq(returned, 8_560_000);
        assertEq(usd.balanceOf(opener), ownerBefore + 8_560_000);
        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertEq(uint8(p.status), uint8(ILeverageReserve.PositionStatus.CLOSED));
        assertEq(reserve.liquid(), SUPPLY + 800_000);
        assertEq(heldRaw(marketA, 0), 0);
        assertBooksBalance();
        assertConserved();
    }

    function test_close_isTheOwnersAndGuardsSlippage() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.NotOwner.selector, id, stranger));
        reserve.close(id, 0);
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.Slippage.selector, 18_560_000, 19 * ONE));
        reserve.close(id, 19 * ONE);
    }

    function test_knockOut_refusesWhileTheMarkHoldsAboveTheLine() public {
        // Line: 10 x 1.2 = 12. At the 0.58 bid 32 contracts mark 18.56.
        (uint256 mark,, uint256 line, bool knockable) = reserve.markOf(id);
        assertEq(mark, 18_559_999, "a unit under the ceiling-rounded walk");
        assertEq(line, 12 * ONE);
        assertFalse(knockable);
        bytes memory proof = crashSpot();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.StillHealthy.selector, id, 18_559_999, 12 * ONE));
        reserve.knockOut(id, proof);
        // Just above the line still holds.
        setBids(marketA, 380_000, 300 * ONE);
        rest();
        (,,, knockable) = reserve.markOf(id);
        assertFalse(knockable, "12.16 is above 12");
    }

    function test_knockOut_atTheLineRepaysTheReserveFirstAndTheOwnerTheRest() public {
        setBids(marketA, 350_000, 300 * ONE);
        rest();
        (uint256 mark,,, bool knockable) = reserve.markOf(id);
        assertEq(mark, 11_199_999);
        assertTrue(knockable);
        uint256 ownerBefore = usd.balanceOf(opener);
        uint256 strangerBefore = usd.balanceOf(stranger);
        bytes memory proof = crashSpot();
        vm.prank(stranger);
        (uint256 proceeds, uint256 reclaimed, uint256 returned) = reserve.knockOut(id, proof);
        assertEq(proceeds, 11_200_000);
        assertEq(reclaimed, 10 * ONE);
        assertEq(returned, 1_200_000);
        assertEq(usd.balanceOf(opener), ownerBefore + 1_200_000, "what the line left is the owner's");
        assertEq(usd.balanceOf(stranger), strangerBefore, "the cranker gets nothing");
        assertEq(uint8(reserve.positionOf(id).status), uint8(ILeverageReserve.PositionStatus.KNOCKED_OUT));
        assertEq(reserve.liquid(), SUPPLY + 800_000, "the reserve is whole");
        assertBooksBalance();
        assertConserved();
    }

    function test_knockOut_onAGappedBookBooksTheShortfallAsTheReservesLoss() public {
        setBids(marketA, 250_000, 300 * ONE);
        rest();
        (uint256 proceeds, uint256 reclaimed, uint256 returned) = reserve.knockOut(id, crashSpot());
        assertEq(proceeds, 8 * ONE);
        assertEq(reclaimed, 8 * ONE);
        assertEq(returned, 0);
        assertEq(reserve.liquid(), SUPPLY - 2 * ONE + 800_000, "2 of the 10 fronted did not come back");
        assertEq(reserve.outstanding(), 0, "the whole claim is released, recovered or not");
        assertEq(reserve.frontedByMarket(marketA), 0);
        assertBooksBalance();
    }

    /// D-114 (Agari): Masayume sold what a thin book would take and left the rest live; a knock-out is now judged on the
    /// whole position over rested depth, so a thinned book refuses and the position rides to settlement.
    function test_knockOut_onAThinBookRefusesAndSettlementFinishesIt() public {
        setBids(marketA, 300_000, 20 * ONE);
        rest();
        bytes memory proof = crashSpot();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.ThinBook.selector, marketA, 20 * ONE, 32 * ONE));
        reserve.knockOut(id, proof);
        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertEq(uint8(p.status), uint8(ILeverageReserve.PositionStatus.LIVE));
        assertEq(p.quantityRaw, 32 * ONE);
        assertEq(p.fronted, 10 * ONE);
        (,,, bool knockable) = reserve.markOf(id);
        assertFalse(knockable, "the view agrees: not the whole size");
        resolve(marketA, 0);
        (uint256 payout, uint256 reclaimed, uint256 returned) = reserve.settle(id);
        assertEq(payout, 32 * ONE);
        assertEq(reclaimed, 10 * ONE);
        assertEq(returned, 22 * ONE);
        assertEq(reserve.liquid(), SUPPLY + 800_000);
        assertBooksBalance();
    }

    function test_withdraw_isRefusedWhileAnExpiredPositionIsUnsettled() public {
        vm.warp(EXPIRY + 1);
        assertEq(reserve.unsettledExpired(), id);
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.UnsettledPosition.selector, id));
        reserve.withdraw(shares);
        resolve(marketA, 0);
        reserve.settle(id);
        assertEq(reserve.unsettledExpired(), 0);
        vm.prank(house);
        assertEq(reserve.withdraw(shares), SUPPLY + 800_000, "the premium is the suppliers' once the position is out");
    }

    function test_withdraw_drawsOnIdleCapitalOnly() public {
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        vm.expectPartialRevert(ILeverageReserve.InsufficientLiquidity.selector);
        reserve.withdraw(shares);
        // Half the shares fit inside liquid.
        vm.prank(house);
        uint256 out = reserve.withdraw(shares / 2);
        assertEq(out, (SUPPLY + 800_000) / 2);
        assertBooksBalance();
    }

    function test_sharePrice_countsTheFrontAtCostAndThePremiumAsIncome() public {
        // A second supplier joins after the open: shares priced on liquid + outstanding.
        usd.mint(stranger, 1_000 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(reserve), type(uint256).max);
        uint256 shares = reserve.supply(1_000 * ONE);
        vm.stopPrank();
        assertLt(shares, 1_000 * ONE, "the pot is worth more than par after the premium");
        assertEq(shares, 1_000 * ONE * SUPPLY / (SUPPLY + 800_000));
    }

    /// The pool's "refund as credit" knob is the engine's credit, which a taker never accrues (IOC, `withdrawProceeds`):
    /// the sweep finds nothing on the real engine and the books balance through an open and a close of a DOWN boost.
    function test_refundsLandingAsCreditAreCollectedInTheSameCall() public {
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        rest();
        openFor(opener, marketA, 1, STAKE, TWO_X);
        assertBooksBalance();
        vm.prank(opener);
        reserve.close(2, 0);
        assertBooksBalance();
        assertEq(reserve.sweep(marketA), 0, "no credit left on the engine");
        assertEq(lens.creditOf(marketA, address(reserve)), 0);
    }

    function test_positionViews_refuseWhatDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.NoSuchPosition.selector, 9));
        reserve.positionOf(9);
        bytes memory proof = spot();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.NoSuchPosition.selector, 0));
        reserve.knockOut(0, proof);
    }
}
