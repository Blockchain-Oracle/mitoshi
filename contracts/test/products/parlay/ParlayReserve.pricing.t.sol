// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ParlayReserve.pricing.t.sol — on the real engine (A.6, D-018): the mock
// book knobs are a real maker's rested PostOnly levels (`setBook` + `rest`, D-109); `setStatus(2)`/`setExpiry(NOW)` are
// a Window not yet trading and a Window past its `lockAt` (the lens derives status from the clock, so `LegExpired` is
// a defensive duplicate the engine never reaches); `openParlay` carries one signed spot per leg (PD-2). Every price,
// stake and cap figure is Masayume's.

import {IParlayReserve} from "../../../src/products/parlay/IParlayReserve.sol";
import {ParlayTestBase} from "../harness/ParlayTestBase.sol";
import {STATUS_LISTED, STATUS_LOCKED} from "../../../src/engine/EngineTypes.sol";

/// @notice The open: every leg priced off the venue's own book inside the transaction, the stake
///         floored on-chain, the whole payout escrowed, every cap enforced before money moves.
contract ParlayReservePricingTest is ParlayTestBase {
    function test_open_pricesLegsOffTheBookAndEscrowsTheWholePayout() public {
        uint256 maxPayout = 100 * ONE;
        (uint256 previewStake, uint256 combined, uint256[] memory prices,) = reserve.previewOpen(legs2(marketA, 0, marketB, 1), maxPayout);
        // UP on A costs the 0.60 ask; DOWN on B costs 1 − 0.58 = 0.42 (the top bid inverted); both fill inside one level.
        assertEq(prices[0], 600_000);
        assertEq(prices[1], 420_000);
        assertEq(combined, 252_000, "0.60 x 0.42");
        // floor = ceil(100 × 0.252) × 1.12 = 28.224
        assertEq(previewStake, 28_224_000);

        uint256 openerBefore = usd.balanceOf(opener);
        bytes[] memory proofs = spots(2);
        vm.record();
        vm.prank(opener);
        (uint256 id, uint256 stake) = reserve.openParlay(legs2(marketA, 0, marketB, 1), maxPayout, type(uint256).max, proofs);
        (, bytes32[] memory writes) = vm.accesses(address(reserve));
        assertNoVenueAddressInStorage(writes);

        assertEq(id, 1);
        assertEq(stake, previewStake, "the open charges exactly the preview");
        assertEq(usd.balanceOf(opener), openerBefore - stake);
        IParlayReserve.Parlay memory p = reserve.parlayOf(id);
        assertEq(p.owner, opener);
        assertEq(uint8(p.status), uint8(IParlayReserve.ParlayStatus.LIVE));
        assertEq(p.maxPayout, maxPayout);
        assertEq(p.houseLocked, maxPayout - stake);
        assertEq(p.combinedProbRaw, combined);
        assertEq(p.lastExpirySec, EXP_B);
        assertEq(reserve.locked(), maxPayout - stake);
        assertEq(reserve.liquid(), SUPPLY - (maxPayout - stake));
        assertEq(reserve.lockedByExpiry(EXP_A), maxPayout - stake);
        assertEq(reserve.lockedByExpiry(EXP_B), maxPayout - stake);
        IParlayReserve.Leg[] memory legs = reserve.legsOf(id);
        assertEq(legs[0].priceRaw, 600_000);
        assertEq(legs[1].priceRaw, 420_000);
        assertEq(legs[1].expirySec, EXP_B);
        assertBooksBalance();
        assertConserved();
    }

    function test_open_pricesOverTheDepthItMustHedge() public view {
        // A 400-contract payout walks past the 300 resting at 0.60 into the 0.62 level: (180 + 62) / 400 = 0.605.
        (,, uint256[] memory prices,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), 400 * ONE);
        assertEq(prices[0], 605_000);
        // A small payout is still priced over the floor depth (20 contracts), all at the top level.
        (,, uint256[] memory small,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), 5 * ONE);
        assertEq(small[0], 600_000);
    }

    function test_open_sameSettlementInstantIsSurcharged() public {
        // B and C settle at the same instant: the product 0.36 beats the floor 0.40 x 0.60 = 0.24, so it stands.
        (, uint256 combinedBC,,) = reserve.previewOpen(legs2(marketB, 0, marketC, 0), 100 * ONE);
        assertEq(combinedBC, 360_000);
        // At 0.15 a side the product is 0.0225 but the floor is 0.40 x 0.15 = 0.06: the floor wins.
        setBook(marketB, 150_000, 160_000, 140_000, 130_000);
        setBook(marketC, 150_000, 160_000, 140_000, 130_000);
        rest();
        (, uint256 floored,,) = reserve.previewOpen(legs2(marketB, 0, marketC, 0), 100 * ONE);
        assertEq(floored, 60_000, "lambda x min leg");
        // The same two prices on distinct instants keep the product.
        setBook(marketA, 150_000, 160_000, 140_000, 130_000);
        rest();
        (, uint256 product,,) = reserve.previewOpen(legs2(marketA, 0, marketB, 0), 100 * ONE);
        assertEq(product, 22_500);
    }

    function test_open_refusesLongShots() public {
        setBook(marketA, 100_000, 110_000, 90_000, 80_000);
        setBook(marketB, 100_000, 110_000, 90_000, 80_000);
        rest();
        // 0.10 × 0.10 = 1% < the 2% floor
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.LongShot.selector, 10_000, 20_000));
        openAs(opener, legs2(marketA, 0, marketB, 0), 100 * ONE);
    }

    function test_open_refusesAThinBook() public {
        // 20 contracts rest in total; a 100-contract payout cannot be priced over its own depth.
        clearSeeds(marketA);
        _rest(marketA, 2, 600_000, 20 * ONE); // a YES ask (BUY_NO) of 20
        _rest(marketA, 0, 580_000, 20 * ONE); // a YES bid of 20
        rest();
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.ThinBook.selector, marketA, 20 * ONE, 100 * ONE));
        openAs(opener, legs2(marketA, 0, marketB, 0), 100 * ONE);
        // An empty side is a thin book too.
        clearSeeds(marketA);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.ThinBook.selector, marketA, 0, 20 * ONE));
        openAs(opener, legs2(marketA, 0, marketB, 0), 10 * ONE);
    }

    function test_open_refusesLegsTheVenueWouldNotTake() public {
        // Listed but not yet trading (the mock's `setStatus`): the lens says LISTED.
        bytes32 later = list(START + 600, START + 900, false);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.MarketNotTrading.selector, later, STATUS_LISTED));
        openAs(opener, legs2(marketA, 0, later, 0), 100 * ONE);

        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.DuplicateMarket.selector, marketA));
        openAs(opener, legs2(marketA, 0, marketA, 1), 100 * ONE);

        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.UnknownMarket.selector, bytes32(uint256(0xdead))));
        openAs(opener, legs2(marketA, 0, bytes32(uint256(0xdead)), 0), 100 * ONE);

        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BadOutcome.selector, uint8(2)));
        openAs(opener, legs2(marketA, 2, marketB, 0), 100 * ONE);

        IParlayReserve.LegInput[] memory one = new IParlayReserve.LegInput[](1);
        one[0] = IParlayReserve.LegInput(marketA, 0);
        bytes[] memory proof = spots(1);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.BadLegCount.selector, 1));
        vm.prank(opener);
        reserve.openParlay(one, 100 * ONE, type(uint256).max, proof);

        // Past A's `lockAt` (the mock's `setExpiry(NOW)`): the Window no longer trades, so no known outcome is priced.
        vm.warp(EXP_A);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.MarketNotTrading.selector, marketA, STATUS_LOCKED));
        openAs(opener, legs2(marketA, 0, marketB, 0), 100 * ONE);
    }

    function test_open_refusesAStakeAboveTheOpenersGuard() public {
        bytes[] memory proofs = spots(2);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.StakeAboveMax.selector, 28_224_000, 28 * ONE));
        vm.prank(opener);
        reserve.openParlay(legs2(marketA, 0, marketB, 1), 100 * ONE, 28 * ONE, proofs);
    }

    function test_open_refusesWhenTheHouseWouldFrontNothing() public {
        // Two near-certain legs at 0.99: combined 0.9801 × 1.12 > 1, so the floor stake exceeds the payout.
        setBook(marketA, 990_000, 990_000, 980_000, 970_000);
        setBook(marketB, 990_000, 990_000, 980_000, 970_000);
        rest();
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.Underpriced.selector, 109_771_200, 100 * ONE));
        openAs(opener, legs2(marketA, 0, marketB, 0), 100 * ONE);
    }

    function test_open_capsPayoutExposureAndPerExpiryLiability() public {
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.OverPayoutCap.selector, 501 * ONE, 500 * ONE));
        openAs(opener, legs2(marketA, 0, marketB, 0), 501 * ONE);

        // A 500 payout is priced over 500 contracts (VWAP 0.608): stake 207.01, house 292.99 — inside both caps.
        (, uint256 stake1) = openAs(opener, legs2(marketA, 0, marketB, 0), 500 * ONE);
        uint256 house1 = 500 * ONE - stake1;
        assertEq(house1, 292_988_160);
        assertEq(reserve.locked(), house1);

        // A second identical ticket would lock 585.98 of a 1,000 reserve: over the 50% exposure cap.
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.OverExposure.selector, house1 * 2, SUPPLY, uint16(5_000)));
        openAs(opener, legs2(marketA, 0, marketB, 0), 500 * ONE);

        // Per-expiry: 200 more on B's instant passes exposure (412.35) but breaches the 400 sub-cap at B's instant.
        (uint256 stake2,,,) = reserve.previewOpen(legs2(marketB, 0, marketC, 0), 200 * ONE);
        uint256 house2 = 200 * ONE - stake2;
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.OverExpiryCap.selector, EXP_B, house1 + house2, 400 * ONE));
        openAs(opener, legs2(marketB, 0, marketC, 0), 200 * ONE);
    }

    function test_open_refusesMoreThanTheReserveHolds() public {
        uint256 shares = reserve.sharesOf(house);
        vm.prank(house);
        reserve.withdraw(shares - 10 * ONE);
        // 10 liquid cannot front the house's part of a 100 payout.
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.InsufficientLiquidity.selector, 100 * ONE - 28_224_000, 10 * ONE));
        openAs(opener, legs2(marketA, 0, marketB, 1), 100 * ONE);
    }

    function test_open_pausedRefusesOpensAndSupplyOnly() public {
        reserve.setPaused(true);
        vm.expectRevert(IParlayReserve.IsPaused.selector);
        openAs(opener, legs2(marketA, 0, marketB, 1), 100 * ONE);
        vm.prank(house);
        vm.expectRevert(IParlayReserve.IsPaused.selector);
        reserve.supply(ONE);
        // Withdrawals never pause.
        vm.prank(house);
        reserve.withdraw(ONE);
    }

    function test_admin_onlyAdminSetsParamsAndParamsAreChecked() public {
        IParlayReserve.Params memory p = defaultParams();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IParlayReserve.NotAdmin.selector, stranger));
        reserve.setParams(p);

        p.maxLegs = 1;
        vm.expectRevert(IParlayReserve.BadParams.selector);
        reserve.setParams(p);
        p.maxLegs = 4;
        p.correlationBps = 10_001;
        vm.expectRevert(IParlayReserve.BadParams.selector);
        reserve.setParams(p);
        p.correlationBps = 4_000;
        p.fairSlackRaw = ONE + 1; // PD-2: a slack past a whole contract is no bound at all
        vm.expectRevert(IParlayReserve.BadParams.selector);
        reserve.setParams(p);
        p.fairSlackRaw = 50_000;
        reserve.setParams(p);
        (,,, uint8 maxLegs,,,,,,) = reserve.params();
        assertEq(maxLegs, 4);

        vm.expectRevert(IParlayReserve.ZeroAddress.selector);
        reserve.setAdmin(address(0));
        reserve.setAdmin(stranger);
        assertEq(reserve.admin(), stranger);
    }
}
