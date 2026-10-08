// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeReserve.pricing.t.sol — on the real engine (A.6, D-018): the hub's
// opening print is the engine's recorded open, the hub-key asset proof is `setAssetTicker` against the Window's
// ticker, the mock's `setStatus`/`setExpiry` knobs are a Window not yet trading and one listed past the horizon, and
// the book knobs are a real maker's rested levels. Every price, stake and cap figure is Masayume's.

import {IRangeReserve} from "../../../src/products/range/IRangeReserve.sol";
import {RangeTestBase} from "../harness/RangeTestBase.sol";
import {RangeMath} from "../../../src/products/range/RangeMath.sol";
import {STATUS_LISTED, KIND_BUY_NO, KIND_BUY_YES} from "../../../src/engine/EngineTypes.sol";

/// @notice What an open charges and why it refuses: the engine's opening print, the asset's ticker, the book's
///         centre, the model's odds, and the reserve's caps.
contract RangeReservePricingTest is RangeTestBase {
    uint256 internal constant PAYOUT = 100 * ONE;
    IRangeReserve.Side internal constant INSIDE = IRangeReserve.Side.INSIDE;
    IRangeReserve.Side internal constant OUTSIDE = IRangeReserve.Side.OUTSIDE;

    function test_preview_isTheSharedVector() public view {
        (int256 low, int256 high) = band(30);
        (uint256 stake, uint256 probRaw, int256 openingPrint, IRangeReserve.Basis memory basis) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        assertEq(probRaw, 315_946, "P(inside +/-$30) at even odds, four minutes out");
        assertEq(stake, 35_385_952, "fair value plus 12%, rounded up");
        assertEq(openingPrint, P0);
        assertEq(basis.centerQE6, 500_000);
        assertEq(basis.sigmaE8, 6_200);
        assertEq(basis.tauSec, 240);
        (, uint256 outsideProb,,) = reserve.previewOpen(marketA, BTC, OUTSIDE, low, high, PAYOUT);
        assertEq(outsideProb + probRaw, ONE, "outside is the complement");
    }

    function test_open_chargesThePreviewEscrowsThePayoutAndKeepsNoAddress() public {
        (int256 low, int256 high) = band(30);
        (uint256 previewed,,,) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        uint256 before = usd.balanceOf(opener);
        bytes memory proof = spot();
        vm.record();
        vm.prank(opener);
        (uint256 id, uint256 stake) = reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, proof);
        (, bytes32[] memory writes) = vm.accesses(address(reserve));
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 v = vm.load(address(reserve), writes[i]);
            assertTrue(v != bytes32(uint256(uint160(address(engine)))) && v != bytes32(uint256(uint160(address(lens)))), "venue address persisted in reserve storage");
        }
        assertEq(id, 1);
        assertEq(stake, previewed);
        assertEq(usd.balanceOf(opener), before - stake);
        assertEq(reserve.liquid(), SUPPLY - (PAYOUT - stake), "the house fronted its part");
        assertEq(reserve.locked(), PAYOUT - stake);
        assertEq(reserve.lockedByExpiry(EXPIRY), PAYOUT - stake);
        assertBooksBalance();

        IRangeReserve.Round memory r = reserve.roundOf(id);
        assertEq(r.owner, opener);
        assertEq(r.marketId, marketA, "settles on the Window it was opened on");
        assertEq(r.openingPrint, P0);
        assertEq(r.lowPrint, low);
        assertEq(r.highPrint, high);
        assertEq(r.probRaw, 315_946);
        IRangeReserve.Basis memory b = reserve.basisOf(id);
        assertEq(b.spotE8, P0 * CENT_E8, "the verified spot is kept for audit");
        assertEq(b.driftE4, 0);
        assertEq(reserve.roundsOf(opener, 0, 10).length, 1);
    }

    function test_open_provesTheAssetThroughItsTicker() public {
        (int256 low, int256 high) = band(30);
        bytes memory proof = spot();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WrongAsset.selector, marketA, "ETH"));
        vm.prank(opener);
        reserve.openRange(marketA, "ETH", INSIDE, low, high, PAYOUT, type(uint256).max, proof);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoTicker.selector, "SOL"));
        reserve.previewOpen(marketA, "SOL", INSIDE, low, high, PAYOUT);
        openAs(opener, INSIDE, low, high, PAYOUT);
        // Unmapping the asset refuses later opens by name.
        reserve.setAssetTicker(BTC, 0);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoTicker.selector, BTC));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
    }

    function test_open_refusesAWindowWithoutAnOpeningPrint() public {
        (int256 low, int256 high) = band(30);
        // A Window of the same ticker's lane that has not printed its open (Masayume: the hub had no answer).
        bytes32 bare = list(START, uint40(EXPIRY), false);
        reserve.setAssetTicker("BARE", lens.marketRef(bare).ticker);
        reserve.setVolatility("BARE", 6_200);
        setBook(bare, 520_000, 540_000, 480_000, 460_000);
        rest();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoOpeningPrint.selector, bare));
        reserve.previewOpen(bare, "BARE", INSIDE, low, high, PAYOUT);
    }

    function test_open_refusesAnUnknownWindow() public {
        (int256 low, int256 high) = band(30);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.UnknownMarket.selector, bytes32(uint256(1))));
        reserve.previewOpen(bytes32(uint256(1)), BTC, INSIDE, low, high, PAYOUT);
    }

    function test_open_refusesLateFarBadBandAndNotTrading() public {
        (int256 low, int256 high) = band(30);
        vm.warp(EXPIRY - 30);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.TooLate.selector, marketA, EXPIRY));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        vm.warp(NOW);
        // Past the horizon: a 3-day Window of the same ticker (the mock's `setExpiry(NOW + 3 days)`).
        IRangeReserve.Params memory p = defaultParams();
        p.maxHorizonSec = 200;
        reserve.setParams(p);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.TooFar.selector, marketA, EXPIRY));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        reserve.setParams(defaultParams());
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.BadBand.selector, high, low));
        reserve.previewOpen(marketA, BTC, INSIDE, high, low, PAYOUT);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.BadBand.selector, int256(0), high));
        reserve.previewOpen(marketA, BTC, INSIDE, 0, high, PAYOUT);
        // Listed but not yet trading (the mock's `setStatus`).
        bytes32 later = list(uint40(EXPIRY), uint40(EXPIRY + 300), false);
        reserve.setAssetTicker("NEXT", lens.marketRef(later).ticker);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.MarketNotTrading.selector, later, STATUS_LISTED));
        reserve.previewOpen(later, "NEXT", INSIDE, low, high, PAYOUT);
    }

    function test_open_refusesThinWideAndDecidedBooks() public {
        (int256 low, int256 high) = band(30);
        clearSeeds(marketA);
        restOrder(marketA, KIND_BUY_NO, 520_000, 10 * ONE);
        restOrder(marketA, KIND_BUY_YES, 480_000, 300 * ONE);
        rest();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.ThinBook.selector, marketA, 10 * ONE, 20 * ONE));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);

        setBook(marketA, 800_000, 820_000, 200_000, 180_000);
        rest();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WideBook.selector, marketA, 600_000, 200_000));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);

        setBook(marketA, 990_000, 995_000, 980_000, 970_000);
        rest();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.WindowDecided.selector, marketA, 985_000));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
    }

    function test_theBookMovesTheCentre() public {
        // YES at 0.841 both sides (the grid's nearest to 0.8413): the market sits about one sigma above the open.
        // Placed 20 s before NOW (the book rests just in time) so τ stays Masayume's 240 s.
        vm.warp(NOW - 20);
        setBook(marketA, 842_000, 850_000, 841_000, 830_000);
        vm.warp(NOW);
        (uint256 stake, uint256 probRaw,, IRangeReserve.Basis memory basis) = reserve.previewOpen(marketA, BTC, INSIDE, P0, P0 + 6_000, PAYOUT);
        assertEq(basis.centerQE6, 841_500);
        assertEq(basis.tauSec, 240);
        // Masayume's shared vector at centre 841,345 is 267,625; the engine's tick grid moves the centre to 841,500.
        uint256 expected = RangeMath.bandProbE6(P0, P0, P0 + 6_000, 841_500, 6_200, 240);
        assertEq(probRaw, expected);
        assertApproxEqAbs(probRaw, 267_625, 500, "the shared vector, a tick away");
        assertEq(stake, RangeMath.floorStake(PAYOUT, probRaw, ONE, 1_200));
    }

    function test_open_refusesLongshotsAndNearCertainties() public {
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.LongShot.selector, uint256(39), uint256(20_000)));
        reserve.previewOpen(marketA, BTC, INSIDE, P0, P0 + 1, PAYOUT);
        (int256 low, int256 high) = band(4_000);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NearCertain.selector, uint256(1_000_000), uint256(970_000)));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.LongShot.selector, uint256(0), uint256(20_000)));
        reserve.previewOpen(marketA, BTC, OUTSIDE, low, high, PAYOUT);
        reserve.setVolatility(BTC, 0);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoVolatility.selector, BTC));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
    }

    function test_open_respectsTheCaps() public {
        (int256 low, int256 high) = band(30);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.OverPayoutCap.selector, 501 * ONE, 500 * ONE));
        reserve.previewOpen(marketA, BTC, INSIDE, low, high, 501 * ONE);

        (uint256 stake,,,) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        bytes memory proof = spot();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.StakeAboveMax.selector, stake, stake - 1));
        vm.prank(opener);
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, stake - 1, proof);

        // A 500 payout locks 323.07 of the house's part; the per-expiry cap is 400, so a 200 payout (129.23 more) trips it.
        openAs(opener, INSIDE, low, high, 500 * ONE);
        uint256 lockedNow = reserve.locked();
        assertEq(lockedNow, 323_070_240);
        (uint256 stake2,,,) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, 200 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.OverExpiryCap.selector, EXPIRY, lockedNow + 200 * ONE - stake2, 400 * ONE));
        vm.prank(opener);
        reserve.openRange(marketA, BTC, INSIDE, low, high, 200 * ONE, type(uint256).max, proof);

        // The 50% exposure cap holds across instants: with the per-expiry cap lifted, a 400 payout would pass 500 locked.
        IRangeReserve.Params memory p = defaultParams();
        p.maxExpiryLocked = 10_000 * ONE;
        reserve.setParams(p);
        (uint256 stakeB,,,) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, 400 * ONE);
        uint256 tv = reserve.totalValue();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.OverExposure.selector, lockedNow + 400 * ONE - stakeB, tv, uint16(5_000)));
        vm.prank(opener);
        reserve.openRange(marketA, BTC, INSIDE, low, high, 400 * ONE, type(uint256).max, proof);
    }

    function test_open_refusesWhenPausedOrIlliquid() public {
        (int256 low, int256 high) = band(30);
        bytes memory proof = spot();
        reserve.setPaused(true);
        vm.expectRevert(IRangeReserve.IsPaused.selector);
        vm.prank(opener);
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, proof);
        reserve.setPaused(false);
        uint256 houseShares = reserve.sharesOf(house);
        vm.prank(house);
        reserve.withdraw(houseShares);
        (uint256 stake,,,) = reserve.previewOpen(marketA, BTC, INSIDE, low, high, PAYOUT);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.InsufficientLiquidity.selector, PAYOUT - stake, 0));
        vm.prank(opener);
        reserve.openRange(marketA, BTC, INSIDE, low, high, PAYOUT, type(uint256).max, proof);
    }
}
