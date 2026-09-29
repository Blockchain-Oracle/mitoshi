// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEventsEngineEvents} from "../../../src/engine/interfaces/IEventsEngineEvents.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {EngineSeam} from "../../../src/products/shared/EngineSeam.sol";
import {PayoutCheck} from "../../../src/products/shared/Payouts.sol";
import {IMarketMakerVault} from "../../../src/products/maker/IMarketMakerVault.sol";
import {MarketMakerVault} from "../../../src/products/maker/MarketMakerVault.sol";
import {LyingEngine} from "../harness/LyingEngine.sol";
import {MakerTestBase} from "../harness/MakerTestBase.sol";
import "../../../src/engine/EngineTypes.sol";

/// The S8 seam edits (A.4.2) proven on the real engine: the escrow is a measured delta equal to the engine's report,
/// every credit the engine hands the vault is booked as escrow back (its own expired quote evicted, a third party's
/// sweep, a taker's eviction), pull after `lockAt` by anyone, merge Trading-only with pairs redeemed at par after lock,
/// realized per Window, the settlement gate on `expiry`, donations outside value, P12 on withdraw.
contract MarketMakerVaultSeamTest is MakerTestBase {
    uint256 internal constant PAIR = (BID_YES + (ONE - ASK_YES)) * QTY / ONE; // 19.2: one quote's escrow

    // --- constructor pins (A.4 shared) ---

    function test_constructor_pinsCollateralLensApprovalAndCrankOptOut() public {
        assertEq(address(vault.engine()), address(engine));
        assertEq(address(vault.lens()), address(lens));
        assertEq(address(vault.collateral()), address(usd));
        assertEq(vault.one(), ONE);
        assertEq(usd.allowance(address(vault), address(engine)), type(uint256).max, "approved once");
        assertTrue(lens.crankOptedOut(address(vault)), "D-015");

        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.WrongCollateral.selector, address(usd)));
        new MarketMakerVault(IERC20(address(0xBEEF)), IEventsEngine(address(engine)), lens, defaultParams());
        EngineLens foreign = new EngineLens(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.WrongLens.selector, address(foreign)));
        new MarketMakerVault(IERC20(address(usd)), IEventsEngine(address(engine)), foreign, defaultParams());

        // a third party cannot redeem the vault's position outside `settle` (it would land unbooked)
        quoteA();
        hitBid(marketA, BID_YES, QTY);
        resolve(marketA, 0);
        vm.prank(stranger);
        vm.expectRevert(bytes4(keccak256("CrankRefused()")));
        engine.redeemFor(marketA, address(vault));
        assertEq(vault.settle(marketA), QTY);
    }

    function test_offGridRefused() public {
        vm.startPrank(maker);
        vm.expectRevert(abi.encodeWithSelector(EngineSeam.OffGrid.selector, uint256(480_500), uint64(1000)));
        vault.quote(marketA, 480_500, ASK_YES, QTY, expireNs());
        vm.expectRevert(abi.encodeWithSelector(EngineSeam.OffGrid.selector, QTY + 1, uint64(1000)));
        vault.quote(marketA, BID_YES, ASK_YES, QTY + 1, expireNs());
        vm.stopPrank();
    }

    // --- D-017: the escrow is the measured delta and equals the engine's own report ---

    function test_escrowIsMeasuredDeltaEqualsReport() public {
        uint256 w0 = usd.balanceOf(address(vault));
        vm.recordLogs();
        uint256 escrow = quoteA();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 w1 = usd.balanceOf(address(vault));
        uint256 reported;
        uint256 reports;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(engine) || logs[i].topics[0] != IEventsEngineEvents.OrderExecuted.selector) continue;
            assertEq(address(uint160(uint256(logs[i].topics[2]))), address(vault), "the vault is the engine's caller");
            (,, uint8 orderType,, uint16 ticks, uint64 lots,,, PlaceResult memory r,) =
                abi.decode(logs[i].data, (uint48, uint8, uint8, uint8, uint16, uint64, uint40, uint64, PlaceResult, uint64));
            assertEq(orderType, ORDER_POST_ONLY);
            assertEq(r.restedLots, lots, "restedLots == lots");
            assertEq(r.filledLots + r.creditUsed + r.withdrawn, 0);
            reported += r.transferredIn;
            ++reports;
            ticks;
        }
        assertEq(reports, 2, "one report per side");
        uint256 lotsTicksCu = uint256(QTY / 1000) * 480 * 1 + uint256(QTY / 1000) * (1000 - 520) * 1;
        assertEq(w0 - w1, reported, "measured delta == sum of transferredIn");
        assertEq(reported, lotsTicksCu, "== lots x ownTicks x cu");
        assertEq(escrow, reported, "the vault books the measured figure");
        assertEq(vault.bookOf(marketA).escrowOut, escrow);
        assertEq(lens.positionOf(marketA, address(vault)).lockedCash, escrow);
        assertBooksBalance();
    }

    // --- every credit withdrawal is booked as escrow back ---

    function test_ownExpiredQuoteEvictedToCredit_bookedAsEscrowBack() public {
        vm.prank(maker);
        uint256 first = vault.quote(marketA, BID_YES, ASK_YES, QTY, uint64(NOW + 60) * 1e9);
        vm.warp(NOW + 61);
        // The new bid at 0.53 crosses the vault's own expired ask at 0.52: the PostOnly walk evicts it (E-35) and its
        // escrow (0.48 × 20 = 9.6) lands as the vault's engine credit, collected and booked in the same call.
        uint256 askBack = (ONE - ASK_YES) * QTY / ONE;
        vm.expectEmit(address(vault));
        emit IMarketMakerVault.Swept(askBack);
        vm.prank(maker);
        uint256 second = vault.quote(marketA, 530_000, 560_000, QTY, expireNs());
        assertEq(second, (530_000 + 440_000) * QTY / ONE);
        IMarketMakerVault.WindowBook memory b = vault.bookOf(marketA);
        assertEq(b.escrowBack, askBack, "the eviction's credit is this Window's escrow back");
        assertEq(b.escrowOut, first + second);
        assertEq(lens.creditOf(marketA, address(vault)), 0, "collected in the same call");
        assertEq(vault.liquid(), SUPPLY - first - second + askBack);
        assertEq(vault.deployedOf(marketA), first + second - askBack);
        assertEq(lens.positionOf(marketA, address(vault)).lockedCash, vault.deployedOf(marketA), "deployed == engine escrow");
        assertEq(ordersOn(marketA).length, 3, "the expired bid (not crossed) and the new pair");
        assertEq(vault.totalValue(), SUPPLY);
        assertBooksBalance();
        assertConserved();
    }

    function test_thirdPartySweep_bookedAsEscrowBack() public {
        vm.prank(maker);
        uint256 escrow = vault.quote(marketA, BID_YES, ASK_YES, QTY, uint64(NOW + 60) * 1e9);
        vm.warp(NOW + 61);
        vm.prank(stranger);
        assertEq(engine.sweepExpired(marketA, 32), 2, "anyone evicts the vault's expired pair");
        assertEq(lens.creditOf(marketA, address(vault)), escrow, "the escrow sits as the vault's engine credit");
        assertEq(vault.deployedOf(marketA), escrow, "still the vault's, still deployed until collected");
        assertEq(vault.totalValue(), SUPPLY);
        assertBooksBalance();
        vm.prank(maker);
        (uint256 orders, uint256 returned) = vault.pull(marketA);
        assertEq(orders, 0, "nothing left to cancel");
        assertEq(returned, escrow, "the sweep's credit is collected and booked");
        assertEq(vault.bookOf(marketA).escrowBack, escrow);
        assertEq(vault.deployedOf(marketA), 0);
        assertEq(vault.liquid(), SUPPLY);
        assertBooksBalance();
        assertConserved();
    }

    function test_takerEviction_bookedAsEscrowBackAtSettle() public {
        vm.prank(maker);
        vault.quote(marketA, BID_YES, ASK_YES, QTY, uint64(NOW + 60) * 1e9);
        vm.warp(NOW + 61);
        seed(marketA, true, 525, 20_000); // someone else's live ask at 0.525
        // A taker buying YES up to 0.53 evicts the vault's dead ask at 0.52 on the way to the live one.
        hitAsk(marketA, 530_000, QTY);
        uint256 askBack = (ONE - ASK_YES) * QTY / ONE;
        assertEq(lens.creditOf(marketA, address(vault)), askBack);
        resolve(marketA, 0);
        vault.settle(marketA);
        IMarketMakerVault.WindowBook memory b = vault.bookOf(marketA);
        assertEq(b.escrowBack, PAIR, "the evicted ask and the cancelled bid both came back as escrow");
        assertEq(b.realized, 0, "nothing filled: the Window is flat");
        assertEq(vault.liquid(), SUPPLY);
        assertBooksBalance();
        assertConserved();
    }

    // --- T08: pull on lockAt, settlement gate on expiry ---

    function test_pullAfterLockByAnyone() public {
        (uint40 lock, uint40 expiry) = (START + 300, START + 3_600);
        bytes32 g = listGap(START, lock, expiry);
        uint256 escrow = quoteOn(g, QTY);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.NotMaker.selector, stranger));
        vault.pull(g);
        vm.warp(lock);
        assertEq(lens.status(g), STATUS_LOCKED);
        assertLt(block.timestamp, expiry, "Masayume waited for expiry; the engine's lockAt ends trading");
        vm.prank(stranger);
        (uint256 orders, uint256 returned) = vault.pull(g);
        assertEq(orders, 2);
        assertEq(returned, escrow);
        assertEq(vault.deployedOf(g), 0);
        assertBooksBalance();
        assertConserved();
    }

    function test_withdrawBlockedWhileExpiredUnsettled() public {
        (uint40 lock, uint40 expiry) = (START + 300, START + 3_600);
        bytes32 g = listGap(START, lock, expiry);
        quoteOn(g, QTY);
        hitBid(g, BID_YES, QTY);
        uint256 shares = vault.sharesOf(house);
        vm.warp(lock + 1);
        assertEq(vault.unsettledExpired(), bytes32(0), "locked is not expired: suppliers may still leave");
        vm.prank(house);
        vault.withdraw(shares / 10);
        vm.warp(expiry);
        assertEq(vault.unsettledExpired(), g);
        vm.prank(house);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.UnsettledWindow.selector, g));
        vault.withdraw(shares / 10);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.MarketNotSettled.selector, g));
        vault.settle(g);
        resolve(g, 1); // NO: the filled YES bid is lost
        vault.settle(g);
        uint256 left = vault.sharesOf(house);
        vm.prank(house);
        uint256 got = vault.withdraw(left);
        assertEq(got + SUPPLY / 10, SUPPLY - BID_YES * QTY / ONE, "the loss is booked before anyone leaves");
        assertEq(vault.liquid(), 0);
        assertBooksBalance();
    }

    // --- merge is Trading-only; after lock settle redeems pairs at par ---

    function test_mergeAfterLockReverts_settleRedeemsPairsAtPar() public {
        bytes32 v = list(START, LOCK, true);
        uint256 escrow = quoteA();
        quoteOn(v, QTY);
        fillBoth(marketA, QTY);
        fillBoth(v, QTY);
        vm.warp(LOCK);
        vm.expectRevert(abi.encodeWithSelector(IMarketMakerVault.MarketNotTrading.selector, marketA, STATUS_LOCKED));
        vault.merge(marketA);
        vm.prank(address(vault));
        vm.expectRevert(bytes4(keccak256("MarketNotTrading()")));
        engine.mergeSet(marketA, uint64(QTY / 1000), true); // the engine itself merges nothing after lock

        resolve(marketA, 0);
        assertEq(vault.settle(marketA), QTY, "20 pairs redeem at par when YES wins");
        resolve(v, 2);
        assertEq(vault.settle(v), QTY, "and when the Window is void (half + half)");
        assertEq(vault.bookOf(marketA).realized, int128(int256(QTY - escrow)), "the spread, realized at par");
        assertEq(vault.bookOf(v).realized, int128(int256(QTY - escrow)));
        assertEq(vault.totalValue(), SUPPLY + 2 * (QTY - escrow));
        assertBooksBalance();
        assertConserved();
    }

    function test_realizedPerWindow() public {
        bytes32 b = list(START, LOCK, true);
        bytes32 c = list(START, LOCK, true);
        bytes32 d = list(START, LOCK, true);
        quoteA();
        quoteOn(b, QTY);
        quoteOn(c, QTY);
        quoteOn(d, QTY);
        fillBoth(marketA, QTY);
        vault.merge(marketA); // A: the spread
        hitBid(b, BID_YES, QTY); // B: long YES, YES wins
        hitBid(c, BID_YES, QTY); // C: long YES, NO wins
        assertEq(vault.bookOf(marketA).realized, 0, "nothing is realized before settlement");
        resolve(marketA, 0);
        resolve(b, 0);
        resolve(c, 1);
        resolve(d, 0); // D: never filled
        vault.settle(marketA);
        vault.settle(b);
        vault.settle(c);
        vault.settle(d);
        int256 cost = int256(BID_YES * QTY / ONE);
        assertEq(vault.bookOf(marketA).realized, int128(int256(QTY - PAIR)), "A: +0.8");
        assertEq(vault.bookOf(b).realized, int128(int256(QTY) - cost), "B: +10.4");
        assertEq(vault.bookOf(c).realized, int128(-cost), "C: -9.6");
        assertEq(vault.bookOf(d).realized, 0, "D: flat");
        int256 sum;
        bytes32[4] memory ws = [marketA, b, c, d];
        for (uint256 i; i < 4; ++i) sum += vault.bookOf(ws[i]).realized;
        assertEq(int256(vault.totalValue()) - int256(SUPPLY), sum, "the vault's result is the sum of its Windows'");
        assertEq(vault.openWindows().length, 0);
        assertBooksBalance();
        assertConserved();
    }

    // --- value is internal: a donation moves nothing ---

    function test_donationDoesNotMoveSharePrice() public {
        quoteA();
        fillBoth(marketA, QTY);
        vault.merge(marketA);
        uint256 price0 = vault.sharePriceRaw();
        uint256 tv0 = vault.totalValue();
        uint256 shares0 = vault.supplyShares();
        _donate(500 * ONE);
        assertEq(vault.sharePriceRaw(), price0, "share price unchanged");
        assertEq(vault.totalValue(), tv0);
        usd.mint(stranger, 100 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(vault), type(uint256).max);
        assertEq(vault.supply(100 * ONE), 100 * ONE * shares0 / tv0, "a new supplier prices off booked value only");
        vm.stopPrank();
        assertBooksBalance();

        // The first-supplier inflation attack has nothing to inflate: 1 unit + a huge donation, then a victim.
        MarketMakerVault fresh = new MarketMakerVault(IERC20(address(usd)), IEventsEngine(address(engine)), lens, defaultParams());
        address victim = makeAddr("victim");
        usd.mint(victim, SUPPLY);
        usd.mint(stranger, 10_000 * ONE + 1);
        vm.startPrank(stranger);
        usd.approve(address(fresh), type(uint256).max);
        fresh.supply(1);
        usd.transfer(address(fresh), 10_000 * ONE);
        vm.stopPrank();
        vm.startPrank(victim);
        usd.approve(address(fresh), type(uint256).max);
        assertEq(fresh.supply(SUPPLY), SUPPLY, "the victim gets par shares");
        assertEq(fresh.withdraw(SUPPLY), SUPPLY, "and leaves whole");
        vm.stopPrank();
    }

    // --- P12: a supplier's withdrawal refuses while their receive policy blocks it ---

    function test_withdraw_receivePolicyBlocked() public {
        uint256 shares = vault.sharesOf(house);
        uint256 walletBefore = usd.balanceOf(house);
        vm.startPrank(house);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, house); // policy 0: always reject
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, house));
        vault.withdraw(shares);
        assertEq(vault.sharesOf(house), shares, "nothing left the vault");
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, house); // policy 1: always allow
        assertEq(vault.withdraw(shares), SUPPLY);
        vm.stopPrank();
        assertEq(usd.balanceOf(house), walletBefore + SUPPLY);
        assertBooksBalance();
    }

    // --- the accounting asserts against a lying venue (A.6: the only mock) ---

    function test_engineAccountingMismatch() public {
        LyingEngine lying = new LyingEngine(IERC20(address(usd)));
        usd.mint(address(lying), 1_000 * ONE);
        MarketMakerVault v = new MarketMakerVault(IERC20(address(usd)), IEventsEngine(address(lying)), lens_(lying), defaultParams());
        assertTrue(lying.optedOut(), "D-015 on any engine");
        v.setMaker(maker);
        vm.startPrank(house);
        usd.approve(address(v), type(uint256).max);
        v.supply(SUPPLY);
        vm.stopPrank();
        vm.prank(maker);
        assertEq(v.quote(marketA, BID_YES, ASK_YES, QTY, expireNs()), PAIR, "honest until it lies");

        LyingEngine.Lie[4] memory rests =
            [LyingEngine.Lie.OverPull, LyingEngine.Lie.Rested, LyingEngine.Lie.PhantomFill, LyingEngine.Lie.WithdrawOnBuy];
        for (uint256 i; i < rests.length; ++i) {
            lying.setLie(rests[i]);
            vm.prank(maker);
            vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
            v.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        }
        lying.setLie(LyingEngine.Lie.CreditShort);
        vm.prank(maker);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        v.pull(marketA);
        lying.setLie(LyingEngine.Lie.None);
        vm.prank(maker);
        (, uint256 back) = v.pull(marketA);
        assertEq(back, PAIR);

        lying.give(address(v), uint64(QTY / 1000), uint64(QTY / 1000));
        lying.setLie(LyingEngine.Lie.MergeShort);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        v.merge(marketA);
        lying.setLie(LyingEngine.Lie.None);
        (, uint256 merged) = v.merge(marketA);
        assertEq(merged, QTY);

        lying.give(address(v), uint64(QTY / 1000), 0);
        lying.setStatus(STATUS_RESOLVED);
        lying.setLie(LyingEngine.Lie.RedeemAllShort);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        v.settle(marketA);
        lying.setLie(LyingEngine.Lie.None);
        assertEq(v.settle(marketA), QTY);
        assertEq(usd.balanceOf(address(v)), v.liquid(), "nothing booked by any lie");
        assertEq(v.totalValue(), SUPPLY + 2 * QTY, "honest flows only: 20 pairs merged at par + 20 YES paid (both gifts)");
    }

    function lens_(LyingEngine l) internal pure returns (EngineLens) {
        return EngineLens(address(l));
    }

    function _donate(uint256 amount) internal {
        usd.mint(stranger, amount);
        vm.prank(stranger);
        usd.transfer(address(vault), amount);
        donated += amount;
    }
}
