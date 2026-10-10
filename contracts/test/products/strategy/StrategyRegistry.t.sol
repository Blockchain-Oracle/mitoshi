// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/StrategyRegistry.t.sol — the same ten checks on EventVaultV2 over the
// real engine, plus the S9 tests (docs/specs/engine.md §S9): fee guard, fade consent, SSTORE2 metadata, the envelope's
// market scope and the creator's receive policy.

import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IStrategyRegistry} from "../../../src/products/strategy/IStrategyRegistry.sol";
import {StrategyTestBase} from "../harness/StrategyTestBase.sol";

/// @notice Consent is a live grant, the fee is the only money the registry ever moves, and nothing here can reach a
///         subscriber's balance.
contract StrategyRegistryTest is StrategyTestBase {
    function test_publish_recordsTheStrategy() public view {
        IStrategyRegistry.Strategy memory s = registry.strategyOf(strategyId);
        assertEq(s.creator, creator);
        assertEq(s.runner, runner);
        assertTrue(s.active);
        assertEq(s.subscriptionFee, FEE);
        assertEq(s.agentId, 0);
        assertEq(registry.strategyCount(), 1);
    }

    function test_publish_refusesEmptyEnvelopeOrRunner() public {
        vm.startPrank(creator);
        vm.expectRevert(IStrategyRegistry.ZeroRunner.selector);
        registry.publish(address(0), bytes32(0), "", caps(1, 1, 1, 0), 0, 0);
        vm.expectRevert(IStrategyRegistry.BadEnvelope.selector);
        registry.publish(runner, bytes32(0), "", caps(0, 1, 1, 0), 0, 0);
        vm.stopPrank();
    }

    function test_subscribe_withLiveGrantInsideEnvelope_paysFeeToCreator() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        uint256 creatorBefore = usd.balanceOf(creator);
        subscribeAs(owner, grantId);
        IStrategyRegistry.Subscription memory sub = registry.subscriptionOf(strategyId, owner);
        assertTrue(sub.active);
        assertEq(sub.grantId, grantId);
        assertEq(uint8(sub.mode), uint8(IStrategyRegistry.Mode.FOLLOW));
        assertEq(registry.strategyOf(strategyId).subscribers, 1);
        assertEq(usd.balanceOf(creator), creatorBefore + FEE, "the fee reaches the creator");
        assertEq(usd.balanceOf(address(registry)), 0, "the registry holds nothing");
        assertTrue(registry.isSubscriptionLive(strategyId, owner));
        assertEq(registry.subscribersOf(strategyId, 0, 10)[0], owner);
    }

    function test_subscribe_refusesSomeoneElsesGrant() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotGrantOwner.selector, grantId, stranger));
        subscribeAs(stranger, grantId);
    }

    function test_subscribe_refusesWrongKindActorOrDeadGrant() public {
        vm.prank(owner);
        uint256 sessionGrant = vault.grant(IEventVault.GrantKind.SESSION, runner, caps(1 * ONE, 1 * ONE, 1, 0), uint64(block.timestamp + 1 days), 0);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.WrongGrantKind.selector, sessionGrant));
        subscribeAs(owner, sessionGrant);

        uint256 wrongActor = grantTo(stranger, caps(20 * ONE, 100 * ONE, 2, 0), 10 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.WrongActor.selector, wrongActor, runner, stranger));
        subscribeAs(owner, wrongActor);

        uint256 revoked = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 10 * ONE);
        vm.prank(owner);
        vault.revoke(revoked);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.GrantNotLive.selector, revoked));
        subscribeAs(owner, revoked);
    }

    function test_subscribe_refusesCapsOutsideEnvelope() public {
        uint256 tooBig = grantTo(runner, caps(60 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.CapsOutsideEnvelope.selector, tooBig));
        subscribeAs(owner, tooBig);
    }

    function test_unsubscribe_andRevokedGrantEndsLiveness() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        subscribeAs(owner, grantId);
        vm.prank(owner);
        vault.revoke(grantId);
        assertFalse(registry.isSubscriptionLive(strategyId, owner), "a revoked grant is not a live subscription");
        vm.prank(owner);
        registry.unsubscribe(strategyId);
        assertEq(registry.strategyOf(strategyId).subscribers, 0);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotSubscribed.selector, strategyId, owner));
        registry.unsubscribe(strategyId);
    }

    function test_creatorOnly_update_setRunner_deactivate() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotCreator.selector, strategyId, stranger));
        registry.update(strategyId, bytes32(0), "", 0);
        vm.startPrank(creator);
        registry.update(strategyId, keccak256("v2"), "{}", 0);
        assertEq(registry.strategyOf(strategyId).revision, 1);
        registry.setRunner(strategyId, stranger);
        registry.deactivate(strategyId);
        vm.stopPrank();
        uint256 grantId = grantTo(stranger, caps(20 * ONE, 100 * ONE, 2, 0), 10 * ONE);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.StrategyInactive.selector, strategyId));
        subscribeAs(owner, grantId);
    }

    /// @dev The runner trades the subscriber's grant on the vault; the registry is never in the money path.
    function test_AD5_registry_never_touches_subscriber_funds() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        subscribeAs(owner, grantId);
        placeForAs(grantId, market, 0, true, 700_000, 20 * ONE);
        assertEq(vault.positionOf(owner, yesOf(market)), 20 * ONE, "the position is the subscriber's");
        assertEq(usd.balanceOf(address(registry)), 0);
        assertEq(usd.balanceOf(runner), 0);
    }

    /// @dev AD-10's spirit on the engine: no venue address lands in the registry's storage.
    function test_AD10_no_venue_address_in_storage() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.record();
        subscribeAs(owner, grantId);
        (, bytes32[] memory writes) = vm.accesses(address(registry));
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 v = vm.load(address(registry), writes[i]);
            assertTrue(v != bytes32(uint256(uint160(address(engine)))) && v != bytes32(uint256(uint160(address(lens)))), "venue address persisted");
        }
    }

    // ------------------------------------------------------------------ S9 (A.4.8)

    function test_feeAboveMax() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.FeeAboveMax.selector, strategyId, FEE, FEE - 1));
        registry.subscribe(strategyId, grantId, IStrategyRegistry.Mode.FOLLOW, FEE - 1);
        // A creator who raises the fee after the subscriber read it can't take more than the subscriber allowed.
        vm.prank(creator);
        registry.update(strategyId, keccak256("momentum:6:20"), "", uint128(5 * ONE));
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.FeeAboveMax.selector, strategyId, uint128(5 * ONE), FEE));
        subscribeAs(owner, grantId);
    }

    function test_feeOnlyWhenTheSubscriptionStarts() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        subscribeAs(owner, grantId);
        uint256 creatorAfterFirst = usd.balanceOf(creator);
        // A fresh grant replaces the first (one live STRATEGY grant per owner); moving the subscription onto it is free.
        uint256 next = grantTo(runner, caps(10 * ONE, 50 * ONE, 1, 0), 50 * ONE);
        vm.prank(owner);
        registry.subscribe(strategyId, next, IStrategyRegistry.Mode.FOLLOW, 0);
        assertEq(usd.balanceOf(creator), creatorAfterFirst, "no second fee");
        assertEq(registry.subscriptionOf(strategyId, owner).grantId, next);
        assertEq(registry.strategyOf(strategyId).subscribers, 1);
        assertTrue(registry.isSubscriptionLive(strategyId, owner));
    }

    function test_fadeConsent() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.expectEmit(address(registry));
        emit IStrategyRegistry.Subscribed(strategyId, owner, grantId, IStrategyRegistry.Mode.FADE, FEE, 1);
        vm.prank(owner);
        registry.subscribe(strategyId, grantId, IStrategyRegistry.Mode.FADE, FEE);
        assertEq(uint8(registry.subscriptionOf(strategyId, owner).mode), uint8(IStrategyRegistry.Mode.FADE), "the consent is to fade");
        assertTrue(registry.isSubscriptionLive(strategyId, owner), "a fade is as live as a follow");
        // Switching back to follow is the subscriber's own call, with no new fee.
        vm.prank(owner);
        registry.subscribe(strategyId, grantId, IStrategyRegistry.Mode.FOLLOW, 0);
        assertEq(uint8(registry.subscriptionOf(strategyId, owner).mode), uint8(IStrategyRegistry.Mode.FOLLOW));
        assertEq(registry.strategyOf(strategyId).subscribers, 1);
    }

    function test_metadataSstore2RoundTrip() public {
        IStrategyRegistry.Strategy memory s = registry.strategyOf(strategyId);
        assertEq(registry.metadataOf(strategyId), META);
        assertEq(s.metadataHash, keccak256(META));
        assertGt(s.metadataPointer.code.length, META.length, "stored as code, not slots");
        bytes memory next = bytes(string.concat('{"name":"Oracle follow","persona":"', _repeat("calm ", 300), '"}'));
        vm.prank(creator);
        registry.update(strategyId, keccak256("v2"), next, FEE);
        assertEq(registry.metadataOf(strategyId), next);
        assertEq(registry.strategyOf(strategyId).metadataHash, keccak256(next));
        vm.prank(creator);
        registry.update(strategyId, keccak256("v3"), "", FEE);
        assertEq(registry.metadataOf(strategyId).length, 0);
        assertEq(registry.strategyOf(strategyId).metadataPointer, address(0));
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.MetadataTooLarge.selector, uint256(8_193)));
        registry.update(strategyId, keccak256("v4"), new bytes(8_193), FEE);
    }

    function test_envelopeMarketScope() public {
        bytes32 series = lens.marketRef(market).seriesId;
        vm.prank(creator);
        uint256 scoped = registry.publish(runner, keccak256("btc-only"), "", capsIn(50 * ONE, 200 * ONE, 3, 0, series), 0, 0);
        bytes32 other = list(START, LOCK, true);
        assertTrue(registry.inScope(scoped, market));
        assertFalse(registry.inScope(scoped, other), "another series is out of scope");
        assertTrue(registry.inScope(strategyId, other), "an any-Window strategy trades anything");

        uint256 pinnedElsewhere = grantTo(runner, capsIn(20 * ONE, 100 * ONE, 2, 0, other), 10 * ONE);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.OutsideEnvelopeMarket.selector, pinnedElsewhere, other));
        registry.subscribe(scoped, pinnedElsewhere, IStrategyRegistry.Mode.FOLLOW, 0);

        uint256 pinnedHere = grantTo(runner, capsIn(20 * ONE, 100 * ONE, 2, 0, market), 10 * ONE);
        vm.prank(owner);
        registry.subscribe(scoped, pinnedHere, IStrategyRegistry.Mode.FOLLOW, 0);
        // The vault can't pin a grant to a series, only to one Window or any; an any-Window grant is accepted and the
        // runner holds to the series (`inScope`).
        uint256 anyWindow = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 10 * ONE);
        vm.prank(owner);
        registry.subscribe(scoped, anyWindow, IStrategyRegistry.Mode.FOLLOW, 0);
        assertTrue(registry.isSubscriptionLive(scoped, owner));

        vm.prank(creator);
        vm.expectRevert(E.UnknownSeries.selector);
        registry.publish(runner, bytes32(0), "", capsIn(1, 1, 1, 0, keccak256("no such series")), 0, 0);
    }

    function test_feeRecipientBlocked() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        vm.prank(creator);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(0, 1, creator); // policy 0: always reject
        uint256 ownerBefore = usd.balanceOf(owner);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.FeeRecipientBlocked.selector, creator));
        subscribeAs(owner, grantId);
        assertEq(usd.balanceOf(owner), ownerBefore, "the fee never left");

        vm.prank(creator);
        StdPrecompiles.TIP403_REGISTRY.setReceivePolicy(1, 1, creator); // policy 1: always allow
        subscribeAs(owner, grantId);
        assertEq(usd.balanceOf(owner), ownerBefore - FEE);
    }

    function test_grantZeroIsTheCallersActiveStrategyGrant() public {
        uint256 grantId = grantTo(runner, caps(20 * ONE, 100 * ONE, 2, 0), 100 * ONE);
        subscribeAs(owner, 0);
        assertEq(registry.subscriptionOf(strategyId, owner).grantId, grantId);
        // With no active STRATEGY grant there is nothing to read: the vault names grant 0.
        vm.prank(owner);
        vault.revoke(grantId);
        vm.expectRevert(abi.encodeWithSelector(IEventVault.NoSuchGrant.selector, uint256(0)));
        subscribeAs(owner, 0);
    }

    function test_agentIdNeedsAnIdentityRegistry() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotAgentOwner.selector, uint256(6), creator));
        registry.publish(runner, bytes32(0), "", caps(1, 1, 1, 0), 0, 6);
    }

    function _repeat(string memory s, uint256 n) internal pure returns (string memory out) {
        for (uint256 i; i < n; ++i) out = string.concat(out, s);
    }
}
