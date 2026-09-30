// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/PrivateDesk.budget.t.sol — on the real engine (A.6, D-018). One change
// with Agari's D-117 (a credit needs a budget): the desk crediting ITSELF, an address that never deposited, now refuses
// `NoBudget` before the pool is even consulted; the pool-short refusals are proven against the owner instead.

import {IPrivateDesk} from "../../../src/products/private/IPrivateDesk.sol";
import {PrivateTestBase} from "../harness/PrivateTestBase.sol";

/// @notice The owner's side: a balance only its depositor withdraws, an allowance the desk spends inside, and
///         the desk's own limits — one charge per key, nothing over the allowance, nothing the pool does not hold.
contract PrivateDeskBudgetTest is PrivateTestBase {
    function test_depositAndAllowThenWithdrawPaysTheCallerOnly() public {
        fund(owner, 50 * ONE, 20 * ONE);
        (uint256 balance, uint256 allowance) = deskContract.budgetOf(owner);
        assertEq(balance, 50 * ONE);
        assertEq(allowance, 20 * ONE);
        assertEq(deskContract.owed(), 50 * ONE);
        assertBooksBalance();

        uint256 before = usd.balanceOf(owner);
        vm.prank(owner);
        deskContract.withdraw(30 * ONE);
        assertEq(usd.balanceOf(owner), before + 30 * ONE);
        (balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 20 * ONE);
        assertBooksBalance();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.Insufficient.selector, 21 * ONE, 20 * ONE));
        deskContract.withdraw(21 * ONE);
    }

    function test_zeroDepositIsAReallow() public {
        fund(owner, 10 * ONE, 10 * ONE);
        fund(owner, 0, 3 * ONE);
        (uint256 balance, uint256 allowance) = deskContract.budgetOf(owner);
        assertEq(balance, 10 * ONE);
        assertEq(allowance, 3 * ONE);
        vm.prank(owner);
        deskContract.revoke();
        (, allowance) = deskContract.budgetOf(owner);
        assertEq(allowance, 0);
    }

    function test_nobodyElseCanWithdrawAnOwnersBalance() public {
        fund(owner, 10 * ONE, 10 * ONE);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.Insufficient.selector, ONE, 0));
        deskContract.withdraw(ONE);
        vm.prank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.Insufficient.selector, ONE, 0));
        deskContract.withdraw(ONE);
    }

    function test_chargeSpendsTheAllowanceAndTheBalanceTogether() public {
        fund(owner, 30 * ONE, 15 * ONE);
        Keys memory k = keysFor("a");
        vm.prank(desk);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        (uint256 balance, uint256 allowance) = deskContract.budgetOf(owner);
        assertEq(balance, 20 * ONE);
        assertEq(allowance, 5 * ONE);
        assertEq(deskContract.pool(), STAKE);
        assertEq(deskContract.chargedOf(owner, k.chargeKey), STAKE);
        assertBooksBalance();
    }

    function test_chargeRefusalsAreNamed() public {
        fund(owner, 12 * ONE, 15 * ONE);
        Keys memory k = keysFor("b");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NotDesk.selector, stranger));
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);

        vm.startPrank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.Insufficient.selector, 13 * ONE, 12 * ONE));
        deskContract.chargeToPool(owner, 13 * ONE, k.chargeKey);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.KeyUsed.selector, k.chargeKey));
        deskContract.chargeToPool(owner, ONE, k.chargeKey);
        // 2 left, allowance 5 left: over the balance first.
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.Insufficient.selector, 3 * ONE, 2 * ONE));
        deskContract.chargeToPool(owner, 3 * ONE, keysFor("c").chargeKey);
        vm.stopPrank();

        fund(owner, 20 * ONE, 4 * ONE);
        vm.prank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.OverAllowance.selector, 5 * ONE, 4 * ONE));
        deskContract.chargeToPool(owner, 5 * ONE, keysFor("c").chargeKey);
    }

    function test_oneCreditPerKeyAndTheBandAtTheCharge() public {
        fund(owner, 30 * ONE, 30 * ONE);
        Keys memory k = keysFor("k");
        vm.startPrank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.StakeOutsideBand.selector, 26 * ONE, ONE, 25 * ONE));
        deskContract.chargeToPool(owner, 26 * ONE, k.chargeKey);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        deskContract.fundSlot(k.slotId, STAKE);
        deskContract.sweepSlotToPool(k.slotId);
        deskContract.creditFromPool(owner, 4 * ONE, k.creditKey);
        // The rest of the pool is there, but this key has paid: a racing second process is refused, not paid twice.
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.KeyUsed.selector, k.creditKey));
        deskContract.creditFromPool(owner, 6 * ONE, k.creditKey);
        deskContract.creditFromPool(owner, 6 * ONE, keysFor("k2").creditKey);
        vm.stopPrank();
        assertEq(deskContract.creditedOf(owner, k.creditKey), 4 * ONE);
        assertEq(deskContract.pool(), 0);
        assertBooksBalance();
    }

    function test_theDeskCannotFundOrCreditBeyondThePool() public {
        fund(owner, 10 * ONE, 10 * ONE);
        Keys memory k = keysFor("d");
        vm.startPrank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.PoolShort.selector, ONE, 0));
        deskContract.fundSlot(k.slotId, ONE);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NoBudget.selector, desk));
        deskContract.creditFromPool(desk, ONE, k.creditKey);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.PoolShort.selector, ONE, 0));
        deskContract.creditFromPool(owner, ONE, k.creditKey);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        deskContract.fundSlot(k.slotId, STAKE);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.SlotAlreadyFunded.selector, k.slotId));
        deskContract.fundSlot(k.slotId, ONE);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.PoolShort.selector, ONE, 0));
        deskContract.creditFromPool(owner, ONE, k.creditKey);
        vm.stopPrank();
        assertBooksBalance();
    }

    function test_pauseStopsChargesAndMintsOnly() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("e");
        vm.startPrank(desk);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        deskContract.fundSlot(k.slotId, STAKE);
        vm.stopPrank();
        deskContract.setPaused(true);
        vm.startPrank(desk);
        vm.expectRevert(IPrivateDesk.IsPaused.selector);
        deskContract.chargeToPool(owner, ONE, keysFor("f").chargeKey);
        vm.expectRevert(IPrivateDesk.IsPaused.selector);
        deskContract.mintInSlot(k.slotId, marketA, 0, 0);
        // The way home never pauses: an unminted slot sweeps back and credits.
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        assertEq(swept, STAKE);
        deskContract.creditFromPool(owner, swept, k.creditKey);
        vm.stopPrank();
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 20 * ONE);
        vm.prank(owner);
        deskContract.withdraw(20 * ONE);
        assertBooksBalance();
    }

    function test_adminControls() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NotAdmin.selector, stranger));
        deskContract.setDesk(stranger);
        vm.expectRevert(IPrivateDesk.ZeroAddress.selector);
        deskContract.setDesk(address(0));
        deskContract.setDesk(other);
        assertEq(deskContract.desk(), other);
        vm.prank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NotDesk.selector, desk));
        deskContract.fundSlot(bytes32("x"), ONE);

        IPrivateDesk.Params memory bad = defaultParams();
        bad.maxStake = bad.minStake - 1;
        vm.expectRevert(IPrivateDesk.BadParams.selector);
        deskContract.setParams(bad);
        deskContract.setAdmin(other);
        assertEq(deskContract.admin(), other);
    }
}
