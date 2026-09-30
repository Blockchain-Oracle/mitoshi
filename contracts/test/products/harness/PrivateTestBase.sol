// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/PrivateTestBase.sol — `MockLeverageVenue` is retired (A.6, D-018): every
// slot buys off a real maker's PostOnly levels on the real engine over a real TIP-20 (`BookSeeder`), the desk holds the
// contracts in its own engine position, and a Window settles on a real RedStone close or a missed close. Same
// constants: 10 staked, a 5-minute Window, YES asks 0.60 then 0.62 and bids 0.58 then 0.55 (300 a level), a 1–25 band.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IPrivateDesk} from "../../../src/products/private/IPrivateDesk.sol";
import {PrivateDesk} from "../../../src/products/private/PrivateDesk.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract PrivateTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant STAKE = 10 * ONE;
    uint64 internal constant EXPIRY = LOCK;
    uint256 internal constant LEVEL = 300 * ONE;

    PrivateDesk internal deskContract;

    address internal desk = makeAddr("desk");
    address internal owner = makeAddr("owner");
    address internal other = makeAddr("other");
    address internal stranger = makeAddr("stranger");

    bytes32 internal marketA;
    uint64 internal nowSec;

    /// @dev The three keys one bet uses, derived the way the desk service derives them: from one secret.
    struct Keys {
        bytes32 slotId;
        bytes32 chargeKey;
        bytes32 creditKey;
    }

    function setUp() public virtual override {
        super.setUp();
        marketA = m;
        deskContract = new PrivateDesk(IERC20(address(usd)), IEventsEngine(address(engine)), lens, desk, defaultParams());
        // The desk is an engine holder like any other: the fixture's exact-conservation check covers it.
        actors.push(address(deskContract));
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        vm.warp(vm.getBlockTimestamp() + 20);
        nowSec = uint64(vm.getBlockTimestamp());

        usd.mint(owner, 1_000 * ONE);
        usd.mint(other, 1_000 * ONE);
        vm.prank(owner);
        usd.approve(address(deskContract), type(uint256).max);
        vm.prank(other);
        usd.approve(address(deskContract), type(uint256).max);
    }

    function defaultParams() internal pure returns (IPrivateDesk.Params memory) {
        return IPrivateDesk.Params({minStake: ONE, maxStake: 25 * ONE, minTimeLeftSec: 60});
    }

    /// Two levels a side, 300 contracts each, from the maker (PostOnly).
    function setBook(bytes32 mk, uint256 ask0, uint256 ask1, uint256 bid0, uint256 bid1) internal {
        clearSeeds(mk);
        restOrder(mk, KIND_BUY_NO, ask0, LEVEL);
        restOrder(mk, KIND_BUY_NO, ask1, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid0, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid1, LEVEL);
    }

    function restOrder(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(who(MAKER));
        engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_POST_ONLY, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, false, 0)
        );
    }

    function keysFor(bytes32 secret) internal pure returns (Keys memory k) {
        k.slotId = keccak256(abi.encodePacked(secret, "slot"));
        k.chargeKey = keccak256(abi.encodePacked(secret, "charge"));
        k.creditKey = keccak256(abi.encodePacked(secret, "credit"));
    }

    function fund(address actor, uint256 amount, uint256 allowance) internal {
        vm.prank(actor);
        deskContract.depositAndAllow(amount, allowance);
    }

    /// @dev The desk's three transactions, in order, guarded at the size the quote saw.
    function openFor(address actor, Keys memory k, uint256 stake, bytes32 marketId, uint8 outcomeIdx) internal returns (uint256 quantity, uint256 cost) {
        IPrivateDesk.Preview memory q = deskContract.sizeForStake(marketId, outcomeIdx, stake);
        vm.startPrank(desk);
        deskContract.chargeToPool(actor, stake, k.chargeKey);
        deskContract.fundSlot(k.slotId, stake);
        (quantity, cost) = deskContract.mintInSlot(k.slotId, marketId, outcomeIdx, q.quantityRaw);
        vm.stopPrank();
    }

    /// Settles `mk` for real: a RedStone close above (0 → Up) or below (1 → Down) the open, or (2) a void.
    function resolve(bytes32 mk, uint8 outcome) internal {
        (, uint40 expiry) = times(mk);
        if (outcome == 2) {
            if (vm.getBlockTimestamp() < uint256(expiry) + 901) vm.warp(uint256(expiry) + 901);
            engine.voidExpired(mk);
        } else {
            if (vm.getBlockTimestamp() < expiry) vm.warp(expiry);
            recordClose(mk, outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
            engine.settle(mk);
        }
    }

    /// The desk's contracts held in the engine for a side, raw.
    function heldRaw(bytes32 mk, uint8 outcomeIdx) internal view returns (uint256) {
        return uint256(outcomeIdx == 0 ? lens.positionOf(mk, address(deskContract)).yesFree : lens.positionOf(mk, address(deskContract)).noFree) * 1000;
    }

    /// @dev The wallet equals everything the desk owes: balances, the pool's float and every slot's cash (D-117).
    function assertBooksBalance() internal view {
        assertEq(usd.balanceOf(address(deskContract)), deskContract.totalOwed(), "wallet == owed + pool + inSlots");
    }
}
