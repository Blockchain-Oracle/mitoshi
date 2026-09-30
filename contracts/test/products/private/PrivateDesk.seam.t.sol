// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {IPrivateDesk} from "../../../src/products/private/IPrivateDesk.sol";
import {PrivateDesk} from "../../../src/products/private/PrivateDesk.sol";
import {EngineSeam} from "../../../src/products/shared/EngineSeam.sol";
import {PayoutCheck} from "../../../src/products/shared/Payouts.sol";
import {LyingEngine} from "../harness/LyingEngine.sol";
import {PrivateTestBase} from "../harness/PrivateTestBase.sol";

/// The Tempo seam of the private desk (A.4.4): Agari's D-117 (a credit needs a budget; three counters equal to the
/// wallet; the engine's report checked against custody), P12 on the owner's withdrawal, and construction.
contract PrivateDeskSeamTest is PrivateTestBase {
    // ------------------------------------------------------------------ D-117: a credit needs a budget

    function test_D117_theDeskCreditsNobodyWhoNeverDeposited() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("won");
        openFor(owner, k, STAKE, marketA, 0);
        resolve(marketA, 0);
        deskContract.settleSlot(k.slotId);
        vm.startPrank(desk);
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        // A compromised desk key crediting an address of its choosing — itself or a stranger — is refused.
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NoBudget.selector, stranger));
        deskContract.creditFromPool(stranger, swept, k.creditKey);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NoBudget.selector, desk));
        deskContract.creditFromPool(desk, swept, k.creditKey);
        deskContract.creditFromPool(owner, swept, k.creditKey);
        vm.stopPrank();
        assertBooksBalance();
    }

    function test_D117_aBudgetOutlivesItsBalance() public {
        fund(owner, 10 * ONE, 10 * ONE);
        vm.prank(owner);
        deskContract.withdraw(10 * ONE);
        assertTrue(deskContract.hasBudget(owner), "an owner who withdrew everything can still be credited a payout");
        assertFalse(deskContract.hasBudget(stranger));
        fund(other, 10 * ONE, 10 * ONE);
        Keys memory k = keysFor("x");
        vm.startPrank(desk);
        deskContract.chargeToPool(other, 5 * ONE, k.chargeKey);
        deskContract.creditFromPool(owner, 5 * ONE, k.creditKey);
        vm.stopPrank();
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 5 * ONE);
        assertBooksBalance();
    }

    /// The three counters and each sub-sum after every step of a bet, including a dishonest desk asking for more.
    function test_D117_threeCountersEqualTheWalletAtEveryStep() public {
        fund(owner, 30 * ONE, 30 * ONE);
        Keys memory k = keysFor("steps");
        _check(30 * ONE, 0, 0);
        vm.startPrank(desk);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        _check(20 * ONE, STAKE, 0);
        deskContract.fundSlot(k.slotId, STAKE);
        _check(20 * ONE, 0, STAKE);
        (uint256 q,) = deskContract.mintInSlot(k.slotId, marketA, 0, 0);
        uint256 dust = deskContract.slotOf(k.slotId).balance;
        _check(20 * ONE, 0, dust);
        vm.stopPrank();
        resolve(marketA, 0);
        deskContract.settleSlot(k.slotId);
        _check(20 * ONE, 0, dust + q);
        vm.startPrank(desk);
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        _check(20 * ONE, swept, 0);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.PoolShort.selector, swept + 1, swept));
        deskContract.creditFromPool(owner, swept + 1, k.creditKey);
        deskContract.creditFromPool(owner, swept, k.creditKey);
        _check(20 * ONE + swept, 0, 0);
        vm.stopPrank();
        assertConserved();
    }

    function _check(uint256 owed_, uint256 pool_, uint256 inSlots_) internal view {
        assertEq(deskContract.owed(), owed_, "owed");
        assertEq(deskContract.pool(), pool_, "pool");
        assertEq(deskContract.inSlots(), inSlots_, "inSlots");
        assertBooksBalance();
    }

    // ------------------------------------------------------------------ D-117: the engine's report against custody

    function _lying() internal returns (LyingEngine lying, PrivateDesk d) {
        lying = new LyingEngine(IERC20(address(usd)));
        d = new PrivateDesk(IERC20(address(usd)), IEventsEngine(address(lying)), IEngineLens(address(lying)), desk, defaultParams());
        usd.mint(address(lying), 1_000_000 * ONE);
        vm.startPrank(owner);
        usd.approve(address(d), type(uint256).max);
        d.depositAndAllow(100 * ONE, 100 * ONE);
        vm.stopPrank();
    }

    function _fundSlot(PrivateDesk d, bytes32 secret) internal returns (Keys memory k) {
        k = keysFor(secret);
        vm.startPrank(desk);
        d.chargeToPool(owner, STAKE, k.chargeKey);
        d.fundSlot(k.slotId, STAKE);
        vm.stopPrank();
    }

    function test_D117_everyMintIsMeasured() public {
        LyingEngine.Lie[5] memory lies =
            [LyingEngine.Lie.PhantomFill, LyingEngine.Lie.OverPull, LyingEngine.Lie.Rested, LyingEngine.Lie.WithdrawOnBuy, LyingEngine.Lie.CreditDrift];
        for (uint256 i; i < lies.length; ++i) {
            (LyingEngine lying, PrivateDesk d) = _lying();
            Keys memory k = _fundSlot(d, bytes32(i));
            lying.setLie(lies[i]);
            vm.prank(desk);
            vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
            d.mintInSlot(k.slotId, bytes32("w"), 0, 0);
        }
    }

    function test_D117_everySettlementIsMeasured() public {
        (LyingEngine lying, PrivateDesk d) = _lying();
        Keys memory k = _fundSlot(d, "s");
        vm.prank(desk);
        (uint256 q,) = d.mintInSlot(k.slotId, bytes32("w"), 0, 0);
        lying.setStatus(4);
        lying.setLie(LyingEngine.Lie.RedeemShort);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        d.settleSlot(k.slotId);
        lying.setLie(LyingEngine.Lie.None);
        assertEq(d.settleSlot(k.slotId), q, "an honest engine pays the slot");
        assertEq(usd.balanceOf(address(d)), d.totalOwed());
    }

    // ------------------------------------------------------------------ P12 and the sweep

    function test_P12_anOwnersWithdrawRefusesWhileBlocked() public {
        fund(owner, 10 * ONE, 0);
        vm.startPrank(owner);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, owner));
        deskContract.withdraw(10 * ONE);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, owner);
        deskContract.withdraw(10 * ONE);
        vm.stopPrank();
        assertBooksBalance();
    }

    function test_sweep_findsNoCreditOnTheRealEngine() public {
        fund(owner, 20 * ONE, 20 * ONE);
        openFor(owner, keysFor("sw"), STAKE, marketA, 0);
        assertEq(deskContract.sweep(marketA), 0);
        assertEq(lens.creditOf(marketA, address(deskContract)), 0);
        assertBooksBalance();
    }

    // ------------------------------------------------------------------ construction: the venue is structural

    function test_constructor_checksCollateralLensApprovesAndOptsOut() public {
        assertTrue(lens.crankOptedOut(address(deskContract)), "D-015");
        assertEq(usd.allowance(address(deskContract), address(engine)), type(uint256).max, "approved once");
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.WrongCollateral.selector, address(usd)));
        new PrivateDesk(IERC20(makeAddr("other-usd")), IEventsEngine(address(engine)), lens, desk, defaultParams());
        EngineLens otherLens = new EngineLens(makeAddr("other-engine"));
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.WrongLens.selector, address(otherLens)));
        new PrivateDesk(IERC20(address(usd)), IEventsEngine(address(engine)), IEngineLens(address(otherLens)), desk, defaultParams());
        vm.expectRevert(IPrivateDesk.ZeroAddress.selector);
        new PrivateDesk(IERC20(address(usd)), IEventsEngine(address(engine)), lens, address(0), defaultParams());
    }
}
