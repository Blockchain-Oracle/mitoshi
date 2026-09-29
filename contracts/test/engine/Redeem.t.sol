// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/redeem.rs,
// matching/tests/examples.rs (example 8) and instructions/redeem.rs.
/// E-53…E-55 with T03/T04/T05/T09 and P12: full, partial and cranked redeems over a real TIP-20, including the
/// receive-policy and TIP-403 holds.
contract RedeemTest is EngineFixture {
    uint256 internal constant A = 1;
    uint256 internal constant D = 4;

    /// Example 3's state: A rests BUY_YES 10,000 at 620; D takes 4,000 with BUY_NO at 600 → MINT_PAIR.
    function _example3() internal {
        place(A, order(KIND_BUY_YES, 620, 10_000, ORDER_NORMAL));
        place(D, order(KIND_BUY_NO, 600, 4_000, ORDER_IOC));
        assertEq(usd.balanceOf(address(engine)), 7_720_000);
    }

    /// Settles `m`: Up (close ≥ open), Down, or void by the clock.
    function _resolve(uint8 outcome) internal {
        if (outcome == 2) {
            vm.warp(LOCK + 901);
            engine.voidExpired(m);
        } else {
            vm.warp(LOCK);
            recordClose(m, outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
            engine.settle(m);
        }
    }

    function _redeem(uint256 n) internal returns (uint64 total) {
        address a = who(n);
        uint256 before = usd.balanceOf(a);
        vm.prank(a);
        total = engine.redeem(m);
        assertEq(usd.balanceOf(a) - before, total, "paid to the holder");
        assertConserved();
    }

    /// Example 8 under Up, Down and void: A gets its 3,720,000 credit back plus the pairs' side that won; D its side.
    function test_example8UpDownVoid() public {
        uint64[3] memory aTotals = [uint64(3_720_000 + 4_000_000), 3_720_000, 3_720_000 + 2_000_000];
        uint64[3] memory dTotals = [uint64(0), 4_000_000, 2_000_000];
        for (uint8 o; o < 3; ++o) {
            uint256 snap = vm.snapshotState();
            _example3();
            _resolve(o);
            // A's resting remainder (6,000 lots) is drained by the redeem itself (T05) — no sweep needed.
            assertEq(_redeem(A), aTotals[o]);
            if (dTotals[o] == 0) {
                vm.prank(who(D));
                engine.redeem(m); // D's NO lost: the position still clears, paying 0
            } else {
                assertEq(_redeem(D), dTotals[o]);
            }
            assertEq(usd.balanceOf(address(engine)), 0, "everything owed is paid, nothing more");
            vm.revertToState(snap);
        }
    }

    function test_redeemRefusedUntilTerminal() public {
        _example3();
        vm.prank(who(D));
        vm.expectRevert(E.MarketNotTerminal.selector);
        engine.redeem(m);
        vm.warp(LOCK);
        vm.prank(who(D));
        vm.expectRevert(E.MarketNotTerminal.selector);
        engine.redeem(m);
    }

    function test_redeemDrainsOwnOrdersThenPays() public {
        _example3();
        _resolve(0);
        assertEq(pos(A).openOrders, 1);
        vm.expectEmit(true, false, true, false, address(engine));
        emit Ev.OrderRemoved(m, 0, who(A), 0, 0, 0, 0, REMOVE_REDEEM_DRAIN);
        _redeem(A);
        assertEq(pos(A).openOrders, 0);
        assertEq(pos(A).orderHead, 0);
    }

    function test_secondRedeemRefused() public {
        _example3();
        _resolve(0);
        _redeem(A);
        vm.prank(who(A));
        vm.expectRevert(E.NothingToRedeem.selector);
        engine.redeem(m);
        vm.prank(who(9));
        vm.expectRevert(E.NothingToRedeem.selector);
        engine.redeem(m);
        // The drained position is deleted: both slots are zero (storage credits for the next market, A.1.1).
        bytes32 base = keccak256(abi.encode(who(A), keccak256(abi.encode(uint256(1), uint256(EngineStorage.SLOT) + EngineStorage.OFF_POSITIONS))));
        assertEq(engine.extsload(base), bytes32(0));
        assertEq(engine.extsload(bytes32(uint256(base) + 1)), bytes32(0));
    }

    /// T04: any holder may redeem part of one outcome; credit is untouched; the rest redeems in full later.
    function test_partialRedeemAnyHolder() public {
        mint(3, 2_000);
        _resolve(0);
        vm.startPrank(who(3));
        vm.expectRevert(E.InsufficientOutcome.selector);
        engine.redeemPartial(m, 0, 2_001);
        vm.expectRevert(E.InvalidOrderArgs.selector);
        engine.redeemPartial(m, 2, 1);
        vm.expectRevert(E.InvalidQuantity.selector);
        engine.redeemPartial(m, 0, 0);
        assertEq(engine.redeemPartial(m, 0, 1_500), 1_500_000);
        assertEq(engine.redeemPartial(m, 1, 2_000), 0);
        vm.stopPrank();
        assertEq(pos(3).yesFree, 500);
        assertEq(pos(3).noFree, 0);
        assertEq(_redeem(3), 500_000);
        assertEq(usd.balanceOf(address(engine)), 0);
    }

    function test_redeemForPaysHolder() public {
        _example3();
        _resolve(1);
        address crank = makeAddr("settler");
        uint256 before = usd.balanceOf(who(D));
        vm.prank(crank);
        vm.expectEmit(true, true, true, true, address(engine));
        emit Ev.Redeemed(m, 7, who(D), crank, 0, 4_000, 4_000_000, 0, 4_000_000, false, false);
        (uint64 paid, bool held) = engine.redeemFor(m, who(D));
        assertEq(paid, 4_000_000);
        assertFalse(held);
        assertEq(usd.balanceOf(who(D)) - before, 4_000_000);
        assertEq(usd.balanceOf(crank), 0, "a crank is never paid");
        assertConserved();
    }

    /// T09: products opt out of third-party cranks (D-015); their own redeem still works.
    function test_crankOptOut() public {
        _example3();
        _resolve(1);
        vm.prank(who(D));
        engine.setCrankOptOut(true);
        vm.expectRevert(E.CrankRefused.selector);
        engine.redeemFor(m, who(D));
        assertEq(_redeem(D), 4_000_000);
        bytes32 slot = keccak256(abi.encode(who(D), uint256(EngineStorage.SLOT) + EngineStorage.OFF_CRANK_OPT_OUT));
        assertEq(uint256(engine.extsload(slot)), 1);
        vm.prank(who(D));
        engine.setCrankOptOut(false);
        assertEq(uint256(engine.extsload(slot)), 0);
    }

    /// P12 on the crank: a receive policy that would divert the payout holds it as the holder's credit instead.
    function test_redeemForHoldsBlockedPayoutAsCredit() public {
        _example3();
        _resolve(1);
        vm.prank(who(D));
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, who(D));
        uint256 before = usd.balanceOf(who(D));
        (uint64 paid, bool held) = engine.redeemFor(m, who(D));
        assertEq(paid, 0);
        assertTrue(held);
        assertEq(usd.balanceOf(who(D)), before, "nothing diverted into the guard");
        assertEq(pos(D).credit, 4_000_000);
        assertEq(pos(D).noFree, 0);
        assertConserved();
        vm.prank(who(D));
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, who(D));
        vm.prank(who(D));
        engine.withdrawCredit(m, 4_000_000);
        assertEq(usd.balanceOf(who(D)) - before, 4_000_000);
        assertConserved();
    }

    /// A TIP-403 token policy that blacklists the holder makes the transfer revert: the crank holds instead of failing.
    function test_redeemForHoldsWhenTheTokenPolicyBlacklists() public {
        _example3();
        _resolve(1);
        address[] memory list = new address[](1);
        list[0] = who(D);
        uint64 policy = StdPrecompiles.TIP403_REGISTRY.createPolicyWithAccounts(
            address(this), ITIP403Registry.PolicyType.BLACKLIST, list
        );
        usd.changeTransferPolicyId(policy);
        (uint64 paid, bool held) = engine.redeemFor(m, who(D));
        assertEq(paid, 0);
        assertTrue(held);
        assertEq(pos(D).credit, 4_000_000);
        assertConserved();
        StdPrecompiles.TIP403_REGISTRY.modifyPolicyBlacklist(policy, who(D), false);
        vm.prank(who(D));
        engine.withdrawCredit(m, 4_000_000);
        assertConserved();
    }

    function test_ownPayoutRefusedByReceivePolicy() public {
        _example3();
        _resolve(1);
        vm.prank(who(D));
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, who(D));
        vm.prank(who(D));
        vm.expectRevert(E.ReceivePolicyBlocked.selector);
        engine.redeem(m);
    }

    /// E-18: Halted never blocks a redeem.
    function test_haltedNeverBlocksRedeem() public {
        _example3();
        _resolve(0);
        vm.prank(admin);
        engine.setMode(MODE_HALTED);
        _redeem(A);
    }
}
