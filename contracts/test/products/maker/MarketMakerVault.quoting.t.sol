// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/MarketMakerVault.quoting.t.sol — on the real engine (A.6, D-018).
// `venue.addWindow` → a real listed Window; `poolA.setStatus(2)` → the clock past `lockAt`; the caps test fills each
// quote with a real taker before the next (the engine holds at most 16 open orders per holder per market, so eleven
// resting pairs cannot exist; filled inventory is deployed at cost exactly as resting escrow is, so every number is
// Masayume's). The lazy-refund test asserts the engine's behaviour instead (D-017, D-115).

import {OrderView} from "../../../src/engine/interfaces/IEngineLens.sol";
import {IMarketMakerVault} from "../../../src/products/maker/IMarketMakerVault.sol";
import {MakerTestBase} from "../harness/MakerTestBase.sol";

/// @notice What a quote is allowed to be, what it books, and every bound the maker works under.
contract MarketMakerVaultQuotingTest is MakerTestBase {
    function test_quote_restsAPairAndBooksTheVenuesEscrow() public {
        vm.record();
        uint256 escrow = quoteA();
        (, bytes32[] memory writes) = vm.accesses(address(vault));
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 v = vm.load(address(vault), writes[i]);
            assertTrue(v != bytes32(uint256(uint160(address(engine)))), "venue address persisted in vault storage");
            assertTrue(v != bytes32(uint256(uint160(address(lens)))), "lens address persisted in vault storage");
        }
        assertEq(escrow, (BID_YES + (ONE - ASK_YES)) * QTY / ONE, "0.48 + 0.48 over 20 contracts");
        assertEq(vault.liquid(), SUPPLY - escrow);
        assertEq(vault.deployedOf(marketA), escrow);
        assertEq(vault.totalValue(), SUPPLY, "capital moved, value did not");
        assertEq(vault.sharePriceRaw(), ONE);
        assertEq(vault.utilizationBps(), escrow * 10_000 / SUPPLY);
        assertEq(vault.openWindows().length, 1);
        assertEq(vault.windowCount(), 1);
        OrderView[] memory ids = ordersOn(marketA);
        assertEq(ids.length, 2, "a YES bid and a NO bid rest");
        assertEq(ids[1].kind, 0, "the older order: the YES bid");
        assertEq(ids[0].kind, 2, "the newer order: the NO bid (a YES ask)");
        assertEq(ids[1].priceTicks, 480);
        assertEq(ids[0].priceTicks, 520, "YES-price convention: the NO bid rests at the YES ask");
        IMarketMakerVault.WindowBook memory b = vault.bookOf(marketA);
        assertEq(b.escrowOut, escrow);
        assertEq(b.quoteCount, 1);
        assertEq(b.openedAtSec, NOW);
        assertEq(lens.positionOf(marketA, address(vault)).lockedCash, escrow, "the engine holds exactly the escrow");
        assertBooksBalance();
    }

    function test_quote_onlyTheMakerAndNotWhilePaused() public {
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.NotMaker.selector, stranger));
        vm.prank(stranger);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        vault.setPaused(true);
        vm.expectRevert(IMarketMakerVault.IsPaused.selector);
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        vm.expectRevert(IMarketMakerVault.IsPaused.selector);
        vm.prank(house);
        vault.supply(ONE);
        vault.setMaker(address(0));
        vault.setPaused(false);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.NotMaker.selector, maker));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
    }

    function test_quote_mustLeaveTheSpreadUncovered() public {
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.SpreadTooThin.selector, 490_000, 505_000, 20_000));
        vm.prank(maker);
        vault.quote(marketA, 490_000, 505_000, QTY, expireNs());
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.SpreadTooThin.selector, 500_000, 490_000, 20_000));
        vm.prank(maker);
        vault.quote(marketA, 500_000, 490_000, QTY, expireNs());
        // Exactly the spread is allowed.
        vm.prank(maker);
        vault.quote(marketA, 490_000, 510_000, QTY, expireNs());
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.BadPrice.selector, 40_000));
        vm.prank(maker);
        vault.quote(marketA, 40_000, 400_000, QTY, expireNs());
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.BadPrice.selector, 960_000));
        vm.prank(maker);
        vault.quote(marketA, 50_000, 960_000, QTY, expireNs());
    }

    function test_quote_refusesSizeTimeAndExpiryOutOfBounds() public {
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.OverQuantity.selector, 51 * ONE, 50 * ONE));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, 51 * ONE, expireNs());
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.OverQuantity.selector, 0, 50 * ONE));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, 0, expireNs());
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.BadExpiry.selector, uint64(EXPIRY + 1) * 1e9, EXPIRY));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, uint64(EXPIRY + 1) * 1e9);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.BadExpiry.selector, uint64(NOW) * 1e9, EXPIRY));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, uint64(NOW) * 1e9);
        vm.warp(EXPIRY - 20);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.TooLate.selector, marketA, EXPIRY));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        vm.warp(EXPIRY); // the clock reaches lockAt: the engine reports Locked
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.MarketNotTrading.selector, marketA, uint8(2)));
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        vm.warp(NOW);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.UnknownMarket.selector, bytes32(uint256(1))));
        vm.prank(maker);
        vault.quote(bytes32(uint256(1)), BID_YES, ASK_YES, QTY, expireNs());
    }

    function test_quote_respectsTheWindowExposureAndCountCaps() public {
        // 200 per Window: ten quotes of 19.2 fit, the eleventh does not. Each pair is filled by a real taker before
        // the next (inventory at cost is deployed exactly like resting escrow).
        for (uint256 i = 0; i < 10; i++) {
            quoteA();
            fillBoth(marketA, QTY);
        }
        uint256 deployed = vault.deployedOf(marketA);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.OverWindowCap.selector, marketA, deployed + (BID_YES + (ONE - ASK_YES)) * QTY / ONE, 200 * ONE));
        quoteA();

        // Three more Windows fill the exposure cap (50% of 1,000) before the count cap (4).
        bytes32 b = list(START, LOCK, true);
        bytes32 c = list(START, LOCK, true);
        bytes32 d = list(START, LOCK, true);
        bytes32 e = list(START, LOCK, true);
        for (uint256 i = 0; i < 10; i++) {
            quoteOn(b, QTY);
            fillBoth(b, QTY);
        }
        for (uint256 i = 0; i < 6; i++) {
            quoteOn(c, QTY);
            fillBoth(c, QTY);
        }
        uint256 wouldBe = vault.totalDeployed() + (BID_YES + (ONE - ASK_YES)) * QTY / ONE;
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.OverExposure.selector, wouldBe, SUPPLY, uint16(5_000)));
        quoteOn(c, QTY);
        // Half a contract on a fourth Window still fits under the cap; a fifth Window does not fit the count.
        quoteOn(d, ONE / 2);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.TooManyWindows.selector, uint32(4), uint32(4)));
        quoteOn(e, ONE);
        assertEq(vault.openWindows().length, 4);
        assertBooksBalance();
        assertConserved();
    }

    function test_quote_refusesMoreThanLiquid() public {
        uint256 shares = vault.sharesOf(house);
        vm.prank(house);
        vault.withdraw(shares - 10 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.InsufficientLiquidity.selector, (BID_YES + (ONE - ASK_YES)) * QTY / ONE, 10 * ONE));
        quoteA();
    }

    function test_admin_isTheOnlyTuner() public {
        IMarketMakerVault.Params memory p = defaultParams();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.NotAdmin.selector, stranger));
        vault.setParams(p);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.NotAdmin.selector, stranger));
        vault.setMaker(stranger);
        p.maxPriceRaw = ONE;
        vm.expectRevert(IMarketMakerVault.BadParams.selector);
        vault.setParams(p);
        p = defaultParams();
        p.maxOpenWindows = 65;
        vm.expectRevert(IMarketMakerVault.BadParams.selector);
        vault.setParams(p);
        vm.expectRevert(IMarketMakerVault.ZeroAddress.selector);
        vault.setAdmin(address(0));
        vault.setAdmin(stranger);
        assertEq(vault.admin(), stranger);
    }

    /// @dev Masayume (Shannon 2026-09-02): the venue refunded the caller's expired quote inside the next placement, so
    ///      a cash-delta escrow underflowed. The engine never does (E-33, D-017): an expired quote keeps its escrow
    ///      until it is cancelled, evicted or swept — so the next quote's escrow is its own measured delta, both pairs
    ///      stay deployed, and a pull brings both back to the cent.
    function test_quote_booksTheVenuesLazyRefundOfAnExpiredQuote() public {
        uint64 shortNs = uint64(NOW + 60) * 1e9;
        vm.prank(maker);
        uint256 first = vault.quote(marketA, BID_YES, ASK_YES, QTY, shortNs);
        vm.warp(NOW + 61);
        uint256 liquidBefore = vault.liquid();
        vm.prank(maker);
        uint256 second = vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        assertEq(second, first, "the escrow is the measured delta, equal to the engine's figure");
        IMarketMakerVault.WindowBook memory b = vault.bookOf(marketA);
        assertEq(b.escrowBack, 0, "no lazy refund: the engine does not refund inside a placement");
        assertEq(b.escrowOut, first * 2);
        assertEq(vault.liquid(), liquidBefore - second);
        assertEq(vault.deployedOf(marketA), first + second, "the expired pair is still escrowed in the engine");
        assertEq(lens.positionOf(marketA, address(vault)).lockedCash, first + second);
        vm.prank(maker);
        (uint256 orders, uint256 returned) = vault.pull(marketA);
        assertEq(orders, 4, "the per-holder list holds expired quotes too");
        assertEq(returned, first + second);
        assertEq(vault.deployedOf(marketA), 0);
        assertBooksBalance();
        assertConserved();
    }
}
