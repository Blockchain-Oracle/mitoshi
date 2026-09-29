// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {PositionView} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {IEventVault} from "../../../../src/products/vault/IEventVault.sol";
import {VaultTestBase} from "../../harness/VaultTestBase.sol";
import {VaultHandler} from "./VaultHandler.sol";

/// The vault's two invariants over random sequences on the real engine (S7 test list):
/// - `invariant_vaultPositionsMatchEngine`: per market and side, Σ owners' `positionOf` == the vault's free lots in
///   the engine × lotBase, and the vault never rests (no locked lots, escrow or open orders);
/// - `invariant_vaultWalletConservation`: wallet + engine credit == Σ owners' available + private + Σ grant budgets,
///   as an equality (no donations in the handler), plus the engine's own exact conservation over every holder.
/// `afterInvariant` settles both Windows (one Up, one void), cranks every owner, revokes every grant and withdraws
/// everything: the vault must end holding exactly nothing, in the engine and in its wallet.
/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 250
contract VaultInvariantsTest is VaultTestBase {
    VaultHandler internal handler;
    bytes32 internal market2;
    address[] internal owners;
    bytes32[] internal mks;

    function setUp() public override {
        super.setUp();
        market2 = list(START, LOCK, true);
        mks.push(market);
        mks.push(market2);
        for (uint256 i = 1; i <= 4; ++i) {
            address o = who(i);
            owners.push(o);
            vm.startPrank(o);
            usd.approve(address(vault), type(uint256).max);
            vault.deposit(1_000 * ONE);
            vm.stopPrank();
        }
        handler = new VaultHandler(vault, IEventsEngine(address(engine)), lens, who(MAKER), owners, mks, LOCK);
        for (uint256 i; i < owners.length; ++i) handler.grant(i, 300 * ONE, 40 * ONE, 3, i); // a live session each
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = VaultHandler.step.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_vaultPositionsMatchEngine() public view {
        for (uint256 k; k < mks.length; ++k) {
            uint256 yes;
            uint256 no;
            for (uint256 i; i < owners.length; ++i) {
                yes += vault.positionOf(owners[i], vault.outcomeId(mks[k], 0));
                no += vault.positionOf(owners[i], vault.outcomeId(mks[k], 1));
            }
            PositionView memory p = lens.positionOf(mks[k], address(vault));
            assertEq(yes, uint256(p.yesFree) * 1000, "YES: owners' books == the vault's engine lots");
            assertEq(no, uint256(p.noFree) * 1000, "NO: owners' books == the vault's engine lots");
            assertEq(p.yesLocked + p.noLocked + p.lockedCash + p.openOrders, 0, "the vault never rests");
        }
    }

    function invariant_vaultWalletConservation() public {
        assertVaultSolvent(owners, mks);
        assertConserved();
    }

    function afterInvariant() public {
        emit log_named_uint("vault calls that succeeded", handler.fills());
        emit log_named_uint("vault calls refused", handler.refusals());
        emit log_named_uint("trades filled on the engine", handler.trades());
        resolveMarket(market, 0); // Up, by a real close print
        vm.warp(uint256(LOCK) + 901); // market2 missed its close: anyone voids it
        engine.voidExpired(market2);
        for (uint256 k; k < mks.length; ++k) {
            for (uint256 i; i < owners.length; ++i) {
                try vault.crankSettle(owners[i], mks[k]) {} catch {}
                assertEq(vault.positionOf(owners[i], vault.outcomeId(mks[k], 0)), 0);
                assertEq(vault.positionOf(owners[i], vault.outcomeId(mks[k], 1)), 0);
            }
            PositionView memory p = lens.positionOf(mks[k], address(vault));
            assertEq(p.yesFree + p.noFree, 0, "every lot the vault held was redeemed");
        }
        for (uint256 g = 1; g <= vault.grantCount(); ++g) {
            IEventVault.Grant memory gr = vault.grantOf(g);
            assertEq(gr.openPositions, 0, "D-062: settlement leaves no open position counted");
            if (!gr.revoked) {
                vm.prank(gr.owner);
                vault.revoke(g);
            }
        }
        assertVaultSolvent(owners, mks);
        for (uint256 i; i < owners.length; ++i) {
            IEventVault.Account memory a = vault.accountOf(owners[i]);
            vm.startPrank(owners[i]);
            if (a.available != 0) vault.withdraw(a.available);
            if (a.privateAvailable != 0) vault.withdrawPrivate(a.privateAvailable);
            vm.stopPrank();
        }
        assertEq(usd.balanceOf(address(vault)), 0, "the vault ends holding exactly nothing");
        assertConserved();
    }
}
