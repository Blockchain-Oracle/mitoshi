// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/LeverageReserve.open.t.sol — on the real engine (A.6, D-018): the mock's
// book is a real maker's rested levels; the pool's lot of 0.01 is the engine's 0.001 (DOWN sizes to 45.714, not 45.71);
// `setStatus(2)` is a Window not yet trading; the mock's taker fee has no engine equivalent (no fee exists, T10), so
// that refusal is proven against the `LyingEngine` in the seam suite (`EngineAccountingMismatch`). Every other figure is
// Masayume's.

import {ILeverageReserve} from "../../../src/products/leverage/ILeverageReserve.sol";
import {LeverageMath} from "../../../src/products/leverage/LeverageMath.sol";
import {LeverageTestBase} from "../harness/LeverageTestBase.sol";
import {STATUS_LISTED} from "../../../src/engine/EngineTypes.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {Policies} from "../../engine/harness/Policies.sol";

/// @notice The open: the size a stake affords off the live book, the terms behind the fill, the stake
///         charged exactly, and every refusal the reserve raises before money moves.
contract LeverageReserveOpenTest is LeverageTestBase {
    function test_sizeForStake_sizesOffTheBookAndPricesTheTerms() public view {
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, STAKE, TWO_X);
        // 10 at 2x deploys 19.20 (the 0.80 premium on the 10 fronted comes off the notional): 32 contracts at 0.60.
        assertEq(q.quantityRaw, 32 * ONE);
        assertEq(q.costRaw, 19_200_000);
        assertEq(q.filledRaw, 32 * ONE);
        assertEq(q.limitYesRaw, 600_000, "the worst ask touched, in YES terms");
        assertEq(q.priceRaw, 600_000);
        assertEq(q.stake, STAKE, "the stake is what was typed when the book fills it exactly");
        assertEq(q.fronted, 10 * ONE);
        assertEq(q.premium, 800_000);
        assertEq(q.winIfRight, 22 * ONE, "32 contracts pay 32; the reserve takes its 10 first");
    }

    function test_sizeForStake_DOWNBuysTheBidsInverted() public view {
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 1, STAKE, TWO_X);
        // NO costs 0.42 at the 0.58 bid: 19.20 / 0.42 = 45.714 contracts on the engine's 0.001 lot.
        assertEq(q.quantityRaw, 45_714_000);
        assertEq(q.limitYesRaw, 580_000, "the bid it takes, in the venue's YES terms");
        assertEq(q.priceRaw, 420_000);
        assertEq(q.costRaw, LeverageMath.ceilDiv(45_714_000 * 420_000, ONE));
        assertLe(q.stake, STAKE, "the lot floor can only make the stake smaller");
    }

    function test_open_chargesExactlyTheFillsTermsAndBooksTheFront() public {
        uint256 openerBefore = usd.balanceOf(opener);
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, STAKE, TWO_X);
        bytes memory proof = spot();
        vm.record();
        vm.prank(opener);
        (uint256 id, uint256 charged) = reserve.open(marketA, 0, STAKE, TWO_X, q.quantityRaw, proof);
        (, bytes32[] memory writes) = vm.accesses(address(reserve));
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 v = vm.load(address(reserve), writes[i]);
            assertTrue(v != bytes32(uint256(uint160(address(engine)))) && v != bytes32(uint256(uint160(address(lens)))), "engine address persisted (AD-10)");
        }
        assertEq(id, 1);
        assertEq(charged, STAKE);
        assertEq(usd.balanceOf(opener), openerBefore - STAKE, "the owner paid the stake and nothing else");

        ILeverageReserve.Position memory p = reserve.positionOf(id);
        assertEq(p.owner, opener);
        assertEq(uint8(p.status), uint8(ILeverageReserve.PositionStatus.LIVE));
        assertEq(p.quantityRaw, 32 * ONE);
        assertEq(p.stake, STAKE);
        assertEq(p.fronted, 10 * ONE);
        assertEq(p.premium, 800_000);
        assertEq(p.entryPriceRaw, 600_000);
        assertEq(p.expirySec, EXPIRY);
        assertEq(heldRaw(marketA, 0), 32 * ONE, "the reserve holds the contracts in its engine position");

        assertEq(reserve.liquid(), SUPPLY - 10 * ONE + 800_000, "the front left liquid, the premium joined it");
        assertEq(reserve.outstanding(), 10 * ONE);
        assertEq(reserve.frontedByMarket(marketA), 10 * ONE);
        assertEq(reserve.totalValue(), SUPPLY + 800_000, "total value counts the front at cost plus the premium");
        assertEq(reserve.openPositions().length, 1);
        assertBooksBalance();
        assertConserved();
    }

    function test_open_sizesAtExecutionAndRefundsTheLotsDust() public {
        // The quote saw 0.60; a better ask arrives before the send: the same stake buys more, the dust comes back.
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, STAKE, TWO_X);
        setBook(marketA, 590_000, 620_000, 580_000, 550_000);
        rest();
        uint256 before = usd.balanceOf(opener);
        (, uint256 charged) = openRaw(opener, marketA, 0, STAKE, TWO_X, q.quantityRaw);
        ILeverageReserve.Position memory p = reserve.positionOf(1);
        assertGt(p.quantityRaw, q.quantityRaw, "sized off the book at execution");
        assertLe(charged, STAKE, "never more than the stake");
        assertEq(usd.balanceOf(opener), before - charged, "the dust came back in the same call");
        assertEq(p.entryPriceRaw, 590_000);
        assertBooksBalance();
    }

    function test_open_refusesABookThatMovedPastTheGuard() public {
        // The quote saw 0.60 and 32 contracts; the ask moves to 0.66 before the send and the stake buys fewer.
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, STAKE, TWO_X);
        setBook(marketA, 660_000, 680_000, 580_000, 550_000);
        rest();
        spotE8 = 36_535_000_000; // the spot moved with the book (fair ≈ 0.63), so the fair-value ceiling holds
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BelowMinQuantity.selector, 29_090_000, q.quantityRaw));
        reserve.open(marketA, 0, STAKE, TWO_X, q.quantityRaw, proof);
        // With the guard lowered the open goes through at the new size, the stake unchanged.
        (, uint256 charged) = openRaw(opener, marketA, 0, STAKE, TWO_X, 29 * ONE);
        assertEq(reserve.positionOf(1).quantityRaw, 29_090_000);
        assertLe(charged, STAKE);
        assertBooksBalance();
    }

    function test_open_walksIntoTheSecondLevelForABigSize() public view {
        // 200 at 3x deploys 568: past the 300 contracts at 0.60 into the 0.62 level.
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, 200 * ONE, THREE_X);
        assertGt(q.quantityRaw, 300 * ONE);
        assertEq(q.limitYesRaw, 620_000);
        assertGt(q.priceRaw, 600_000);
        assertLt(q.priceRaw, 620_000);
    }

    function test_open_refusesAThinBook() public {
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.ThinBook.selector, marketA, 600 * ONE, 700 * ONE));
        reserve.previewOpen(marketA, 0, 700 * ONE, TWO_X);
        // A stake the whole book cannot absorb is sized to what rests; the guard says so.
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketA, 0, 400 * ONE, TWO_X);
        assertEq(q.quantityRaw, 600 * ONE, "capped at what rests");
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BelowMinQuantity.selector, 600 * ONE, 700 * ONE));
        reserve.open(marketA, 0, 400 * ONE, TWO_X, 700 * ONE, proof);
    }

    function test_open_refusesOutsideTheLeverageBounds() public {
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BadLeverage.selector, uint32(10_000), THREE_X));
        reserve.sizeForStake(marketA, 0, STAKE, 10_000);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BadLeverage.selector, uint32(40_000), THREE_X));
        reserve.previewOpen(marketA, 0, 32 * ONE, 40_000);
    }

    function test_open_refusesADecidedWindow() public {
        setBook(marketA, 970_000, 980_000, 960_000, 950_000);
        rest();
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.OutsideBand.selector, 970_000, 20_000, 950_000));
        reserve.previewOpen(marketA, 0, 20 * ONE, TWO_X);
    }

    function test_open_refusesABoostThatCannotBeatThePlainBet() public {
        // At 0.97 a 2x boost of 10 buys 19.79 contracts and collects 9.79 when right: a fee, not a product.
        ILeverageReserve.Params memory p = defaultParams();
        p.maxEntryPriceRaw = 990_000;
        reserve.setParams(p);
        setBook(marketA, 970_000, 980_000, 960_000, 950_000);
        rest();
        vm.expectPartialRevert(ILeverageReserve.Underpriced.selector);
        reserve.sizeForStake(marketA, 0, STAKE, TWO_X);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.Underpriced.selector);
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
    }

    function test_open_refusesTheLastSecondsOfAWindow() public {
        vm.warp(EXPIRY - 10);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.TooLate.selector, marketA, EXPIRY));
        reserve.previewOpen(marketA, 0, 32 * ONE, TWO_X);
    }

    function test_open_refusesAWindowThatIsNotTrading() public {
        bytes32 later = list(START + 600, START + 900, false);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.MarketNotTrading.selector, later, STATUS_LISTED));
        reserve.previewOpen(later, 0, 32 * ONE, TWO_X);
    }

    function test_open_refusesBelowTheVenuesMinimumAndUnknownMarkets() public {
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BelowMinQuantity.selector, 0, 1_000));
        reserve.sizeForStake(marketA, 0, 100, TWO_X);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.UnknownMarket.selector, bytes32(uint256(9))));
        reserve.previewOpen(bytes32(uint256(9)), 0, 32 * ONE, TWO_X);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.BadOutcome.selector, uint8(2)));
        reserve.previewOpen(marketA, 2, 32 * ONE, TWO_X);
    }

    function test_open_capsTheFrontPerPositionPerWindowAndInAggregate() public {
        // Per position: 3x on 150 fronts 300 > 200.
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.OverPositionCap.selector);
        reserve.open(marketA, 0, 150 * ONE, THREE_X, 0, proof);

        // Per Window: 400; two 2x opens of 190 front 380, a third would pass it.
        openFor(opener, marketA, 0, 190 * ONE, TWO_X);
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        rest();
        openFor(opener, marketA, 0, 190 * ONE, TWO_X);
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        rest();
        proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.OverWindowCap.selector);
        reserve.open(marketA, 0, 190 * ONE, TWO_X, 0, proof);

        // On a second Window the per-Window cap is fresh, so the exposure cap (50% of ~1,000) is what refuses.
        bytes32 marketB = list(START, START + 600, true);
        guard.setSpotSource(lens.marketRef(marketB).ticker, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        guard.setSigma(lens.marketRef(marketB).seriesId, SIGMA);
        setBook(marketB, 600_000, 620_000, 580_000, 550_000);
        rest();
        proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.OverExposure.selector);
        reserve.open(marketB, 0, 190 * ONE, TWO_X, 0, proof);
        assertBooksBalance();
    }

    function test_open_capsOpenPositions() public {
        ILeverageReserve.Params memory p = defaultParams();
        p.maxOpenPositions = 1;
        reserve.setParams(p);
        openFor(opener, marketA, 0, STAKE, TWO_X);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.TooManyOpen.selector, uint32(1), uint32(1)));
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
    }

    function test_open_needsLiquidToFrontAndToEscrow() public {
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        reserve.withdraw(shares);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectPartialRevert(ILeverageReserve.InsufficientLiquidity.selector);
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
    }

    function test_pause_stopsOpensAndSupplyOnly() public {
        reserve.setPaused(true);
        bytes memory proof = spot();
        vm.prank(opener);
        vm.expectRevert(ILeverageReserve.IsPaused.selector);
        reserve.open(marketA, 0, STAKE, TWO_X, 0, proof);
        vm.prank(house);
        vm.expectRevert(ILeverageReserve.IsPaused.selector);
        reserve.supply(ONE);
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        assertEq(reserve.withdraw(shares), SUPPLY, "withdrawals never pause");
    }

    function test_params_refuseNonsense() public {
        ILeverageReserve.Params memory p = defaultParams();
        p.maintenanceBps = 9_000;
        vm.expectRevert(ILeverageReserve.BadParams.selector);
        reserve.setParams(p);
        p = defaultParams();
        p.premiumBps = 10_000;
        vm.expectRevert(ILeverageReserve.BadParams.selector);
        reserve.setParams(p);
        p = defaultParams();
        p.fairSlackRaw = ONE + 1;
        vm.expectRevert(ILeverageReserve.BadParams.selector);
        reserve.setParams(p);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ILeverageReserve.NotAdmin.selector, stranger));
        reserve.setParams(defaultParams());
    }

    function test_positionsOf_pages() public {
        openFor(opener, marketA, 0, STAKE, TWO_X);
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        rest();
        openFor(opener, marketA, 1, STAKE, TWO_X);
        assertEq(reserve.positionCountOf(opener), 2);
        uint256[] memory page = reserve.positionsOf(opener, 1, 5);
        assertEq(page.length, 1);
        assertEq(page[0], 2);
        assertEq(reserve.positionsOf(opener, 2, 5).length, 0);
        assertEq(reserve.positionCountOf(stranger), 0);
    }
}
