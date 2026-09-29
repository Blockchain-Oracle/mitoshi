// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../../src/engine/interfaces/IEventsEngineEvents.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import "../../src/engine/EngineTypes.sol";

/// Token I/O of the real engine over a real TIP-20: exact funding (E-33), pay-`msg.sender`-only, the donation-safe
/// ledger (E-57 rule, A.1.1) and the receive-policy pre-check on every own payout (P12, D-014).
contract CashTest is EngineFixture {
    /// Every call keeps `balanceOf(engine) == totalOwed == backing·1000 + Σcredit + ΣlockedCash` (the fixture asserts
    /// after each place/mint); walk a mixed sequence across two markets.
    function test_conservationAfterEveryCall() public {
        bytes32 second = list(START, LOCK, true);
        mint(1, 5_000);
        place(1, order(KIND_SELL_YES, 540, 3_000, ORDER_NORMAL));
        place(2, order(KIND_BUY_YES, 560, 2_000, ORDER_IOC));
        place(3, order(KIND_BUY_NO, 400, 1_000, ORDER_NORMAL));
        PlaceArgs memory o = order(KIND_BUY_YES, 700, 500, ORDER_IOC);
        o.marketId = second;
        place(4, order(KIND_BUY_YES, 300, 700, ORDER_NORMAL));
        vm.prank(who(3));
        engine.placeOrder(PlaceArgs(second, KIND_BUY_NO, ORDER_NORMAL, 0, 300, 900, LOCK, 16, 16, false, false, 0));
        assertConserved();
        place(4, o);
        vm.prank(who(1));
        engine.withdrawCredit(m, 1_000);
        assertConserved();
        vm.prank(who(1));
        engine.cancelAll(m, 16, true);
        assertConserved();
    }

    function test_takerPaysExactlyItsCostAndTheMakerIsCreditedNotPaid() public {
        mint(1, 5_000);
        place(1, order(KIND_SELL_YES, 540, 5_000, ORDER_NORMAL));
        uint256 makerBefore = usd.balanceOf(who(1));
        uint256 takerBefore = usd.balanceOf(who(2));
        PlaceResult memory r = place(2, order(KIND_BUY_YES, 560, 3_000, ORDER_IOC));
        assertEq(takerBefore - usd.balanceOf(who(2)), r.transferredIn);
        assertEq(r.transferredIn, 1_620_000);
        assertEq(usd.balanceOf(who(1)), makerBefore, "the maker is never pushed a transfer (E-34)");
        assertEq(pos(1).credit, 1_620_000);
    }

    function test_withdrawProceedsPaysTheCaller() public {
        mint(1, 100);
        place(2, order(KIND_BUY_YES, 400, 100, ORDER_NORMAL));
        uint256 before = usd.balanceOf(who(1));
        PlaceArgs memory o = order(KIND_SELL_YES, 400, 100, ORDER_IOC);
        o.withdrawProceeds = true;
        PlaceResult memory r = place(1, o);
        assertEq(r.withdrawn, 40_000);
        assertEq(usd.balanceOf(who(1)) - before, 40_000);
    }

    function test_donationIsNotUserMoney() public {
        mint(1, 1_000);
        uint256 owedBefore = totalOwed();
        usd.mint(address(engine), 12_345);
        assertEq(totalOwed(), owedBefore, "accounting never reads balanceOf");
        vm.expectEmit(true, false, false, true, address(engine));
        emit Ev.SurplusSwept(treasury, 12_345);
        assertEq(engine.sweepSurplus(), 12_345);
        assertEq(usd.balanceOf(treasury), 12_345);
        assertEq(engine.sweepSurplus(), 0);
        assertConserved();
    }

    /// P12: a receiver whose TIP-1028 receive policy would divert the payout into the ReceivePolicyGuard is refused
    /// by name on its own calls (the TIP-20 transfer itself would "succeed" into the guard).
    function test_payoutsPreCheckTheReceivePolicy() public {
        mint(1, 2_000);
        place(2, order(KIND_BUY_YES, 400, 1_000, ORDER_NORMAL));
        PlaceArgs memory o = order(KIND_SELL_YES, 400, 1_000, ORDER_IOC);
        vm.prank(who(1));
        engine.placeOrder(o); // proceeds stay as credit
        vm.prank(who(1));
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, who(1)); // reject every sender
        (bool ok, ITIP403Registry.BlockedReason why) =
            StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(usd), address(engine), who(1));
        assertFalse(ok);
        assertEq(uint8(why), uint8(ITIP403Registry.BlockedReason.RECEIVE_POLICY));
        vm.prank(who(1));
        vm.expectRevert(E.ReceivePolicyBlocked.selector);
        engine.withdrawCredit(m, 400_000);
        vm.prank(who(1));
        vm.expectRevert(E.ReceivePolicyBlocked.selector);
        engine.mergeSet(m, 1, true);
        vm.prank(who(1));
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, who(1)); // allow again
        vm.prank(who(1));
        engine.withdrawCredit(m, 400_000);
        assertConserved();
    }

    function test_pullNeedsTheCallersApproval() public {
        address stranger = makeAddr("no-approval");
        usd.mint(stranger, 1e9);
        vm.prank(stranger);
        vm.expectRevert();
        engine.mintSet(m, 10, false);
    }

    function test_reserveNodesIsPermissionless() public {
        vm.prank(makeAddr("house"));
        vm.expectEmit(false, false, false, true, address(engine));
        emit Ev.NodesReserved(4, 4);
        engine.reserveNodes(4);
        vm.expectRevert(E.InvalidQuantity.selector);
        engine.reserveNodes(0);
        // The next rest reuses a reserved node instead of growing the pool.
        PlaceResult memory r = place(1, order(KIND_BUY_YES, 400, 10, ORDER_NORMAL));
        assertEq(uint32(r.restedOrderId), 4);
    }

    function test_extsloadReadsTheLayout() public view {
        bytes32 adminSlot = bytes32(uint256(0xa6a80a4098370da14eba196d5a2b2ba0f19d6808b85f71b2c3b5753304ae1800) + 1);
        assertEq(address(uint160(uint256(engine.extsload(adminSlot)))), admin);
        bytes32[] memory slots = new bytes32[](2);
        slots[0] = adminSlot;
        slots[1] = bytes32(uint256(adminSlot) + 1);
        bytes32[] memory values = engine.extsload(slots);
        assertEq(values.length, 2);
        assertEq(values[0], engine.extsload(adminSlot));
        assertEq(engine.collateral(), address(usd));
        assertEq(engine.treasury(), treasury);
    }
}
