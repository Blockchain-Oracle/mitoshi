// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/PrivateDesk.lifecycle.t.sol — on the real engine (A.6, D-018): the
// mock's book is a real maker's levels, `poolA.resolve/voidIt` a real RedStone close + `settle` or a missed close +
// `voidExpired`, the ERC-6909 balance the desk's engine position. The engine's lot is 0.001 (Masayume's pool: 0.01),
// so 10 at 0.60 buys 16.666 contracts for 9.9996 where Masayume's bought 16.66 for 9.996; every other figure is its own.

import {Vm} from "forge-std/Vm.sol";
import {IPrivateDesk} from "../../../src/products/private/IPrivateDesk.sol";
import {PrivateTestBase} from "../harness/PrivateTestBase.sol";
import {KIND_BUY_NO} from "../../../src/engine/EngineTypes.sol";

/// @notice One private bet, end to end: the three-transaction open, the venue's three outcomes, the sweep and
///         the credit home, the refund of a slot the book refused — and the property the whole thing exists for:
///         no transaction after the charge carries the owner.
contract PrivateDeskLifecycleTest is PrivateTestBase {
    function test_openSizesTheStakeOffTheBookAndKeepsTheDustInTheSlot() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("won");
        IPrivateDesk.Preview memory q = deskContract.sizeForStake(marketA, 0, STAKE);
        // 10 at 0.60: 16.666 contracts, floored to the engine's lot (0.001) — 16.666 for 9.9996.
        assertEq(q.quantityRaw, 16_666_000);
        assertEq(q.costRaw, 9_999_600);
        assertEq(q.limitYesRaw, 600_000);
        (uint256 quantity, uint256 cost) = openFor(owner, k, STAKE, marketA, 0);
        assertEq(quantity, q.quantityRaw);
        assertEq(cost, q.costRaw);
        IPrivateDesk.Slot memory s = deskContract.slotOf(k.slotId);
        assertEq(s.quantityRaw, quantity);
        assertEq(s.balance, STAKE - cost, "the dust stays in the slot");
        assertEq(s.marketId, marketA);
        assertEq(s.expirySec, EXPIRY);
        assertEq(heldRaw(marketA, 0), quantity, "the desk holds the contracts in its engine position");
        assertEq(deskContract.pool(), 0);
        assertEq(deskContract.inSlots(), STAKE - cost);
        assertBooksBalance();
        assertConserved();
    }

    function test_wonSettledSweptCreditedWithdrawn() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("won");
        (uint256 quantity, uint256 cost) = openFor(owner, k, STAKE, marketA, 0);
        resolve(marketA, 0);
        vm.prank(stranger);
        uint256 payout = deskContract.settleSlot(k.slotId);
        assertEq(payout, quantity, "a contract pays one");
        IPrivateDesk.Slot memory s = deskContract.slotOf(k.slotId);
        assertEq(s.quantityRaw, 0);
        assertEq(s.balance, STAKE - cost + payout);
        assertBooksBalance();

        vm.startPrank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.NothingToSettle.selector, k.slotId));
        deskContract.settleSlot(k.slotId);
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        assertEq(swept, STAKE - cost + payout);
        deskContract.creditFromPool(owner, swept, k.creditKey);
        vm.stopPrank();
        assertEq(deskContract.creditedOf(owner, k.creditKey), swept);
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 10 * ONE + swept);
        uint256 before = usd.balanceOf(owner);
        vm.prank(owner);
        deskContract.withdraw(balance);
        assertEq(usd.balanceOf(owner), before + balance);
        assertEq(deskContract.totalOwed(), 0);
        assertBooksBalance();
    }

    function test_lostSettlesToNothingAndOnlyTheDustComesHome() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("lost");
        (, uint256 cost) = openFor(owner, k, STAKE, marketA, 1);
        resolve(marketA, 0);
        assertEq(deskContract.settleSlot(k.slotId), 0);
        vm.startPrank(desk);
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        assertEq(swept, STAKE - cost);
        deskContract.creditFromPool(owner, swept, k.creditKey);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.SlotEmpty.selector, k.slotId));
        deskContract.sweepSlotToPool(k.slotId);
        vm.stopPrank();
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 10 * ONE + swept);
        assertBooksBalance();
    }

    function test_voidPaysHalfAContract() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("void");
        (uint256 quantity,) = openFor(owner, k, STAKE, marketA, 0);
        resolve(marketA, 2);
        assertEq(deskContract.settleSlot(k.slotId), quantity / 2);
        assertBooksBalance();
    }

    function test_aSlotTheBookRefusedIsRefundedWithoutAMint() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("thin");
        vm.startPrank(desk);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);
        deskContract.fundSlot(k.slotId, STAKE);
        // The guard: the book moved under the quote.
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.BelowMinQuantity.selector, 16_666_000, 17_000_000));
        deskContract.mintInSlot(k.slotId, marketA, 0, 17_000_000);
        uint256 swept = deskContract.sweepSlotToPool(k.slotId);
        assertEq(swept, STAKE, "the whole stake, nothing spent");
        deskContract.creditFromPool(owner, swept, k.creditKey);
        vm.stopPrank();
        (uint256 balance,) = deskContract.budgetOf(owner);
        assertEq(balance, 20 * ONE);
        assertBooksBalance();
    }

    function test_mintRefusalsAreNamed() public {
        fund(owner, 40 * ONE, 40 * ONE);
        Keys memory k = keysFor("m");
        vm.startPrank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.SlotNotFunded.selector, k.slotId));
        deskContract.mintInSlot(k.slotId, marketA, 0, 0);
        // The band is checked at the charge, so a stake the mint would refuse never costs three sends...
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.StakeOutsideBand.selector, 30 * ONE, ONE, 25 * ONE));
        deskContract.chargeToPool(owner, 30 * ONE, k.chargeKey);
        deskContract.chargeToPool(owner, 20 * ONE, k.chargeKey);
        deskContract.fundSlot(k.slotId, 20 * ONE);
        vm.stopPrank();
        // ...and again at the mint, against the params of the moment.
        IPrivateDesk.Params memory tighter = defaultParams();
        tighter.maxStake = 15 * ONE;
        deskContract.setParams(tighter);
        vm.prank(desk);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.StakeOutsideBand.selector, 20 * ONE, ONE, 15 * ONE));
        deskContract.mintInSlot(k.slotId, marketA, 0, 0);
        deskContract.setParams(defaultParams());

        Keys memory k2 = keysFor("m2");
        vm.startPrank(desk);
        deskContract.chargeToPool(owner, STAKE, k2.chargeKey);
        deskContract.fundSlot(k2.slotId, STAKE);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.BadOutcome.selector, 2));
        deskContract.mintInSlot(k2.slotId, marketA, 2, 0);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.UnknownMarket.selector, bytes32("nope")));
        deskContract.mintInSlot(k2.slotId, bytes32("nope"), 0, 0);
        vm.warp(EXPIRY - 30);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.TooLate.selector, marketA, EXPIRY));
        deskContract.mintInSlot(k2.slotId, marketA, 0, 0);
        vm.warp(nowSec);
        deskContract.mintInSlot(k2.slotId, marketA, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.SlotAlreadyMinted.selector, k2.slotId));
        deskContract.mintInSlot(k2.slotId, marketA, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.SlotHoldsContracts.selector, k2.slotId, 16_666_000));
        deskContract.sweepSlotToPool(k2.slotId);
        vm.expectRevert(abi.encodeWithSelector(IPrivateDesk.MarketNotSettled.selector, marketA));
        deskContract.settleSlot(k2.slotId);
        vm.stopPrank();
        assertBooksBalance();
    }

    function test_theSizeNeverEscrowsMoreThanTheStake() public {
        // Asks: 10 contracts at 0.30, then plenty at 0.90. A 10 stake takes the ten (3.00) and 7.77 more at
        // 0.90; the walk's limit is 0.90, and 17.77 × 0.90 would escrow 16 — more than the slot holds. The size
        // is cut to 10 / 0.90 = 11.111 instead: ten at 0.30 and 1.111 at 0.90 for 3.9999, 9.9999 at the limit.
        clearSeeds(marketA);
        restOrder(marketA, KIND_BUY_NO, 300_000, 10 * ONE);
        restOrder(marketA, KIND_BUY_NO, 900_000, 300 * ONE);
        IPrivateDesk.Preview memory q = deskContract.sizeForStake(marketA, 0, STAKE);
        assertEq(q.quantityRaw, 11_111_000);
        assertEq(q.limitYesRaw, 900_000);
        assertLe(q.quantityRaw * q.limitYesRaw / ONE, STAKE, "escrow at the limit within the stake");
        assertEq(q.costRaw, 3_999_900);
    }

    function test_twoOwnersOneWindowShareNothingButThePool() public {
        fund(owner, 20 * ONE, 20 * ONE);
        fund(other, 20 * ONE, 20 * ONE);
        Keys memory a = keysFor("a");
        Keys memory b = keysFor("b");
        (uint256 qa,) = openFor(owner, a, STAKE, marketA, 0);
        (uint256 qb,) = openFor(other, b, 5 * ONE, marketA, 1);
        resolve(marketA, 1);
        assertEq(deskContract.settleSlot(a.slotId), 0);
        assertEq(deskContract.settleSlot(b.slotId), qb);
        assertGt(qa, 0);
        vm.startPrank(desk);
        uint256 sa = deskContract.sweepSlotToPool(a.slotId);
        uint256 sb = deskContract.sweepSlotToPool(b.slotId);
        deskContract.creditFromPool(owner, sa, a.creditKey);
        deskContract.creditFromPool(other, sb, b.creditKey);
        vm.stopPrank();
        (uint256 balA,) = deskContract.budgetOf(owner);
        (uint256 balB,) = deskContract.budgetOf(other);
        assertEq(balA, 10 * ONE + sa);
        assertEq(balB, 15 * ONE + sb);
        assertEq(deskContract.pool(), 0);
        assertBooksBalance();
    }

    /// @dev The property: after the charge, no log the desk emits carries the owner — not as a topic, not in data.
    function test_slotSideTransactionsNeverNameTheOwner() public {
        fund(owner, 20 * ONE, 20 * ONE);
        Keys memory k = keysFor("quiet");
        IPrivateDesk.Preview memory q = deskContract.sizeForStake(marketA, 0, STAKE);
        vm.prank(desk);
        deskContract.chargeToPool(owner, STAKE, k.chargeKey);

        vm.recordLogs();
        vm.startPrank(desk);
        deskContract.fundSlot(k.slotId, STAKE);
        deskContract.mintInSlot(k.slotId, marketA, 0, q.quantityRaw);
        vm.stopPrank();
        resolve(marketA, 0);
        deskContract.settleSlot(k.slotId);
        vm.prank(desk);
        deskContract.sweepSlotToPool(k.slotId);
        _assertNoLogNames(owner);

        // And the credit names the owner but not the slot.
        vm.recordLogs();
        vm.prank(desk);
        deskContract.creditFromPool(owner, STAKE, k.creditKey);
        _assertNoLogNames32(k.slotId);
    }

    function _assertNoLogNames(address who) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 asTopic = bytes32(uint256(uint160(who)));
        for (uint256 i = 0; i < logs.length; i++) {
            for (uint256 t = 0; t < logs[i].topics.length; t++) {
                assertTrue(logs[i].topics[t] != asTopic, "owner in a topic");
            }
            assertFalse(_contains(logs[i].data, abi.encode(who)), "owner in log data");
        }
    }

    function _assertNoLogNames32(bytes32 word) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            for (uint256 t = 0; t < logs[i].topics.length; t++) {
                assertTrue(logs[i].topics[t] != word, "slot in a topic");
            }
            assertFalse(_contains(logs[i].data, abi.encode(word)), "slot in log data");
        }
    }

    function _contains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length > haystack.length) return false;
        for (uint256 i = 0; i + needle.length <= haystack.length; i++) {
            bool same = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    same = false;
                    break;
                }
            }
            if (same) return true;
        }
        return false;
    }
}
