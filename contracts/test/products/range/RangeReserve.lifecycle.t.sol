// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeReserve.lifecycle.t.sol — on the real engine (A.6, D-018):
// `hub.setAnswer(Q_CLOSE, x, false)` → a real RedStone close at x cents + `settle`; `setAnswer(…, true)` → a missed
// close + permissionless `voidExpired`. The mock's "answer, then clear it" in the stale-void test has no engine
// equivalent (a verdict is final), so it splits into the grace test here and `test_mustSettle` in the seam suite.

import {IRangeReserve} from "../../../src/products/range/IRangeReserve.sol";
import {RangeTestBase} from "../harness/RangeTestBase.sol";

/// @notice Settlement on the engine's verdict, the claim that pays the owner and nobody else, the void that
///         refunds, the stale void, and the supplier accounting around all of it.
contract RangeReserveLifecycleTest is RangeTestBase {
    uint256 internal constant PAYOUT = 100 * ONE;
    uint256 internal id;
    uint256 internal stake;
    int256 internal low;
    int256 internal high;

    function setUp() public override {
        super.setUp();
        (low, high) = band(30);
        (id, stake) = openAs(opener, IRangeReserve.Side.INSIDE, low, high, PAYOUT);
    }

    function test_settle_waitsOnTheEngine() public {
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotSettled.selector, id));
        reserve.settle(id);
        (,, bool answered) = reserve.answerOf(marketA);
        assertFalse(answered);
        vm.warp(EXPIRY + 60); // past expiry but no close recorded yet: still no answer
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotSettled.selector, id));
        reserve.settle(id);
    }

    function test_settle_insideWinsAndClaimPaysTheOwnerWhoeverCalls() public {
        closeAt(P0 + 1_000);
        vm.prank(stranger);
        reserve.settle(id);
        IRangeReserve.Round memory r = reserve.roundOf(id);
        assertEq(uint8(r.status), uint8(IRangeReserve.RoundStatus.WON));
        assertEq(r.closingPrint, P0 + 1_000);
        assertEq(r.settledAtSec, EXPIRY);
        assertEq(reserve.locked(), r.houseLocked, "liability stays until the payout leaves");
        assertBooksBalance();

        uint256 ownerBefore = usd.balanceOf(opener);
        uint256 strangerBefore = usd.balanceOf(stranger);
        vm.prank(stranger);
        uint256 paid = reserve.claim(id);
        assertEq(paid, PAYOUT);
        assertEq(usd.balanceOf(opener), ownerBefore + PAYOUT, "the owner is paid");
        assertEq(usd.balanceOf(stranger), strangerBefore, "the caller gets nothing");
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.CLAIMED));
        assertEq(reserve.locked(), 0);
        assertEq(reserve.lockedByExpiry(EXPIRY), 0);
        assertEq(reserve.liquid(), SUPPLY - (PAYOUT - stake), "the house paid its part");
        assertBooksBalance();

        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotWon.selector, id, IRangeReserve.RoundStatus.CLAIMED));
        reserve.claim(id);
    }

    function test_settle_outsideThePrintLosesAndKeepsTheStake() public {
        closeAt(P0 + 5_000);
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.LOST));
        assertEq(reserve.liquid(), SUPPLY + stake, "the stake is the suppliers'");
        assertEq(reserve.locked(), 0);
        assertBooksBalance();
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotWon.selector, id, IRangeReserve.RoundStatus.LOST));
        reserve.claim(id);
        // Idempotent: settling again changes nothing.
        reserve.settle(id);
        assertEq(reserve.liquid(), SUPPLY + stake);
    }

    function test_settle_theBandIsInclusive() public {
        (uint256 id2,) = openAs(opener, IRangeReserve.Side.OUTSIDE, low, high, PAYOUT);
        closeAt(high);
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.WON), "the top edge is inside");
        reserve.settle(id2);
        assertEq(uint8(reserve.roundOf(id2).status), uint8(IRangeReserve.RoundStatus.LOST), "so OUTSIDE loses on it");
    }

    function test_settle_outsideSideWinsWhenThePrintLeavesTheBand() public {
        (uint256 id2, uint256 stake2) = openAs(opener, IRangeReserve.Side.OUTSIDE, low, high, PAYOUT);
        closeAt(P0 - 9_000);
        reserve.settle(id2);
        assertEq(uint8(reserve.roundOf(id2).status), uint8(IRangeReserve.RoundStatus.WON));
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.LOST));
        reserve.claim(id2);
        assertEq(reserve.liquid(), SUPPLY + stake - (PAYOUT - stake2));
        assertBooksBalance();
    }

    function test_settle_aVoidedWindowRefundsTheOwner() public {
        voidWindow();
        uint256 before = usd.balanceOf(opener);
        vm.prank(stranger);
        reserve.settle(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.VOID));
        assertEq(usd.balanceOf(opener), before + stake, "the stake goes home");
        assertEq(reserve.liquid(), SUPPLY, "the house's part is back");
        assertEq(reserve.locked(), 0);
        assertBooksBalance();
    }

    function test_voidStale_refundsOnlyAfterTheGraceWhileTheEngineHasNoAnswer() public {
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotStale.selector, id, uint64(EXPIRY + 6 hours)));
        reserve.voidStale(id);
        vm.warp(EXPIRY + 6 hours);
        // Nobody cranked the engine's `voidExpired`: the Window has no verdict, so the round is voidable.
        uint256 before = usd.balanceOf(opener);
        vm.prank(stranger);
        reserve.voidStale(id);
        assertEq(uint8(reserve.roundOf(id).status), uint8(IRangeReserve.RoundStatus.VOID));
        assertEq(usd.balanceOf(opener), before + stake);
        assertEq(reserve.liquid(), SUPPLY);
        assertBooksBalance();
        reserve.voidStale(id);
        assertEq(reserve.liquid(), SUPPLY, "idempotent");
    }

    function test_suppliers_earnLostStakesAndPayWins() public {
        closeAt(P0 + 5_000);
        reserve.settle(id);
        assertEq(reserve.totalValue(), SUPPLY + stake);
        usd.mint(stranger, 1_000 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(reserve), type(uint256).max);
        uint256 shares = reserve.supply(100 * ONE);
        vm.stopPrank();
        assertLt(shares, 100 * ONE, "a later supplier buys in at the higher share price");
        uint256 houseShares = reserve.sharesOf(house);
        vm.prank(house);
        uint256 got = reserve.withdraw(houseShares);
        assertApproxEqAbs(got, SUPPLY + stake, 2, "the first supplier leaves with the kept stake");
        assertBooksBalance();
    }

    function test_withdraw_refusesWhatIsLockedAndSettlementNeverPauses() public {
        reserve.setPaused(true);
        vm.expectRevert(IRangeReserve.IsPaused.selector);
        vm.prank(house);
        reserve.supply(ONE);
        uint256 shares = reserve.sharesOf(house);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.InsufficientLiquidity.selector, SUPPLY, SUPPLY - (PAYOUT - stake)));
        vm.prank(house);
        reserve.withdraw(shares);
        closeAt(P0);
        reserve.settle(id);
        reserve.claim(id);
        vm.prank(house);
        reserve.withdraw(shares);
        assertEq(reserve.liquid(), 0);
    }

    function test_admin_isTheOnlyTuner() public {
        IRangeReserve.Params memory p = defaultParams();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotAdmin.selector, stranger));
        reserve.setParams(p);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotAdmin.selector, stranger));
        reserve.setVolatility(BTC, 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NotAdmin.selector, stranger));
        reserve.setAssetTicker(BTC, 7);
        p.minProbRaw = p.maxProbRaw;
        vm.expectRevert(IRangeReserve.BadParams.selector);
        reserve.setParams(p);
        p = defaultParams();
        p.maxHorizonSec = p.minTimeLeftSec;
        vm.expectRevert(IRangeReserve.BadParams.selector);
        reserve.setParams(p);
        p = defaultParams();
        p.maxDriftE4 = 0; // PD-2: a zero bound refuses every open, which is a pause by another name
        vm.expectRevert(IRangeReserve.BadParams.selector);
        reserve.setParams(p);
        vm.expectRevert(IRangeReserve.ZeroAddress.selector);
        reserve.setAdmin(address(0));
        reserve.setAdmin(stranger);
        assertEq(reserve.admin(), stranger);
        vm.expectRevert(abi.encodeWithSelector(IRangeReserve.NoSuchRound.selector, 0));
        reserve.roundOf(0);
    }
}
