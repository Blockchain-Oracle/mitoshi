// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/EventVault.trading.t.sol (attended + delegated lanes) — against the
// real engine: `MockVenue` knobs become real maker quotes (`BookSeeder`), `ImmediateOrCancelNoFill` is the engine's own
// error. Two rows change with the engine's semantics (interface-checklist §2): #2 (no lazy in-pool credit) and #10
// (no settlement or taker fee, Q-005/T10); each keeps its test with the engine's behaviour asserted instead.
// Settlement, tally and the named invariants are in EventVault.settlement.t.sol (400-line rule).

import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IEngineErrors} from "../../../src/engine/EngineErrors.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

contract EventVaultTradingTest is VaultTestBase {
    uint256 internal yesId;
    uint256 internal noId;

    function setUp() public override {
        super.setUp();
        yesId = yesOf(market);
        noId = noOf(market);
        depositAs(owner, DEPOSIT);
    }

    // --- attended lane ---

    function test_place_buyBooksTokensAndChargesActualCost() public {
        (uint256 spent, uint256 gained) = placeAs(owner, market, 0, true, 700_000, 100 * ONE);
        assertEq(gained, 100 * ONE, "IOC filled in full");
        assertEq(spent, 60 * ONE, "charged the 0.60 fill, not the 0.70 limit");
        assertEq(available(owner), DEPOSIT - 60 * ONE);
        assertEq(vault.positionOf(owner, yesId), 100 * ONE);
        assertEq(lens.positionOf(market, address(vault)).yesFree * 1000, 100 * ONE, "the engine holds it for the vault");
    }

    /// @dev Row #2: the engine pulls the exact cost after matching, so a better-than-limit fill leaves no credit
    ///      behind (Masayume's refund-as-credit knob has no engine counterpart); `sweep` has nothing to move.
    function test_place_refundLandingAsPoolCreditIsStillCash() public {
        uint256 walletBefore = usd.balanceOf(address(vault));
        (uint256 spent,) = placeAs(owner, market, 0, true, 700_000, 100 * ONE);
        assertEq(spent, 60 * ONE);
        assertEq(walletBefore - usd.balanceOf(address(vault)), 60 * ONE, "only the fill left the wallet");
        assertEq(lens.creditOf(market, address(vault)), 0, "no lazy credit");
        assertEq(vault.sweep(market), 0);
        vm.prank(owner);
        vault.withdraw(DEPOSIT - 60 * ONE);
        assertEq(usd.balanceOf(address(vault)), 0);
    }

    function test_place_partialFillChargesOnlyWhatFilled() public {
        seed(market, true, 600, 25_000); // a quarter of the order's size rests
        vm.prank(owner);
        (uint256 spent, uint256 gained) = vault.place(market, 0, true, 700_000, 100 * ONE, EXPIRE_NS);
        assertEq(gained, 25 * ONE);
        assertEq(spent, 15 * ONE);
        assertEq(lens.positionOf(market, address(vault)).lockedCash, 0, "IOC never rests the remainder");
        assertConserved();
    }

    /// @dev The engine reverts an IOC that crosses nothing; the vault lets that surface, so nothing is booked.
    function test_place_nothingFilledRevertsWithTheVenue() public {
        book(market, 0, true);
        vm.prank(owner);
        vm.expectRevert(IEngineErrors.ImmediateOrCancelNoFill.selector);
        vault.place(market, 0, true, 500_000, 100 * ONE, EXPIRE_NS);
        assertEq(available(owner), DEPOSIT);
    }

    function test_place_noBuyRunsInNoTerms() public {
        (uint256 spent, uint256 gained) = placeAs(owner, market, 1, true, 500_000, 100 * ONE); // NO limit 0.50 ≥ 0.40 fill
        assertEq(gained, 100 * ONE);
        assertEq(spent, 40 * ONE);
        assertEq(vault.positionOf(owner, noId), 100 * ONE);
    }

    function test_place_sellCreditsProceedsAndRefusesOversell() public {
        placeAs(owner, market, 0, true, 700_000, 100 * ONE);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 101 * ONE, 100 * ONE));
        vault.place(market, 0, false, 500_000, 101 * ONE, EXPIRE_NS);
        (uint256 received, uint256 sold) = placeAs(owner, market, 0, false, 500_000, 40 * ONE);
        assertEq(sold, 40 * ONE);
        assertEq(received, 24 * ONE);
        assertEq(vault.positionOf(owner, yesId), 60 * ONE);
        assertEq(available(owner), DEPOSIT - 60 * ONE + 24 * ONE);
    }

    function test_place_refusesWhenNotTrading() public {
        vm.warp(LOCK); // lockAt: the Window is Locked (status 2)
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.MarketNotTrading.selector, uint8(2)));
        vault.place(market, 0, true, 700_000, ONE, EXPIRE_NS);
    }

    function test_place_refusesMoreThanAvailable() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 1_200 * ONE, DEPOSIT));
        vault.place(market, 0, true, 600_000, 2_000 * ONE, EXPIRE_NS);
    }

    /// @dev Row #10: no fee field exists (Q-005, T10), so the charge is exactly the fill.
    function test_place_feesAreInTheCharge() public {
        (uint256 spent,) = placeAs(owner, market, 0, true, 700_000, 100 * ONE);
        assertEq(spent, 60 * ONE, "no taker fee on top of the fill");
    }

    // --- delegated lane ---

    function test_xBalanceOnly_topUpAndSameDayTradesRemainBoundedByAllocation() public {
        vm.startPrank(owner);
        uint256 id = vault.grant(
            IEventVault.GrantKind.EXECUTOR, actor, caps(type(uint128).max, type(uint128).max, 8, 0), uint64(block.timestamp + 30 days), 5 * ONE
        );
        vault.fundGrant(id, 50 * ONE);
        vm.stopPrank();
        uint256 freeBefore = available(owner);
        seed(market, true, 500, BOOK_DEPTH); // the book at 0.50
        vm.startPrank(actor);
        vault.placeFor(id, market, 0, true, 500_000, 50 * ONE, EXPIRE_NS);
        vault.placeFor(id, market, 0, true, 500_000, 50 * ONE, EXPIRE_NS);
        assertEq(vault.grantOf(id).budget, 5 * ONE);
        assertEq(vault.grantOf(id).spentToday, 50 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 6 * ONE, 5 * ONE));
        vault.placeFor(id, market, 0, true, 500_000, 12 * ONE, EXPIRE_NS);
        vm.stopPrank();
        assertEq(available(owner), freeBefore, "unallocated Trading Balance cannot be spent");
    }

    function test_placeFor_spendsBudgetNotAvailable() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        (uint256 spent, uint256 gained) = placeForAs(id, market, 0, true, 700_000, 50 * ONE);
        assertEq(spent, 30 * ONE);
        assertEq(gained, 50 * ONE);
        assertEq(vault.grantOf(id).budget, 170 * ONE);
        assertEq(available(owner), DEPOSIT - 200 * ONE, "the owner's free balance is untouched");
        assertEq(vault.positionOf(owner, yesId), 50 * ONE, "the position is the owner's");
        assertEq(vault.grantOf(id).openPositions, 1);
    }

    function test_placeFor_onlyTheActor() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.NotGrantActor.selector, id, stranger));
        vault.placeFor(id, market, 0, true, 700_000, ONE, EXPIRE_NS);
    }

    function test_placeFor_revokedAndExpiredStop() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        vm.warp(block.timestamp + 1 days + 1);
        uint64 expiresAt = vault.grantOf(id).expiresAtSec;
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantExpired.selector, id, expiresAt));
        vault.placeFor(id, market, 0, true, 700_000, ONE, EXPIRE_NS);
        vm.warp(vm.getBlockTimestamp() - 2);
        vm.prank(owner);
        vault.revoke(id);
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantIsRevoked.selector, id));
        vault.placeFor(id, market, 0, true, 700_000, ONE, EXPIRE_NS);
    }

    function test_placeFor_perTradeCapRevertsWholeTx() public {
        uint256 id = grantStrategy(200 * ONE, caps(10 * ONE, 100 * ONE, 5, 0));
        book(market, 0, true);
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverStakeCap.selector, 30 * ONE, uint128(10 * ONE)));
        vault.placeFor(id, market, 0, true, 700_000, 50 * ONE, EXPIRE_NS);
        assertEq(vault.grantOf(id).budget, 200 * ONE);
        assertEq(vault.positionOf(owner, yesId), 0);
        assertEq(lens.positionOf(market, address(vault)).yesFree, 0, "the engine fill was reverted with it");
    }

    /// @dev A Window never spans a UTC midnight (Regular cadences divide the hour), so the next day's trade is on
    ///      the Window that opens at 00:00 UTC — the cap is the grant's, across Windows.
    function test_placeFor_dailyCapBucketsByUtcDay() public {
        uint256 id = grantStrategy(500 * ONE, caps(50 * ONE, 50 * ONE, 9, 0));
        uint40 midnight = uint40((block.timestamp / 1 days + 1) * 1 days);
        bytes32 tomorrow = list(midnight, midnight + 300, false);
        placeForAs(id, market, 0, true, 700_000, 50 * ONE); // 30
        book(market, 0, true);
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverDailyCap.selector, 60 * ONE, uint128(50 * ONE)));
        vault.placeFor(id, market, 0, true, 700_000, 50 * ONE, EXPIRE_NS);
        vm.warp(midnight); // 00:00 UTC next day
        recordOpen(tomorrow, 36_500_000_000);
        placeForAs(id, tomorrow, 0, true, 700_000, 50 * ONE);
        assertEq(vault.grantOf(id).spentToday, 30 * ONE);
    }

    function test_placeFor_openPositionCap() public {
        uint256 id = grantStrategy(500 * ONE, caps(50 * ONE, 500 * ONE, 1, 0));
        placeForAs(id, market, 0, true, 700_000, 10 * ONE);
        placeForAs(id, market, 0, true, 700_000, 10 * ONE); // same position, not a new one
        book(market, 1, true);
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverPositionCap.selector, uint32(2), uint32(1)));
        vault.placeFor(id, market, 1, true, 500_000, 10 * ONE, EXPIRE_NS);
    }

    function test_placeFor_priceCapInTheSidesOwnTerms() public {
        uint256 id = grantStrategy(500 * ONE, caps(50 * ONE, 500 * ONE, 9, 650_000));
        book(market, 1, true);
        vm.startPrank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverPriceCap.selector, 700_000, uint64(650_000)));
        vault.placeFor(id, market, 0, true, 700_000, 10 * ONE, EXPIRE_NS);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverPriceCap.selector, 700_000, uint64(650_000)));
        vault.placeFor(id, market, 1, true, 300_000, 10 * ONE, EXPIRE_NS); // a YES limit of 0.30 is NO at 0.70
        (, uint256 gained) = vault.placeFor(id, market, 1, true, 400_000, 10 * ONE, EXPIRE_NS); // NO at 0.60, under the cap
        vm.stopPrank();
        assertEq(gained, 10 * ONE);
    }

    function test_placeFor_saleProceedsGoToOwnerNotBudget() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        placeForAs(id, market, 0, true, 700_000, 50 * ONE);
        placeForAs(id, market, 0, false, 500_000, 50 * ONE);
        assertEq(vault.grantOf(id).budget, 170 * ONE, "budget only ever goes down");
        assertEq(available(owner), DEPOSIT - 200 * ONE + 30 * ONE);
    }

    function test_placeFor_budgetIsTheCeiling() public {
        uint256 id = grantStrategy(20 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        vm.prank(actor);
        // refused up front at the worst case at the limit (50 × 0.70), not at the 0.60 fill
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 35 * ONE, 20 * ONE));
        vault.placeFor(id, market, 0, true, 700_000, 50 * ONE, EXPIRE_NS);
    }
}
