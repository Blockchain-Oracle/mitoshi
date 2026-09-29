// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/EventVault.trading.t.sol (settlement, tally, AD-5, AD-10 sections;
// split from the trading suite for the 400-line rule) — against the real engine: `venue.resolve/voidIt` become a real
// RedStone close print + `settle`, or a missed close + permissionless `voidExpired`.

import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IEngineErrors} from "../../../src/engine/EngineErrors.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

contract EventVaultSettlementTest is VaultTestBase {
    uint256 internal yesId;
    uint256 internal noId;

    function setUp() public override {
        super.setUp();
        yesId = yesOf(market);
        noId = noOf(market);
        depositAs(owner, DEPOSIT);
    }

    function test_crankSettle_winnerPaysIntoAvailable_anyoneCranks() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        placeForAs(id, market, 0, true, 700_000, 50 * ONE);
        vm.prank(stranger);
        vm.expectRevert(IEventVault.MarketNotSettled.selector);
        vault.crankSettle(owner, market);
        resolveMarket(market, 0);
        vm.prank(stranger);
        uint256 payout = vault.crankSettle(owner, market);
        assertEq(payout, 50 * ONE);
        assertEq(available(owner), DEPOSIT - 200 * ONE + 50 * ONE);
        assertEq(vault.positionOf(owner, yesId), 0);
        assertEq(vault.grantOf(id).openPositions, 0);
        assertEq(usd.balanceOf(stranger), 0);
        assertConserved();
    }

    function test_crankSettle_voidPaysHalfToBothSides_loserPaysZero() public {
        placeAs(owner, market, 0, true, 700_000, 100 * ONE);
        placeAs(owner, market, 1, true, 500_000, 100 * ONE);
        resolveMarket(market, 2);
        assertEq(vault.crankSettle(owner, market), 100 * ONE);
        vm.expectRevert(IEventVault.NothingToSettle.selector);
        vault.crankSettle(owner, market);
        assertConserved();
    }

    function test_crankSettle_loserPaysZeroAndClears() public {
        placeAs(owner, market, 1, true, 500_000, 100 * ONE); // NO
        resolveMarket(market, 0); // Up: NO loses
        assertEq(vault.crankSettle(owner, market), 0);
        assertEq(vault.positionOf(owner, noId), 0);
        assertEq(lens.positionOf(market, address(vault)).noFree, 0, "the losing lots left the engine too");
        assertConserved();
    }

    /// @dev D-015: the vault opted out, so the engine's permissionless crank cannot redeem the pooled position
    ///      into the vault unattributed; `crankSettle` is the only way positions settle.
    function test_engineCrankRefusedForTheVault() public {
        placeAs(owner, market, 0, true, 700_000, 10 * ONE);
        resolveMarket(market, 0);
        assertTrue(lens.crankOptedOut(address(vault)));
        vm.expectRevert(IEngineErrors.CrankRefused.selector);
        engine.redeemFor(market, address(vault));
    }

    // --- the on-chain tally the portfolio reads ---

    function test_tally_recordsFillsAndSettlement() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        placeAs(owner, market, 0, true, 700_000, 100 * ONE); // 60
        placeForAs(id, market, 1, true, 500_000, 50 * ONE); // 20
        placeAs(owner, market, 0, false, 500_000, 40 * ONE); // +24
        (uint128 cost, uint128 proceeds, uint128 payout, uint128 bUp, uint128 bDown, uint128 sUp,, uint64 first, uint64 last, uint64 settledAt, uint32 fills) =
            vault.tallyOf(owner, market);
        assertEq(cost, 80 * ONE);
        assertEq(proceeds, 24 * ONE);
        assertEq(bUp, 100 * ONE);
        assertEq(bDown, 50 * ONE);
        assertEq(sUp, 40 * ONE);
        assertEq(fills, 3);
        assertEq(first, uint64(vm.getBlockTimestamp()), "first");
        assertEq(last, uint64(vm.getBlockTimestamp()), "last");
        assertEq(payout, 0);
        assertEq(settledAt, 0);
        assertEq(vault.marketCountOf(owner), 1);
        assertEq(vault.marketsOf(owner, 0, 10)[0], market);
        assertEq(vault.marketsOf(owner, 1, 10).length, 0);

        resolveMarket(market, 0);
        vm.warp(vm.getBlockTimestamp() + 100);
        vault.crankSettle(owner, market);
        (,, payout,,,,,,, settledAt,) = vault.tallyOf(owner, market);
        assertEq(payout, 60 * ONE, "the surviving 60 UP paid one each");
        // via-IR may cache TIMESTAMP within this frame across the warp; the cheatcode reads the live clock.
        assertEq(uint256(settledAt), vm.getBlockTimestamp(), "settledAt");
    }

    function test_tally_nothingFilledLeavesNoTrace() public {
        book(market, 0, true);
        vm.prank(owner);
        vm.expectRevert(IEngineErrors.ImmediateOrCancelNoFill.selector);
        vault.place(market, 0, true, 500_000, 100 * ONE, EXPIRE_NS);
        assertEq(vault.marketCountOf(owner), 0);
    }

    // --- the two named invariants from the spine ---

    /// @dev A compromised delegate key can at worst open in-cap positions for the rightful owner.
    function test_AD5_no_divert() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        uint256 actorBefore = usd.balanceOf(actor);
        placeForAs(id, market, 0, true, 700_000, 50 * ONE);
        placeForAs(id, market, 0, false, 500_000, 20 * ONE);
        vm.startPrank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 1, 0));
        vault.withdraw(1); // the actor has no account of its own to draw on
        vm.expectRevert(abi.encodeWithSelector(IEventVault.NotGrantOwner.selector, id, actor));
        vault.fundGrant(id, 1);
        vm.stopPrank();
        resolveMarket(market, 0);
        vault.crankSettle(owner, market);
        assertEq(usd.balanceOf(actor), actorBefore, "the actor never receives collateral");
        // Every unit the owner deposited is still theirs: free balance + budget + what the fills returned.
        uint256 spent = 30 * ONE;
        uint256 saleProceeds = 12 * ONE;
        uint256 payout = 30 * ONE;
        assertEq(available(owner) + vault.grantOf(id).budget, DEPOSIT - spent + saleProceeds + payout);
    }

    /// @dev Storage carries the market id, never a venue address: the engine and lens live in immutables, and no
    ///      write the vault makes while trading and settling holds either (AD-10 by construction).
    function test_AD10_no_pool_address_in_storage() public {
        uint256 id = grantStrategy(200 * ONE, caps(50 * ONE, 100 * ONE, 5, 0));
        book(market, 0, true);
        vm.record();
        vm.prank(owner);
        vault.place(market, 0, true, 700_000, 10 * ONE, EXPIRE_NS);
        book(market, 1, true);
        vm.prank(actor);
        vault.placeFor(id, market, 1, true, 500_000, 10 * ONE, EXPIRE_NS);
        resolveMarket(market, 2);
        vault.crankSettle(owner, market);
        (, bytes32[] memory writes) = vm.accesses(address(vault));
        assertGt(writes.length, 0);
        bytes32 e = bytes32(uint256(uint160(address(engine))));
        bytes32 l = bytes32(uint256(uint160(address(lens))));
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 v = vm.load(address(vault), writes[i]);
            assertTrue(v != e && v != l, "venue address persisted in vault storage");
        }
    }
}
