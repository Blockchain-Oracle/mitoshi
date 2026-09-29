// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {Payouts, PayoutCheck} from "../../../src/products/shared/Payouts.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

/// Tap-trading (L-27, Masayume's mechanism ported as-is): the owner arms a SESSION grant in one self-paid
/// `depositAndGrant`; the browser's session-key account then taps `placeFor` (relay-sponsored in production — the
/// sender is still the key, D-003); caps refuse with a named reason; renew replaces the grant; revoke ends it; anyone
/// cranks the settled Window into the owner's balance; the owner withdraws part of it. The key never holds collateral.
contract EventVaultSessionTest is VaultTestBase {
    uint256 internal constant SESSION_PK = 0x5E551011;

    function test_sessionKeyTapFlow() public {
        address key = vm.addr(SESSION_PK);
        uint64 sixHours = uint64(vm.getBlockTimestamp() + 6 hours);
        // arm: one self-paid tx — deposit 100, allow 25 for the session (5 per tap, 25 per day, 3 open sides)
        vm.prank(owner);
        uint256 id = vault.depositAndGrant(100 * ONE, IEventVault.GrantKind.SESSION, key, caps(5 * ONE, 25 * ONE, 3, 0), sixHours, 25 * ONE);
        assertEq(vault.activeGrantOf(owner, IEventVault.GrantKind.SESSION), id);
        assertEq(available(owner), 75 * ONE);

        // taps: Up, Up, Down — no owner signature, each a sponsored placeFor from the key
        (uint256 s1,) = placeForAs(id, market, 0, true, 650_000, 5 * ONE); // 3.00
        (uint256 s2,) = placeForAs(id, market, 0, true, 650_000, 5 * ONE); // 3.00
        (uint256 s3,) = placeForAs(id, market, 1, true, 500_000, 5 * ONE); // 2.00
        assertEq(s1 + s2 + s3, 8 * ONE);
        IEventVault.Grant memory g = vault.grantOf(id);
        assertEq(g.budget, 17 * ONE, "25 - 8 spent = 17 left");
        assertEq(g.spentToday, 8 * ONE);
        assertEq(g.openPositions, 2);

        // a cap refusal carries its reason (the UI shows it, never a surprise prompt)
        book(market, 0, true);
        vm.prank(key);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.OverStakeCap.selector, 6 * ONE, uint128(5 * ONE)));
        vault.placeFor(id, market, 0, true, 650_000, 10 * ONE, EXPIRE_NS);

        // extend + add to budget: a renewed grant replaces the old one; its unspent budget returns first
        uint64 later = uint64(vm.getBlockTimestamp() + 24 hours);
        vm.prank(owner);
        uint256 renewed = vault.grant(IEventVault.GrantKind.SESSION, key, caps(5 * ONE, 25 * ONE, 3, 0), later, 25 * ONE);
        assertTrue(vault.grantOf(id).revoked);
        assertEq(available(owner), 75 * ONE + 17 * ONE - 25 * ONE);
        vm.prank(key);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantIsRevoked.selector, id));
        vault.placeFor(id, market, 0, true, 650_000, ONE, EXPIRE_NS);
        placeForAs(renewed, market, 0, true, 650_000, 5 * ONE);

        // revoke-all: the key is dead, the rest of the budget is the owner's again
        vm.prank(owner);
        vault.revoke(renewed);
        vm.prank(key);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantIsRevoked.selector, renewed));
        vault.placeFor(renewed, market, 0, true, 650_000, ONE, EXPIRE_NS);
        assertEq(available(owner), 75 * ONE + 17 * ONE - 3 * ONE);

        // the Window settles Up; a keeper (the settler) cranks it into the owner's balance
        resolveMarket(market, 0);
        vm.prank(stranger);
        assertEq(vault.crankSettle(owner, market), 15 * ONE, "15 Up paid one each; 5 Down paid zero");
        assertEq(available(owner), 89 * ONE + 15 * ONE);

        // partial withdraw to the owner's own wallet
        uint256 wallet = usd.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(40 * ONE);
        assertEq(usd.balanceOf(owner), wallet + 40 * ONE);
        assertEq(usd.balanceOf(key), 0, "the session key never held collateral");
        assertEq(usd.balanceOf(stranger), 0);
        address[] memory owners = new address[](1);
        owners[0] = owner;
        bytes32[] memory mks = new bytes32[](1);
        mks[0] = market;
        assertVaultSolvent(owners, mks);
    }
}

contract PayoutsHarness is Payouts {
    IERC20 internal immutable _token;

    constructor(IERC20 token) {
        _token = token;
    }

    function _payoutToken() internal view override returns (IERC20) {
        return _token;
    }

    function pay(address to, uint256 amount) external returns (bool) {
        return _payOrOwe(to, amount);
    }
}

/// `Payouts._payOrOwe` (D-014): a payout someone else triggers never strands in the receive-policy guard.
contract PayoutsTest is VaultTestBase {
    function test_payOrOwe_heldWhileBlockedThenClaimed() public {
        PayoutsHarness p = new PayoutsHarness(IERC20(address(usd)));
        usd.mint(address(p), 100);
        assertTrue(p.pay(owner, 10));
        vm.prank(owner);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, owner);
        uint256 before = usd.balanceOf(owner);
        assertFalse(p.pay(owner, 30), "held, not sent into the guard");
        assertEq(usd.balanceOf(owner), before);
        assertEq(p.owedOf(owner), 30);
        assertEq(p.totalOwedPayouts(), 30);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, owner));
        p.claimOwed();
        vm.prank(owner);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, owner);
        vm.prank(stranger);
        vm.expectRevert(Payouts.NothingOwed.selector);
        p.claimOwed(); // pays msg.sender only: a stranger has nothing to claim
        vm.prank(owner);
        assertEq(p.claimOwed(), 30);
        assertEq(usd.balanceOf(owner), before + 30);
        assertEq(p.totalOwedPayouts(), 0);
    }
}
