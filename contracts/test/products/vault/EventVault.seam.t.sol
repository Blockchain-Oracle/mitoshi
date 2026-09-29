// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../src/engine/interfaces/IEngineLens.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {EngineSeam} from "../../../src/products/shared/EngineSeam.sol";
import {EventVault} from "../../../src/products/vault/EventVault.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {LyingEngine} from "../harness/LyingEngine.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

/// The S7 seam edits (A.4.1) and the fixes carried from Agari (D-062, D-091), proven on the real engine; the
/// accounting assert proven against the `LyingEngine` fault injector (A.6).
contract EventVaultSeamTest is VaultTestBase {
    function setUp() public override {
        super.setUp();
        depositAs(owner, DEPOSIT);
    }

    // --- constructor pins (A.4 shared) ---

    function test_constructor_pinsCollateralLensApprovalAndCrankOptOut() public {
        assertEq(address(vault.engine()), address(engine));
        assertEq(address(vault.lens()), address(lens));
        assertEq(address(vault.collateral()), address(usd));
        assertEq(vault.one(), 1e6);
        assertEq(usd.allowance(address(vault), address(engine)), type(uint256).max, "approved once");
        assertTrue(lens.crankOptedOut(address(vault)), "D-015");

        IERC20 other = IERC20(address(new LyingEngine(IERC20(address(0xBEEF)))));
        vm.expectRevert(abi.encodeWithSelector(IEventVault.WrongCollateral.selector, address(usd)));
        new EventVault(other, IEventsEngine(address(engine)), lens);
        EngineLens foreign = new EngineLens(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(IEventVault.WrongLens.selector, address(foreign)));
        new EventVault(IERC20(address(usd)), IEventsEngine(address(engine)), foreign);
    }

    function test_unknownMarketAndBadOutcomeRefused() public {
        bytes32 nope = keccak256("no such window");
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.UnknownMarket.selector, nope));
        vault.place(nope, 0, true, 600_000, ONE, EXPIRE_NS);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.BadOutcome.selector, uint8(2)));
        vault.place(market, 2, true, 600_000, ONE, EXPIRE_NS);
        vm.stopPrank();
        assertEq(vault.outcomeId(market, 1), uint256(keccak256(abi.encode(market, uint8(1)))));
    }

    /// @dev A.2.7: raw DreamDEX units convert exactly or not at all.
    function test_offGridRefused() public {
        book(market, 0, true);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(EngineSeam.OffGrid.selector, uint256(600_500), uint64(1000)));
        vault.place(market, 0, true, 600_500, ONE, EXPIRE_NS);
        vm.expectRevert(abi.encodeWithSelector(EngineSeam.OffGrid.selector, ONE + 1, uint64(1000)));
        vault.place(market, 0, true, 700_000, ONE + 1, EXPIRE_NS);
        vm.stopPrank();
    }

    /// @dev `expireNs` converts to seconds and clamps to `lockAt` (T08); an expiry already past refuses in the engine.
    function test_expireNsConvertsAndClampsToLockAt() public {
        book(market, 0, true);
        vm.prank(owner);
        vault.place(market, 0, true, 700_000, ONE, uint64(block.timestamp + 5) * 1e9); // within the Window
        vm.prank(owner);
        vault.place(market, 0, true, 700_000, ONE, type(uint64).max); // far future → lockAt
        vm.prank(owner);
        vm.expectRevert(bytes4(keccak256("OrderAlreadyExpired()")));
        vault.place(market, 0, true, 700_000, ONE, uint64(block.timestamp) * 1e9);
        assertEq(vault.positionOf(owner, yesOf(market)), 2 * ONE);
    }

    function test_sweep_isPermissionlessAndMovesOnlyTheVaultsCredit() public {
        LyingEngine lying = new LyingEngine(IERC20(address(usd)));
        EventVault v = new EventVault(IERC20(address(usd)), IEventsEngine(address(lying)), IEngineLens(address(lying)));
        assertEq(v.sweep(market), 0, "nothing to sweep");
        // a credit only the venue can create (the real engine never leaves the vault one: IOC + withdrawProceeds)
        usd.mint(address(lying), 5);
        vm.store(address(lying), keccak256(abi.encode(address(v), uint256(1))), bytes32(uint256(5)));
        assertEq(lying.creditOf(market, address(v)), 5, "slot");
        vm.prank(stranger);
        assertEq(v.sweep(market), 5);
        assertEq(usd.balanceOf(address(v)), 5);
        assertEq(usd.balanceOf(stranger), 0);
    }

    // --- D-062: churn must not leak a grant's open-position count ---

    function test_D062_churnDoesNotLeakOpenPositions() public {
        uint256 id = grantStrategy(500 * ONE, caps(50 * ONE, 500 * ONE, 1, 0));
        placeForAs(id, market, 0, true, 700_000, 10 * ONE);
        assertEq(vault.grantOf(id).openPositions, 1);
        placeForAs(id, market, 0, false, 500_000, 4 * ONE); // partly sold: still open
        assertEq(vault.grantOf(id).openPositions, 1);
        placeForAs(id, market, 0, false, 500_000, 6 * ONE); // sold to zero: released
        assertEq(vault.grantOf(id).openPositions, 0, "Masayume kept 1 here and leaked it");
        assertEq(vault.positionGrantOf(owner, yesOf(market)), 0);
        placeForAs(id, market, 1, true, 500_000, 10 * ONE); // the cap of 1 admits the next side
        assertEq(vault.grantOf(id).openPositions, 1);

        // the owner selling a grant-opened side to zero releases it too
        placeAs(owner, market, 1, false, 700_000, 10 * ONE);
        assertEq(vault.grantOf(id).openPositions, 0);
        placeForAs(id, market, 0, true, 700_000, 10 * ONE);

        resolveMarket(market, 0);
        vault.crankSettle(owner, market);
        assertEq(vault.grantOf(id).openPositions, 0, "settlement closes what is left");
        vm.expectRevert(IEventVault.NothingToSettle.selector);
        vault.crankSettle(owner, market);
    }

    /// @dev D-062's settle half: a tag left on an emptied side (a grant-opened side whose tokens are gone) is released
    ///      by the crank at a zero payout instead of reverting `NothingToSettle` and leaking.
    function test_D062_crankReleasesAnEmptiedSide() public {
        uint256 id = grantStrategy(500 * ONE, caps(50 * ONE, 500 * ONE, 1, 0));
        placeForAs(id, market, 0, true, 700_000, 10 * ONE);
        resolveMarket(market, 0);
        // the tag survives with no tokens only through a storage write — forge the leak state Masayume could reach
        bytes32 slot = _positionOfSlot(owner, yesOf(market));
        vm.store(address(vault), slot, bytes32(0));
        vm.prank(stranger);
        assertEq(vault.crankSettle(owner, market), 0);
        assertEq(vault.grantOf(id).openPositions, 0);
        assertEq(vault.positionGrantOf(owner, yesOf(market)), 0);
    }

    function _positionOfSlot(address who_, uint256 id) internal returns (bytes32 slot) {
        vm.record();
        vault.positionOf(who_, id);
        (bytes32[] memory reads,) = vm.accesses(address(vault));
        slot = reads[reads.length - 1];
    }

    // --- D-091: a grant scoped to one Window acts nowhere else ---

    function test_D091_grantMarketScope() public {
        bytes32 other = list(START, LOCK, true);
        vm.prank(owner);
        uint256 id = vault.grant(IEventVault.GrantKind.EXECUTOR, actor, capsIn(50 * ONE, 500 * ONE, 4, 0, market), uint64(block.timestamp + 1 hours), 200 * ONE);
        assertEq(vault.grantOf(id).caps.market, market);
        placeForAs(id, market, 0, true, 700_000, 10 * ONE);

        book(other, 0, true);
        vm.startPrank(actor);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OutsideGrantMarket.selector, id, other));
        vault.placeFor(id, other, 0, true, 700_000, 10 * ONE, EXPIRE_NS);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OutsideGrantMarket.selector, id, other));
        vault.placeFor(id, other, 0, false, 500_000, 1 * ONE, EXPIRE_NS); // sells too
        vm.stopPrank();

        // an unscoped grant (market 0) acts in any Window
        vm.prank(owner);
        uint256 any = vault.grant(IEventVault.GrantKind.STRATEGY, actor, caps(50 * ONE, 500 * ONE, 4, 0), uint64(block.timestamp + 1 hours), 100 * ONE);
        placeForAs(any, other, 0, true, 700_000, 10 * ONE);
        assertEq(vault.positionOf(owner, yesOf(other)), 10 * ONE);
    }

    // --- the accounting assert against a lying venue ---

    function test_engineAccountingMismatch() public {
        LyingEngine lying = new LyingEngine(IERC20(address(usd)));
        usd.mint(address(lying), 1_000 * ONE);
        EventVault v = new EventVault(IERC20(address(usd)), IEventsEngine(address(lying)), IEngineLens(address(lying)));
        assertTrue(lying.optedOut(), "D-015 on any engine");
        vm.startPrank(owner);
        usd.approve(address(v), type(uint256).max);
        v.deposit(DEPOSIT);
        // honest: the injector is a faithful venue until it lies
        (uint256 spent, uint256 gained) = v.place(market, 0, true, 600_000, 10 * ONE, EXPIRE_NS);
        assertEq(spent, 6 * ONE);
        assertEq(gained, 10 * ONE);
        vm.stopPrank();

        LyingEngine.Lie[6] memory buys = [
            LyingEngine.Lie.PhantomFill,
            LyingEngine.Lie.OverPull,
            LyingEngine.Lie.Rested,
            LyingEngine.Lie.WithdrawOnBuy,
            LyingEngine.Lie.CreditDrift,
            LyingEngine.Lie.None
        ];
        for (uint256 i; i < 5; ++i) {
            lying.setLie(buys[i]);
            vm.prank(owner);
            vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
            v.place(market, 1, true, 600_000, 10 * ONE, EXPIRE_NS);
        }
        lying.setLie(LyingEngine.Lie.ShortPay);
        vm.prank(owner);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        v.place(market, 0, false, 600_000, 5 * ONE, EXPIRE_NS);
        assertEq(v.accountOf(owner).available, DEPOSIT - 6 * ONE, "nothing booked by any lie");
        assertEq(v.positionOf(owner, v.outcomeId(market, 0)), 10 * ONE);

        lying.setStatus(4);
        lying.setLie(LyingEngine.Lie.RedeemShort);
        vm.expectRevert(EngineSeam.EngineAccountingMismatch.selector);
        v.crankSettle(owner, market);
        lying.setLie(LyingEngine.Lie.None);
        assertEq(v.crankSettle(owner, market), 10 * ONE);
    }
}
