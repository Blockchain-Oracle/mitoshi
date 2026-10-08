// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {EventVaultV2} from "../../../src/products/vault/EventVaultV2.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {VaultExits} from "../../../src/products/vault/VaultExits.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

/// The EXIT grant (S24.1, D-193): an owner lets an exit keeper sell their Trading Balance position with the app closed.
/// The keeper picks the moment; the contract picks the lowest price — the Window's fair value at a signed RedStone spot
/// (the proof, never the preview) less the owner's tolerance. Proceeds are the owner's; the grant has no budget, and an
/// EXIT actor can never buy or sell through `placeFor`.
contract EventVaultExitsTest is VaultTestBase {
    uint64 internal constant SIGMA = 18_531;
    /// The suites' clocks: the book agrees with this spot (fair P(Up) ≈ 0.59); this one has crashed (≈ 0.03).
    uint256 internal constant BOOK_SPOT_E8 = 36_525_000_000;
    uint256 internal constant CRASH_SPOT_E8 = 36_300_000_000;
    uint16 internal constant TOL = 500;

    EventVaultV2 internal v2;
    FairValueGuard internal guard;
    address internal keeper = makeAddr("keeper");

    function setUp() public override {
        super.setUp();
        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(lens.marketRef(market).ticker, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        guard.setSigma(lens.marketRef(market).seriesId, SIGMA);
        v2 = new EventVaultV2(IERC20(address(usd)), IEventsEngine(address(engine)), lens, guard);
        actors.push(address(v2));
        vm.startPrank(owner);
        usd.approve(address(v2), type(uint256).max);
        v2.deposit(100 * ONE);
        vm.stopPrank();
        // The owner holds 10 Up, bought at 0.60 from their own balance.
        book(market, 0, true);
        vm.prank(owner);
        v2.place(market, 0, true, 650_000, 10 * ONE, EXPIRE_NS);
        assertEq(v2.positionOf(owner, yes()), 10 * ONE);
        // A bid at 0.58 for the keeper's sale.
        seed(market, false, 580, BOOK_DEPTH);
    }

    function yes() internal view returns (uint256) {
        return v2.outcomeId(market, 0);
    }

    function proof(uint256 spotE8) internal view returns (bytes memory) {
        return PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp());
    }

    function grantExit(bytes32 scope, uint16 tol) internal returns (uint256 id) {
        vm.prank(owner);
        id = v2.grantExit(keeper, scope, uint64(vm.getBlockTimestamp() + 1 days), tol);
    }

    function test_keeperSellsAtOrAboveTheFloor_proceedsAreTheOwners() public {
        uint256 id = grantExit(bytes32(0), TOL);
        assertEq(v2.exitToleranceBps(id), TOL);
        IEventVault.Grant memory g = v2.grantOf(id);
        assertEq(uint8(g.kind), uint8(IEventVault.GrantKind.EXIT));
        assertEq(g.budget, 0);

        uint256 floor = v2.exitFloorRaw(id, market, 0, proof(BOOK_SPOT_E8));
        assertGt(floor, 540_000, "fair ~0.59 less 5 %");
        assertLt(floor, 580_000, "under the bid, so the keeper can sell");
        // The keeper's limit is the floor rounded UP to the engine's tick grid (still at or above it).
        uint256 tickBase = lens.marketRef(market).tickBase;
        uint256 limit = (floor + tickBase - 1) / tickBase * tickBase;
        uint256 before = v2.accountOf(owner).available;
        uint256 keeperBefore = usd.balanceOf(keeper);
        vm.prank(keeper);
        (uint256 cash, uint256 sold) = v2.exitFor(id, market, 0, limit, 10 * ONE, EXPIRE_NS, proof(BOOK_SPOT_E8));
        assertEq(sold, 10 * ONE);
        assertEq(cash, 5_800_000, "10 at the 0.58 bid");
        assertEq(v2.accountOf(owner).available, before + cash, "proceeds land in the owner's balance");
        assertEq(v2.positionOf(owner, yes()), 0);
        assertEq(usd.balanceOf(keeper), keeperBefore, "the keeper is paid nothing");
    }

    function test_belowTheFloorIsRefused() public {
        uint256 id = grantExit(bytes32(0), TOL);
        uint256 floor = v2.exitFloorRaw(id, market, 0, proof(BOOK_SPOT_E8));
        bytes memory p = proof(BOOK_SPOT_E8);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.BelowFairFloor.selector, floor - 1, floor));
        v2.exitFor(id, market, 0, floor - 1, 10 * ONE, EXPIRE_NS, p);
    }

    function test_aCrashedSignedSpotLowersTheFloor_theStopLossCanFire() public {
        uint256 id = grantExit(bytes32(0), TOL);
        uint256 calm = v2.exitFloorRaw(id, market, 0, proof(BOOK_SPOT_E8));
        uint256 crashed = v2.exitFloorRaw(id, market, 0, proof(CRASH_SPOT_E8));
        assertLt(crashed, calm / 10, "the floor follows the signed spot, not the keeper's word");
        seed(market, false, 50, BOOK_DEPTH);
        vm.prank(keeper);
        (uint256 cash,) = v2.exitFor(id, market, 0, 50_000, 10 * ONE, EXPIRE_NS, proof(CRASH_SPOT_E8));
        assertEq(cash, 500_000);
    }

    function test_theGrantHasNoBudgetAndNoOtherPower() public {
        uint256 id = grantExit(bytes32(0), TOL);
        // `placeFor` is closed to it: no buy, and no sale around the floor.
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.ExitGrantSellsOnly.selector, id));
        v2.placeFor(id, market, 0, false, 10_000, 10 * ONE, EXPIRE_NS);
        // An EXIT grant can't be given a budget through `grant`.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.ExitGrantHasNoBudget.selector, ONE));
        v2.grant(IEventVault.GrantKind.EXIT, keeper, caps(0, 0, 0, 0), uint64(vm.getBlockTimestamp() + 1 days), ONE);
        // The tolerance is bounded.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.BadTolerance.selector, uint16(2_001)));
        v2.grantExit(keeper, bytes32(0), uint64(vm.getBlockTimestamp() + 1 days), 2_001);
    }

    function test_onlyItsActor_onlyAnExitGrant_onlyWhileLive_onlyInScope() public {
        uint256 id = grantExit(bytes32(0), TOL);
        bytes memory p = proof(BOOK_SPOT_E8);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.NotGrantActor.selector, id, stranger));
        v2.exitFor(id, market, 0, 570_000, 10 * ONE, EXPIRE_NS, p);

        vm.prank(owner);
        uint256 session = v2.grant(IEventVault.GrantKind.SESSION, keeper, caps(ONE, ONE, 1, 0), uint64(vm.getBlockTimestamp() + 1 days), 0);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.NotExitGrant.selector, session));
        v2.exitFor(session, market, 0, 570_000, 10 * ONE, EXPIRE_NS, p);

        uint256 scoped = grantExit(keccak256("another Window"), TOL);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OutsideGrantMarket.selector, scoped, market));
        v2.exitFor(scoped, market, 0, 570_000, 10 * ONE, EXPIRE_NS, p);

        vm.prank(owner);
        v2.revoke(scoped);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantIsRevoked.selector, scoped));
        v2.exitFor(scoped, market, 0, 570_000, 10 * ONE, EXPIRE_NS, p);
    }

    function test_neverSellsMoreThanTheOwnerHolds() public {
        uint256 id = grantExit(bytes32(0), TOL);
        bytes memory p = proof(BOOK_SPOT_E8);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, 11 * ONE, 10 * ONE));
        v2.exitFor(id, market, 0, 570_000, 11 * ONE, EXPIRE_NS, p);
    }

    /// Whatever limit and size the keeper sends, a sale either reverts or pays the owner at least the floor for every
    /// contract sold, and nothing reaches the keeper.
    function testFuzz_aSalePaysTheOwnerAtLeastTheFloor(uint256 priceRaw, uint256 quantity) public {
        priceRaw = bound(priceRaw, 1, ONE - 1);
        quantity = bound(quantity, 1, 10) * ONE;
        uint256 id = grantExit(bytes32(0), TOL);
        bytes memory p = proof(BOOK_SPOT_E8);
        uint256 floor = v2.exitFloorRaw(id, market, 0, p);
        uint256 before = v2.accountOf(owner).available;
        uint256 keeperBefore = usd.balanceOf(keeper);
        vm.prank(keeper);
        try v2.exitFor(id, market, 0, priceRaw, quantity, EXPIRE_NS, p) returns (uint256 cash, uint256 sold) {
            assertGe(priceRaw, floor);
            assertGe(cash * ONE, floor * sold, "paid at least the floor per contract");
            assertEq(v2.accountOf(owner).available, before + cash);
        } catch {
            assertEq(v2.accountOf(owner).available, before);
        }
        assertEq(usd.balanceOf(keeper), keeperBefore);
    }
}
