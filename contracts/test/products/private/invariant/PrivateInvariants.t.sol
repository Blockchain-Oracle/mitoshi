// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {MarketRef, PositionView} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {IPrivateDesk} from "../../../../src/products/private/IPrivateDesk.sol";
import {PrivateTestBase} from "../../harness/PrivateTestBase.sol";
import {PrivateHandler} from "./PrivateHandler.sol";
import "../../../../src/engine/EngineTypes.sol";

/// The private desk's three-counter conservation (Agari D-117) over random sequences on the real engine:
/// - `invariant_threeCountersEqualTheWallet`: `balanceOf(desk) == owed + pool + inSlots` after every call;
/// - `invariant_subSums`: `owed == Σ owner balances`, `inSlots == Σ slot balances`, and the desk's engine position per
///   Window and side is exactly the unsettled slots' contracts there (nothing unbooked, nothing lost), plus the
///   engine's own exact conservation over every holder;
/// `afterInvariant` settles every Window and slot, sweeps every slot, credits the whole pool back to an owner, and has
/// every owner withdraw everything: the desk ends holding nothing.
/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 200
contract PrivateInvariantsTest is PrivateTestBase {
    PrivateHandler internal handler;
    address[] internal ownersList;
    bytes32[] internal ws;
    uint256 internal constant HORIZON = START + 1_500;

    function setUp() public override {
        super.setUp();
        ws.push(marketA);
        ws.push(list(START, START + 600, true));
        for (uint256 k = 1; k < ws.length; ++k) {
            (, uint40 lockAt) = _lockOf(ws[k]);
            vm.startPrank(who(MAKER));
            engine.placeOrder(PlaceArgs(ws[k], KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 600, 300_000, lockAt, 16, 16, false, false, 0));
            engine.placeOrder(PlaceArgs(ws[k], KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 580, 300_000, lockAt, 16, 16, false, false, 0));
            vm.stopPrank();
        }
        ownersList.push(owner);
        ownersList.push(other);
        ownersList.push(stranger);
        usd.mint(stranger, 1_000 * ONE);
        vm.prank(stranger);
        usd.approve(address(deskContract), type(uint256).max);
        handler = new PrivateHandler(deskContract, IEventsEngine(address(engine)), lens, desk, ownersList, ws, HORIZON);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = PrivateHandler.step.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_threeCountersEqualTheWallet() public view {
        assertEq(usd.balanceOf(address(deskContract)), deskContract.owed() + deskContract.pool() + deskContract.inSlots(), "wallet == owed + pool + inSlots");
    }

    function invariant_subSums() public {
        uint256 owed;
        for (uint256 i; i < ownersList.length; ++i) owed += deskContract.balanceOf(ownersList[i]);
        assertEq(deskContract.owed(), owed, "owed == sum of owner balances");
        uint256 inSlots;
        uint256[2][] memory held = new uint256[2][](ws.length);
        for (uint256 s; s < handler.slotCount(); ++s) {
            IPrivateDesk.Slot memory slot = deskContract.slotOf(handler.slots(s));
            inSlots += slot.balance;
            for (uint256 k; k < ws.length; ++k) if (slot.marketId == ws[k]) held[k][slot.outcomeIdx] += slot.quantityRaw;
        }
        assertEq(deskContract.inSlots(), inSlots, "inSlots == sum of slot balances");
        for (uint256 k; k < ws.length; ++k) {
            PositionView memory p = lens.positionOf(ws[k], address(deskContract));
            assertEq(uint256(p.yesFree) * 1000, held[k][0], "desk YES == unsettled slots' YES");
            assertEq(uint256(p.noFree) * 1000, held[k][1], "desk NO == unsettled slots' NO");
            assertEq(uint256(p.credit) + p.lockedCash + p.openOrders, 0, "an IOC taker holds nothing else");
        }
        assertConserved();
    }

    function afterInvariant() public {
        emit log_named_uint("desk calls that succeeded", handler.ok());
        emit log_named_uint("calls refused", handler.refused());
        vm.warp(HORIZON + 901);
        for (uint256 k; k < ws.length; ++k) {
            MarketRef memory r = lens.marketRef(ws[k]);
            if (r.state == STATE_OPEN) engine.voidExpired(ws[k]);
        }
        vm.startPrank(desk);
        for (uint256 s; s < handler.slotCount(); ++s) {
            bytes32 id = handler.slots(s);
            IPrivateDesk.Slot memory slot = deskContract.slotOf(id);
            if (slot.quantityRaw != 0) deskContract.settleSlot(id);
            if (deskContract.slotOf(id).balance != 0) deskContract.sweepSlotToPool(id);
        }
        uint256 pool = deskContract.pool();
        if (pool != 0) {
            if (!deskContract.hasBudget(owner)) {
                vm.stopPrank();
                fund(owner, ONE, 0);
                vm.startPrank(desk);
            }
            deskContract.creditFromPool(owner, deskContract.pool(), keccak256("final-credit"));
        }
        vm.stopPrank();
        assertEq(deskContract.inSlots(), 0);
        assertEq(deskContract.pool(), 0);
        for (uint256 i; i < ownersList.length; ++i) {
            uint256 bal = deskContract.balanceOf(ownersList[i]);
            if (bal == 0) continue;
            vm.prank(ownersList[i]);
            deskContract.withdraw(bal);
        }
        assertEq(deskContract.owed(), 0);
        assertEq(usd.balanceOf(address(deskContract)), 0, "the desk ends holding nothing");
        for (uint256 k; k < ws.length; ++k) {
            PositionView memory p = lens.positionOf(ws[k], address(deskContract));
            assertEq(uint256(p.yesFree) + p.noFree + p.credit + p.lockedCash, 0, "nothing left in the engine");
        }
        assertConserved();
    }
}
