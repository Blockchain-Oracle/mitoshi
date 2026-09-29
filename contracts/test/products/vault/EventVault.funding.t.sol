// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/EventVault.funding.t.sol — against the real engine. The two ERC-2771
// tests go with the forwarder (D-003); in their place `test_msgSenderIsOwner_noForwarder` proves a relay appending a
// signer's address acts only as itself, and the P12 tests prove withdrawals pre-check the receive policy.

import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {PayoutCheck} from "../../../src/products/shared/Payouts.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

contract EventVaultFundingTest is VaultTestBase {
    function test_deposit_withdraw_roundTrip() public {
        depositAs(owner, DEPOSIT);
        assertEq(available(owner), DEPOSIT);
        vm.prank(owner);
        vault.withdraw(400 * ONE);
        assertEq(available(owner), 600 * ONE);
        assertEq(usd.balanceOf(owner), 10_000 * ONE - 600 * ONE);
        IEventVault.Account memory a = vault.accountOf(owner);
        assertEq(a.totalDeposited, DEPOSIT);
        assertEq(a.totalWithdrawn, 400 * ONE);
    }

    function test_withdraw_refusesMoreThanAvailable() public {
        depositAs(owner, DEPOSIT);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.Insufficient.selector, DEPOSIT + 1, DEPOSIT));
        vault.withdraw(DEPOSIT + 1);
    }

    function test_zeroAmountsRefused() public {
        vm.startPrank(owner);
        vm.expectRevert(IEventVault.ZeroAmount.selector);
        vault.deposit(0);
        vm.expectRevert(IEventVault.ZeroAmount.selector);
        vault.withdraw(0);
        vm.stopPrank();
    }

    function test_privateBucket() public {
        depositAs(owner, DEPOSIT);
        vm.startPrank(owner);
        vault.moveToPrivate(300 * ONE);
        assertEq(available(owner), 700 * ONE);
        assertEq(vault.accountOf(owner).privateAvailable, 300 * ONE);
        vault.withdrawPrivate(300 * ONE);
        vm.stopPrank();
        assertEq(vault.accountOf(owner).privateAvailable, 0);
        assertEq(usd.balanceOf(owner), 10_000 * ONE - 700 * ONE);
    }

    function test_creditFor_pullsFromCaller() public {
        usd.mint(stranger, 50 * ONE);
        vm.startPrank(stranger);
        usd.approve(address(vault), 50 * ONE);
        vault.creditFor(owner, 20 * ONE);
        vault.creditPrivateFor(owner, 30 * ONE);
        vm.stopPrank();
        assertEq(available(owner), 20 * ONE);
        assertEq(vault.accountOf(owner).privateAvailable, 30 * ONE);
        assertEq(usd.balanceOf(stranger), 0);
    }

    function test_grant_movesBudgetAndReplacesPrevious() public {
        depositAs(owner, DEPOSIT);
        uint256 first = grantStrategy(200 * ONE, caps(10 * ONE, 100 * ONE, 5, 0));
        assertEq(available(owner), 800 * ONE);
        uint256 second = grantStrategy(300 * ONE, caps(10 * ONE, 100 * ONE, 5, 0));
        assertEq(second, first + 1);
        assertTrue(vault.grantOf(first).revoked);
        assertEq(vault.grantOf(first).budget, 0);
        assertEq(available(owner), 700 * ONE, "old budget returned before the new one is taken");
        assertEq(vault.activeGrantOf(owner, IEventVault.GrantKind.STRATEGY), second);
    }

    function test_grant_refusesPastExpiryAndZeroActor() public {
        depositAs(owner, DEPOSIT);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.BadExpiry.selector, uint64(block.timestamp)));
        vault.grant(IEventVault.GrantKind.SESSION, actor, caps(1, 1, 1, 0), uint64(block.timestamp), 0);
        vm.expectRevert(IEventVault.ZeroActor.selector);
        vault.grant(IEventVault.GrantKind.SESSION, address(0), caps(1, 1, 1, 0), uint64(block.timestamp + 1), 0);
        vm.stopPrank();
    }

    function test_revoke_returnsBudget_onlyOwner() public {
        depositAs(owner, DEPOSIT);
        uint256 id = grantStrategy(200 * ONE, caps(10 * ONE, 100 * ONE, 5, 0));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.NotGrantOwner.selector, id, stranger));
        vault.revoke(id);
        vm.prank(owner);
        vault.revoke(id);
        assertEq(available(owner), DEPOSIT);
        assertFalse(vault.isGrantLive(id));
    }

    function test_fundGrant_topsUpLiveGrantOnly() public {
        depositAs(owner, DEPOSIT);
        uint256 id = grantStrategy(100 * ONE, caps(10 * ONE, 100 * ONE, 5, 0));
        vm.prank(owner);
        vault.fundGrant(id, 50 * ONE);
        assertEq(vault.grantOf(id).budget, 150 * ONE);
        vm.warp(block.timestamp + 2 days);
        uint64 expiresAt = vault.grantOf(id).expiresAtSec;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.GrantExpired.selector, id, expiresAt));
        vault.fundGrant(id, 1);
    }

    function test_depositAndGrant_isOneTransaction() public {
        vm.prank(owner);
        uint256 id = vault.depositAndGrant(
            500 * ONE, IEventVault.GrantKind.SESSION, actor, caps(5 * ONE, 50 * ONE, 3, 0), uint64(block.timestamp + 1 hours), 200 * ONE
        );
        assertEq(available(owner), 300 * ONE);
        assertEq(vault.grantOf(id).budget, 200 * ONE);
        assertEq(uint8(vault.grantOf(id).kind), uint8(IEventVault.GrantKind.SESSION));
    }

    // --- no forwarder: whoever sends the call is who acts (D-003); our relay sponsors fees, never identity ---

    function test_msgSenderIsOwner_noForwarder() public {
        depositAs(owner, DEPOSIT);
        address relay = makeAddr("relay");
        // ERC-2771 shape: the relay appends the "signer" to the calldata. Without a forwarder it means nothing.
        bytes memory spoof = abi.encodePacked(abi.encodeCall(vault.withdraw, (DEPOSIT)), owner);
        vm.prank(relay);
        (bool ok, bytes memory ret) = address(vault).call(spoof);
        assertFalse(ok, "the relay cannot act for the owner");
        assertEq(bytes4(ret), IEventVault.Insufficient.selector);
        spoof = abi.encodePacked(abi.encodeCall(vault.revoke, (1)), owner);
        vm.prank(relay);
        (ok,) = address(vault).call(spoof);
        assertFalse(ok);
        assertEq(available(owner), DEPOSIT);
        assertEq(usd.balanceOf(relay), 0);

        // The forwarder surface is gone from the ABI.
        (ok,) = address(vault).staticcall(abi.encodeWithSignature("trustedForwarder()"));
        assertFalse(ok, "no trustedForwarder()");
        (ok,) = address(vault).staticcall(abi.encodeWithSignature("isTrustedForwarder(address)", relay));
        assertFalse(ok, "no isTrustedForwarder()");

        // A deposit is always the sender's own capital intake: it pulls from msg.sender only.
        usd.mint(relay, DEPOSIT);
        vm.startPrank(relay);
        usd.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT);
        vm.stopPrank();
        assertEq(available(relay), DEPOSIT, "credited to the sender");
        assertEq(available(owner), DEPOSIT, "never to anyone the calldata names");
    }

    // --- P12: a withdrawal pays msg.sender only after its receive policy says it would arrive ---

    function test_withdraw_receivePolicyBlocked() public {
        depositAs(owner, DEPOSIT);
        vm.startPrank(owner);
        vault.moveToPrivate(100 * ONE);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, owner); // policy 0: always reject
        uint256 walletBefore = usd.balanceOf(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, owner));
        vault.withdraw(400 * ONE);
        vm.expectRevert(abi.encodeWithSelector(PayoutCheck.ReceivePolicyBlocked.selector, owner));
        vault.withdrawPrivate(100 * ONE);
        assertEq(available(owner), 900 * ONE, "nothing left the Trading Balance");
        assertEq(vault.accountOf(owner).privateAvailable, 100 * ONE);
        assertEq(usd.balanceOf(owner), walletBefore);

        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, owner); // policy 1: always allow
        vault.withdraw(400 * ONE);
        vault.withdrawPrivate(100 * ONE);
        vm.stopPrank();
        assertEq(usd.balanceOf(owner), walletBefore + 500 * ONE);
        assertEq(usd.balanceOf(address(vault)), 500 * ONE);
    }
}
