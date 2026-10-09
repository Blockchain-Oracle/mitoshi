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
/// (the proof, never the preview) less the wider of the owner's tolerance share and absolute slack (D-213). Proceeds are
/// the owner's; the grant has no budget, and an EXIT actor can never buy or sell through `placeFor`.
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
        id = grantExit(scope, tol, 0);
    }

    function grantExit(bytes32 scope, uint16 tol, uint16 slack) internal returns (uint256 id) {
        vm.prank(owner);
        id = v2.grantExit(keeper, scope, uint64(vm.getBlockTimestamp() + 1 days), tol, slack);
    }

    function test_keeperSellsAtOrAboveTheFloor_proceedsAreTheOwners() public {
        uint256 id = grantExit(bytes32(0), TOL);
        assertEq(v2.exitToleranceBps(id), TOL);
        assertEq(v2.exitSlackBps(id), 0);
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
        v2.grantExit(keeper, bytes32(0), uint64(vm.getBlockTimestamp() + 1 days), 2_001, 0);
        // So is the slack.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.BadSlack.selector, uint16(1_501)));
        v2.grantExit(keeper, bytes32(0), uint64(vm.getBlockTimestamp() + 1 days), TOL, 1_501);
    }

    /// F-S24-01's shape: a stop-loss on the cheap side. Fair Down is ~41¢, so 15 % of it is ~6.2¢, and the house's bid
    /// sits 6.4¢ under fair (a widened half spread). The share alone refuses the sale at that bid; a 10¢ slack clears
    /// it, and the owner is paid the bid, not the floor.
    function test_theSlackLetsACheapSideClearAWidenedBid() public {
        book(market, 1, true);
        vm.prank(owner);
        v2.place(market, 1, true, 500_000, 10 * ONE, EXPIRE_NS);
        uint256 no = v2.outcomeId(market, 1);
        assertEq(v2.positionOf(owner, no), 10 * ONE);
        bytes memory p = proof(BOOK_SPOT_E8);

        uint256 fair = v2.exitFloorRaw(grantExit(bytes32(0), 0, 0), market, 1, p);
        assertGt(fair, 380_000, "Down is the cheap side");
        assertLt(fair, 440_000);
        // The house's Down bid 6.4¢ under fair: a YES ask, rounded up onto the 0.1¢ grid (the Down bid rounds down).
        uint256 tickBase = lens.marketRef(market).tickBase;
        uint16 askTicks = uint16((ONE - (fair - 64_000) + tickBase - 1) / tickBase);
        seed(market, true, askTicks, BOOK_DEPTH);
        uint256 bid = ONE - uint256(askTicks) * tickBase;

        uint256 shareOnly = grantExit(bytes32(0), 1_500, 0);
        uint256 strict = v2.exitFloorRaw(shareOnly, market, 1, p);
        assertGt(strict, bid, "15 % of a cheap side is inside the widened spread");
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(VaultExits.BelowFairFloor.selector, bid, strict));
        v2.exitFor(shareOnly, market, 1, ONE - bid, 10 * ONE, EXPIRE_NS, p);

        uint256 slacked = grantExit(bytes32(0), 1_500, 1_000);
        uint256 floor = v2.exitFloorRaw(slacked, market, 1, p);
        assertEq(floor, fair - 100_000, "10c is wider than 15 % of ~41c");
        uint256 before = v2.accountOf(owner).available;
        vm.prank(keeper);
        // The keeper's limit: the floor rounded UP onto the grid in the side's own terms (YES rounds down).
        uint256 limitSide = (floor + tickBase - 1) / tickBase * tickBase;
        (uint256 cash, uint256 sold) = v2.exitFor(slacked, market, 1, ONE - limitSide, 10 * ONE, EXPIRE_NS, p);
        assertEq(sold, 10 * ONE);
        assertEq(cash, 10 * bid, "filled at the house's bid, above the floor");
        assertEq(v2.accountOf(owner).available, before + cash);
        assertEq(v2.positionOf(owner, no), 0);
    }

    /// On a dear side the share is the wider allowance, so the slack changes nothing there.
    function test_onADearSideTheShareStillRules() public {
        bytes memory p = proof(BOOK_SPOT_E8);
        uint256 fair = v2.exitFloorRaw(grantExit(bytes32(0), 0, 0), market, 0, p);
        uint256 id = grantExit(bytes32(0), 2_000, 1_000);
        assertEq(v2.exitFloorRaw(id, market, 0, p), fair - fair * 2_000 / 10_000, "20 % of ~59c is wider than 10c");
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

    /// The floor is the side's fair value less the wider of the two allowances, never under zero, on either side.
    function testFuzz_theFloorIsFairLessTheWiderAllowance(uint16 tol, uint16 slack, bool down, bool crashed) public {
        tol = uint16(bound(tol, 0, 2_000));
        slack = uint16(bound(slack, 0, 1_500));
        uint8 side = down ? 1 : 0;
        bytes memory p = proof(crashed ? CRASH_SPOT_E8 : BOOK_SPOT_E8);
        uint256 fair = v2.exitFloorRaw(grantExit(bytes32(0), 0, 0), market, side, p);
        uint256 share = fair * tol / 10_000;
        uint256 abs_ = ONE * slack / 10_000;
        uint256 under = share > abs_ ? share : abs_;
        uint256 floor = v2.exitFloorRaw(grantExit(bytes32(0), tol, slack), market, side, p);
        assertEq(floor, fair > under ? fair - under : 0);
        assertLe(floor, fair);
    }

    /// Whatever limit and size the keeper sends, a sale either reverts or pays the owner at least the floor for every
    /// contract sold, and nothing reaches the keeper.
    function testFuzz_aSalePaysTheOwnerAtLeastTheFloor(uint256 priceRaw, uint256 quantity, uint16 slack) public {
        priceRaw = bound(priceRaw, 1, ONE - 1);
        quantity = bound(quantity, 1, 10) * ONE;
        uint256 id = grantExit(bytes32(0), TOL, uint16(bound(slack, 0, 1_500)));
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
